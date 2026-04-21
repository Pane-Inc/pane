// Lock system implementation
import type { Result, Maybe, Unit } from '@deessejs/fp';
import { ok, err, none, some, isSome, unit } from '@deessejs/fp';
import type { LockHandle, AcquireLockOptions, ReleaseLockOptions, RefreshLockOptions, LockFileContent } from './types';
import { FileLockedError, LockWriteError, LockNotFoundError } from '../errors';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as properLockfile from 'proper-lockfile';

const LOCK_DURATION_MS = 15 * 60 * 1000;
const LOCK_SUFFIX = '.lock';

let holderId: Maybe<string> = none();

const generateHolderId = (): string => {
  if (isSome(holderId)) {
    return holderId.value;
  }
  const newId = randomUUID();
  holderId = some(newId);
  return newId;
};

const getLockPath = (filePath: string): string => `${filePath}${LOCK_SUFFIX}`;

const readLockFile = (lockPath: string): Maybe<LockFileContent> => {
  try {
    if (!fs.existsSync(lockPath)) {
      return none();
    }
    const content = fs.readFileSync(lockPath, 'utf-8');
    const parsed = JSON.parse(content) as LockFileContent;
    return some(parsed);
  } catch {
    return none();
  }
};

const writeLockFile = (lockPath: string, content: LockFileContent): Result<Unit, LockWriteError> => {
  try {
    fs.writeFileSync(lockPath, JSON.stringify(content), 'utf-8');
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};

const acquireFileLock = (lockPath: string): Result<Unit, FileLockedError> => {
  try {
    properLockfile.lockSync(lockPath, {
      lockfilePath: lockPath,
      retries: { retries: 3, factor: 1, minTimeout: 100, maxTimeout: 500 },
    });
    return ok(unit);
  } catch {
    return err(FileLockedError({ holderId: 'unknown' }));
  }
};

const releaseFileLock = (lockPath: string): Result<Unit, LockWriteError> => {
  try {
    properLockfile.unlockSync(lockPath, { lockfilePath: lockPath });
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};

const isLockStaleByContent = (content: LockFileContent): boolean => {
  const expiryDate = new Date(content.expiresAt);
  return expiryDate < new Date();
};

const createLockHandle = (
  path: string,
  id: string,
  name: string | undefined
): LockHandle => {
  const now = new Date();
  return {
    path,
    holderId: id,
    holderName: name,
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + LOCK_DURATION_MS),
  };
};

export const acquireLock = (
  options: AcquireLockOptions
): Result<LockHandle, FileLockedError | LockWriteError> => {
  const lockPath = getLockPath(options.path);
  const id = generateHolderId();

  const existingLock = readLockFile(lockPath);
  if (isSome(existingLock)) {
    // Lock file exists - check if it's stale or if the original file was deleted
    const isStale = isLockStaleByContent(existingLock.value);
    const fileExists = fs.existsSync(options.path);

    // If the lock is not stale AND the file still exists, it's genuinely locked
    if (!isStale && fileExists) {
      return err(
        FileLockedError({
          holderId: existingLock.value.holderId,
          holderName: existingLock.value.holderName,
        })
      );
    }

    // Otherwise (stale or file deleted), the lock is orphaned - proceed to overwrite
  }

  const lockResult = acquireFileLock(lockPath);
  if (!ok(lockResult)) {
    return lockResult as Result<LockHandle, FileLockedError | LockWriteError>;
  }

  const lockContent: LockFileContent = {
    holderId: id,
    holderName: options.holderName,
    acquiredAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + LOCK_DURATION_MS).toISOString(),
  };

  const writeResult = writeLockFile(lockPath, lockContent);
  if (!ok(writeResult)) {
    return writeResult as Result<LockHandle, FileLockedError | LockWriteError>;
  }

  return ok(createLockHandle(options.path, id, options.holderName));
};

export const releaseLock = (
  options: ReleaseLockOptions
): Result<Unit, LockWriteError> => {
  const lockPath = getLockPath(options.lock.path);

  // Try to release the OS-level lock
  releaseFileLock(lockPath);

  // Always try to delete the lock file, even if unlock failed
  // The OS lock is released on process exit anyway
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};

export const refreshLock = (
  options: RefreshLockOptions
): Result<LockHandle, LockNotFoundError | LockWriteError> => {
  const lockPath = getLockPath(options.lock.path);

  const lockOpt = readLockFile(lockPath);
  if (!isSome(lockOpt)) {
    return err(LockNotFoundError({}));
  }

  const lockContent = lockOpt.value;
  const newExpiresAt = new Date(Date.now() + LOCK_DURATION_MS);
  const updatedContent: LockFileContent = {
    ...lockContent,
    expiresAt: newExpiresAt.toISOString(),
  };

  const writeResult = writeLockFile(lockPath, updatedContent);
  if (!ok(writeResult)) {
    return writeResult as Result<LockHandle, LockNotFoundError | LockWriteError>;
  }

  return ok({
    ...options.lock,
    expiresAt: new Date(updatedContent.expiresAt),
  });
};

export const isLockStale = (expiresAt: string): Maybe<boolean> => {
  const expiryDate = new Date(expiresAt);
  if (isNaN(expiryDate.getTime())) {
    return none();
  }
  return some(expiryDate < new Date());
};

export const checkLockStatus = (
  filePath: string
): Maybe<{ isLocked: boolean; isStale: boolean; holder?: LockFileContent }> => {
  const lockPath = getLockPath(filePath);
  const lockContent = readLockFile(lockPath);

  if (isSome(lockContent)) {
    return some({
      isLocked: true,
      isStale: isLockStaleByContent(lockContent.value),
      holder: lockContent.value,
    });
  }
  return some({ isLocked: false, isStale: false });
};