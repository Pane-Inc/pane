// Pane document handle
import type { Maybe } from '@deessejs/fp';
import type { LockHandle } from '../lock';
import type { Schema, TableDefinition, FieldDefinition } from '../schema';
import type { Row } from '../primitives';

// Re-export Row for convenience
export type { Row } from '../primitives';

export type Pane = {
  readonly path: string;
  readonly schema: Schema;
  readonly lock: Maybe<LockHandle>;
  readonly isReadOnly: boolean;

  // Data operations
  read: (table: string) => import('@deessejs/fp').Result<readonly Row[], import('@deessejs/fp').Error>;
  create: (table: string, values: Row) => import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
  update: (table: string, id: number, values: Row) => import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
  delete: (table: string, id: number) => import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
  upsert: (table: string, values: Row, matchFields: readonly string[]) => import('@deessejs/fp').Result<UpsertResult, import('@deessejs/fp').Error>;

  // Schema operations
  addTable: (definition: TableDefinition) => import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
  addField: (tableId: number, definition: FieldDefinition) => import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
  addView: (tableId: number | null, definition: ViewDefinition) => import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;

  // Lifecycle
  commit: () => import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
  close: () => import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
};

export type ViewDefinition = {
  readonly name: string;
  readonly icon?: string;
  readonly type: 'list' | 'kanban' | 'calendar' | 'chart' | 'custom';
  readonly config: Record<string, unknown>;
};

export type UpsertResult = {
  readonly id: number;
  readonly action: 'inserted' | 'updated';
};

export type CreatePaneOptions = {
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
  readonly overwrite?: boolean;
};

export type OpenPaneOptions = {
  readonly path: string;
  readonly readOnly?: boolean;
};