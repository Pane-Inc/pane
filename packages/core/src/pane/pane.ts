// Pane implementation - public API
import type { Maybe, Result, Error } from '@deessejs/fp';
import { none, some, isSome } from '@deessejs/fp';
import { ok, err } from '@deessejs/fp';
import type { Pane, OpenPaneOptions, CreatePaneOptions } from './types';
import type { Row } from '../primitives';
import type { TableDefinition, FieldDefinition } from '../schema';
import type { LockHandle } from '../lock';
import { acquireLock, checkLockStatus } from '../lock';

import { ensureTempDir, copyFileToTemp, createEmptyFile, fileExists } from './internal/fs-operations';
import { openDatabase, readSchemaFromDb, createSystemTables, initMeta } from './internal/database';
import { readRows, insertRow, updateRow, deleteRow, upsertRow } from './internal/data-operations';
import { createUserTable, addFieldToTable, addViewToSchema } from './internal/schema-mutations';
import { commitPane, closePane } from './internal/lifecycle';
import { ReadOnlyError, SchemaError, LockError } from './internal/errors';
import type { PaneState } from './internal/state';
import type { ParsedSchema } from './internal/database';

// ============================================================================
// Shared pane object creator
// ============================================================================

const createPaneObject = (
  state: PaneState,
  schema: ParsedSchema
): Pane => {
  const buildSchema = () => ({
    version: schema.version,
    tables: schema.tables.map(t => ({
      id: t._id,
      name: t._name,
      label: t._label,
      labelPlural: t._label_plural,
      icon: t.icon,
      fields: t.fields.map(f => ({
        id: f.id,
        name: f.name,
        label: f.label,
        type: f.type as FieldDefinition['type'],
        required: f.required,
        defaultValue: f.defaultValue,
        options: f.options,
        foreignTable: f.foreignTable,
        formula: f.formula,
      })),
    })),
  });

  return {
    path: state.path,
    schema: buildSchema(),
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table: string) => {
      const result = readRows(state.db, table);
      return result as unknown as Result<readonly Row[], Error>;
    },
    create: (table: string, values: Row) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<number, Error>;
      }
      const result = insertRow(state.db, table, values);
      return result as unknown as Result<number, Error>;
    },
    update: (table: string, id: number, values: Row) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<void, Error>;
      }
      const result = updateRow(state.db, table, id, values);
      return result as unknown as Result<void, Error>;
    },
    delete: (table: string, id: number) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<void, Error>;
      }
      const result = deleteRow(state.db, table, id);
      return result as unknown as Result<void, Error>;
    },
    upsert: (table: string, values: Row, matchFields: readonly string[]) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<{ id: number; action: 'inserted' | 'updated' }, Error>;
      }
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result as unknown as Result<{ id: number; action: 'inserted' | 'updated' }, Error>;
    },
    addTable: (definition: TableDefinition) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<number, Error>;
      }
      const result = createUserTable(state.db, definition);
      return result as unknown as Result<number, Error>;
    },
    addField: (tableId: number, definition: FieldDefinition) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<number, Error>;
      }
      const table = state.schema.tables.find(t => t._id === tableId);
      if (!table) {
        return err(SchemaError({ reason: `Table with id ${tableId} not found` })) as unknown as Result<number, Error>;
      }
      const result = addFieldToTable(state.db, tableId, table._name, definition);
      return result as unknown as Result<number, Error>;
    },
    addView: (tableId: number | null, definition: { name: string; icon?: string; type: 'list' | 'kanban' | 'calendar' | 'chart' | 'custom'; config: Record<string, unknown>; }) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({})) as unknown as Result<number, Error>;
      }
      const result = addViewToSchema(state.db, tableId, definition);
      return result as unknown as Result<number, Error>;
    },
    commit: () => {
      const result = commitPane(state);
      return result as unknown as Result<void, Error>;
    },
    close: () => {
      const result = closePane(state);
      return result as unknown as Result<void, Error>;
    },
  };
};

// ============================================================================
// openPane
// ============================================================================

export const openPane = (options: OpenPaneOptions): { ok: true; value: Pane } | { ok: false; error: unknown } => {
  const { path: filePath, readOnly } = options;

  // Step 1: Check lock status
  const lockStatus = checkLockStatus(filePath);
  if (isSome(lockStatus) && lockStatus.value.isLocked && !lockStatus.value.isStale && !readOnly) {
    return err(LockError({
      holderId: lockStatus.value.holder?.holderId ?? 'unknown',
      holderName: lockStatus.value.holder?.holderName
    }));
  }

  // Step 2: Acquire lock if not read-only
  let lockHandle: Maybe<LockHandle> = none();
  if (!readOnly) {
    const lockResult = acquireLock({ path: filePath });
    if (!lockResult.ok) {
      return { ok: false, error: lockResult.error };
    }
    lockHandle = some(lockResult.value);
  }

  // Step 3: Ensure temp dir
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }

  // Step 4: Copy file to temp
  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;

  // Step 5: Open database
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;

  // Step 6: Read schema
  const schemaResult = readSchemaFromDb(db);
  if (!schemaResult.ok) {
    return { ok: false, error: schemaResult.error };
  }

  const state: PaneState = {
    path: filePath,
    tempPath,
    lock: lockHandle,
    isReadOnly: readOnly ?? false,
    db,
    schema: schemaResult.value,
  };

  return ok(createPaneObject(state, schemaResult.value));
};

// ============================================================================
// createPane
// ============================================================================

export const createPane = (options: CreatePaneOptions): { ok: true; value: Pane } | { ok: false; error: unknown } => {
  const { path: filePath, name, overwrite } = options;

  // Step 1: Check file exists
  const existsResult = fileExists(filePath);
  if (isSome(existsResult) && existsResult.value && !overwrite) {
    return err(LockError({ holderId: 'FileExistsError', holderName: `File already exists: ${filePath}` }));
  }

  // Step 2: Create empty file
  const createResult = createEmptyFile(filePath);
  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }

  // Step 3: Ensure temp dir
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }

  // Step 4: Copy file to temp
  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;

  // Step 5: Open database
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;

  // Step 6: Create system tables
  const createSysResult = createSystemTables(db);
  if (!createSysResult.ok) {
    return { ok: false, error: createSysResult.error };
  }

  // Step 7: Initialize meta
  if (name) {
    const metaResult = initMeta(db, name);
    if (!metaResult.ok) {
      return { ok: false, error: metaResult.error };
    }
  }

  // Step 8: Read schema
  const schemaResult = readSchemaFromDb(db);
  if (!schemaResult.ok) {
    return { ok: false, error: schemaResult.error };
  }

  // Step 9: Acquire lock
  const lockResult = acquireLock({ path: filePath });
  if (!lockResult.ok) {
    return { ok: false, error: lockResult.error };
  }

  const state: PaneState = {
    path: filePath,
    tempPath: tempPath,
    lock: some(lockResult.value),
    isReadOnly: false,
    db,
    schema: schemaResult.value,
  };

  return ok(createPaneObject(state, schemaResult.value));
};
