// Error types using @deessejs/fp structured errors
import { error } from '@deessejs/fp';
import { z } from 'zod';

export const FileLockedError = error({
  name: 'FileLockedError',
  schema: z.object({
    holderId: z.string(),
    holderName: z.string().optional(),
  }),
  message: (args) => `File is locked by ${args.holderName ?? args.holderId}`,
});

export type FileLockedError = ReturnType<typeof FileLockedError>;

export const LockExpiredError = error({
  name: 'LockExpiredError',
  schema: z.object({}),
  message: () => 'Lock has expired',
});

export type LockExpiredError = ReturnType<typeof LockExpiredError>;

export const SchemaMismatchError = error({
  name: 'SchemaMismatchError',
  schema: z.object({
    documentVersion: z.string(),
    supportedVersion: z.string(),
  }),
  message: (args) => `Document version ${args.documentVersion} not supported (max: ${args.supportedVersion})`,
});

export type SchemaMismatchError = ReturnType<typeof SchemaMismatchError>;

export const ValidationError = error({
  name: 'ValidationError',
  schema: z.object({
    field: z.string(),
    reason: z.string(),
  }),
  message: (args) => `"${args.field}" is invalid: ${args.reason}`,
});

export type ValidationError = ReturnType<typeof ValidationError>;

export const WriteError = error({
  name: 'WriteError',
  schema: z.object({
    reason: z.string(),
  }),
  message: (args) => `Write failed: ${args.reason}`,
});

export type WriteError = ReturnType<typeof WriteError>;

export const LockWriteError = error({
  name: 'LockWriteError',
  schema: z.object({
    reason: z.string(),
  }),
  message: (args) => `Failed to write lock file: ${args.reason}`,
});

export type LockWriteError = ReturnType<typeof LockWriteError>;

export const LockNotFoundError = error({
  name: 'LockNotFoundError',
  schema: z.object({}),
  message: () => 'Lock file not found',
});

export type LockNotFoundError = ReturnType<typeof LockNotFoundError>;

export type PaneError =
  | FileLockedError
  | LockExpiredError
  | SchemaMismatchError
  | ValidationError
  | WriteError
  | LockWriteError
  | LockNotFoundError;