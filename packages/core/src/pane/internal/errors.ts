// Domain errors using @deessejs/fp error factory
import { error } from '@deessejs/fp';
import { z } from 'zod';

export const TempDirError = error({
  name: 'TempDirError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to create temp dir: ${args.reason}`
});

export const CopyError = error({
  name: 'CopyError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to copy file: ${args.reason}`
});

export const DatabaseError = error({
  name: 'DatabaseError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Database error: ${args.reason}`
});

export const SchemaError = error({
  name: 'SchemaError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Schema error: ${args.reason}`
});

export const TransactionError = error({
  name: 'TransactionError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Transaction error: ${args.reason}`
});

export const InvalidIdentifierError = error({
  name: 'InvalidIdentifierError',
  schema: z.object({ identifier: z.string() }),
  message: (args) => `Invalid identifier: ${args.identifier}`
});

export const SystemTableError = error({
  name: 'SystemTableError',
  schema: z.object({ table: z.string() }),
  message: (args) => `Cannot modify system table: ${args.table}`
});

export const ReadOnlyError = error({
  name: 'ReadOnlyError',
  schema: z.object({}),
  message: () => 'Operation not permitted in read-only mode'
});

export const LockError = error({
  name: 'LockError',
  schema: z.object({ holderId: z.string(), holderName: z.string().optional() }),
  message: (args) => `Lock error: holder ${args.holderId}${args.holderName ? ` (${args.holderName})` : ''}`
});
