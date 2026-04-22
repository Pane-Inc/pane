// Lifecycle operations (commit and close)
import * as fs from 'fs';
import { ok, err, isNone, attempt } from '@deessejs/fp';
import type { Try } from '@deessejs/fp';
import { refreshLock, releaseLock } from '../../lock';
import { closeDatabase } from './database';
import { deleteFile } from './fs-operations';
import { ReadOnlyError, CopyError, LockError, DatabaseError } from './errors';
import type { PaneState } from './state';

const commitPane = (state: PaneState): Try<undefined, ReturnType<typeof ReadOnlyError | typeof CopyError | typeof LockError>> => {
  if (state.isReadOnly) {
    return err(ReadOnlyError({}));
  }
  if (isNone(state.lock)) {
    return ok(undefined);
  }
  const checkpointResult = attempt(
    () => {
      state.db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(state.tempPath, state.path);
      return undefined;
    },
    (error) => CopyError({ reason: String(error) })
  );
  if (!checkpointResult.ok) {
    return checkpointResult;
  }
  const lockResult = refreshLock({ lock: state.lock.value });
  if (!lockResult.ok) {
    return err(LockError({ holderId: 'refresh_failed' }));
  }
  return ok(undefined);
};

const closePane = (state: PaneState): Try<undefined, ReturnType<typeof CopyError | typeof LockError | typeof DatabaseError>> => {
  const closeResult = closeDatabase(state.db);
  if (!closeResult.ok) {
    return err(closeResult.error);
  }
  const deleteResult = deleteFile(state.tempPath);
  if (!deleteResult.ok) {
    return err(LockError({ holderId: 'delete_failed', holderName: deleteResult.error.reason }));
  }
  // Always release lock, even on errors above
  if (isNone(state.lock)) {
    return ok(undefined);
  }
  const releaseResult = releaseLock({ lock: state.lock.value });
  if (!releaseResult.ok) {
    return err(LockError({ holderId: 'release_failed' }));
  }
  return ok(undefined);
};

export { commitPane, closePane };
