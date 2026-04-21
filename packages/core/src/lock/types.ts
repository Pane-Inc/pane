// Lock types
import type { Result } from '@deessejs/fp';
import type { FileLockedError, LockExpiredError } from '../errors';

export type LockHandle = {
  readonly path: string;
  readonly holderId: string;
  readonly holderName?: string;
  readonly acquiredAt: Date;
  readonly expiresAt: Date;
};

export type LockResult = Result<LockHandle, FileLockedError | LockExpiredError>;

export type LockFileContent = {
  holderId: string;
  holderName?: string;
  acquiredAt: string;
  expiresAt: string;
};

export type AcquireLockOptions = {
  readonly path: string;
  readonly holderName?: string;
};

export type ReleaseLockOptions = {
  readonly lock: LockHandle;
};

export type RefreshLockOptions = {
  readonly lock: LockHandle;
};