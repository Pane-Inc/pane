// Pane-specific structured errors
import { error } from '@deessejs/fp';
import { z } from 'zod';

export const FileExistsError = error({
  name: 'FileExistsError',
  schema: z.object({ path: z.string() }),
  message: (args) => `File already exists: ${args.path}`,
});

export const MissingVersionError = error({
  name: 'MissingVersionError',
  schema: z.object({}),
  message: () => 'Missing version in _meta',
});

export const InvalidIdentifierError = error({
  name: 'InvalidIdentifierError',
  schema: z.object({ identifier: z.string() }),
  message: (args) => `Invalid identifier: ${args.identifier}`,
});

export const SystemTableViolationError = error({
  name: 'SystemTableViolationError',
  schema: z.object({ table: z.string() }),
  message: (args) => `Cannot modify system table: ${args.table}`,
});

export const ReadOnlyModeError = error({
  name: 'ReadOnlyModeError',
  schema: z.object({}),
  message: () => 'Operation not permitted in read-only mode',
});

export const TempDirError = error({
  name: 'TempDirError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to create temp directory: ${args.reason}`,
});

export const CopyError = error({
  name: 'CopyError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to copy file: ${args.reason}`,
});

export const DatabaseError = error({
  name: 'DatabaseError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Database error: ${args.reason}`,
});

export const SchemaParseError = error({
  name: 'SchemaParseError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to parse schema: ${args.reason}`,
});

export const TransactionError = error({
  name: 'TransactionError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Transaction error: ${args.reason}`,
});

export const PaneNotFoundError = error({
  name: 'PaneNotFoundError',
  schema: z.object({ path: z.string() }),
  message: (args) => `File not found: ${args.path}`,
});

export type PaneError =
  | ReturnType<typeof FileExistsError>
  | ReturnType<typeof MissingVersionError>
  | ReturnType<typeof InvalidIdentifierError>
  | ReturnType<typeof SystemTableViolationError>
  | ReturnType<typeof ReadOnlyModeError>
  | ReturnType<typeof TempDirError>
  | ReturnType<typeof CopyError>
  | ReturnType<typeof DatabaseError>
  | ReturnType<typeof SchemaParseError>
  | ReturnType<typeof TransactionError>
  | ReturnType<typeof PaneNotFoundError>;
