// Pane implementation - entity-oriented functions
import type { Maybe } from '@deessejs/fp';
import { none, some, isSome, isNone } from '@deessejs/fp';
import type { Pane, OpenPaneOptions, CreatePaneOptions } from './types';
import type { Row } from '../primitives';
import type { TableDefinition, FieldDefinition } from '../schema';
import type { LockHandle } from '../lock';
import { acquireLock, releaseLock, refreshLock, checkLockStatus } from '../lock';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';

const DOCUMENT_VERSION = '1.0.0';
const SUPPORTED_VERSIONS = ['1.0.0'];
const SYSTEM_TABLES = ['_meta', '_tables', '_fields', '_views', '_widgets'] as const;

// ============================================================================
// Pure helper functions
// ============================================================================

const getTempDir = (): string => path.join(os.tmpdir(), 'pane');

const getTempPath = (sourcePath: string, tempDir: string): string => {
  const fileName = `${path.basename(sourcePath, '.pane')}_${randomUUID()}.pane`;
  return path.join(tempDir, fileName);
};

const isSystemTable = (name: string): boolean =>
  SYSTEM_TABLES.includes(name as typeof SYSTEM_TABLES[number]);

const validateIdentifier = (name: string): boolean =>
  /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSystemTable(name);

// ============================================================================
// Error types for internal use
// ============================================================================

interface TempDirErrorReason { reason: string }
interface CopyErrorReason { reason: string }
interface DatabaseErrorReason { reason: string }
interface SchemaErrorReason { reason: string }
interface TransactionErrorReason { reason: string }
interface InvalidIdReason { identifier: string }
interface SystemTableReason { table: string }
interface ReadOnlyReason {}
interface LockErrorReason { holderId: string; holderName?: string }

type TempDirError = { name: 'TempDirError'; args: TempDirErrorReason };
type CopyError = { name: 'CopyError'; args: CopyErrorReason };
type DatabaseError = { name: 'DatabaseError'; args: DatabaseErrorReason };
type SchemaError = { name: 'SchemaError'; args: SchemaErrorReason };
type TransactionError = { name: 'TransactionError'; args: TransactionErrorReason };
type InvalidIdentifierError = { name: 'InvalidIdentifierError'; args: InvalidIdReason };
type SystemTableError = { name: 'SystemTableError'; args: SystemTableReason };
type ReadOnlyError = { name: 'ReadOnlyError'; args: ReadOnlyReason };
type LockError = { name: 'LockError'; args: LockErrorReason };

// ============================================================================
// Low-level fs operations
// ============================================================================

const ensureTempDir = (): { ok: true; value: string } | { ok: false; error: TempDirError } => {
  try {
    const tempDir = getTempDir();
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    return { ok: true, value: tempDir };
  } catch (e) {
    return { ok: false, error: { name: 'TempDirError', args: { reason: String(e) } } };
  }
};

const copyFileToTemp = (sourcePath: string, tempDir: string): { ok: true; value: string } | { ok: false; error: CopyError } => {
  try {
    const tempPath = getTempPath(sourcePath, tempDir);
    fs.copyFileSync(sourcePath, tempPath);
    return { ok: true, value: tempPath };
  } catch (e) {
    return { ok: false, error: { name: 'CopyError', args: { reason: String(e) } } };
  }
};

const createEmptyFile = (targetPath: string): { ok: true; value: undefined } | { ok: false; error: CopyError } => {
  try {
    const db = new Database(targetPath);
    db.close();
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'CopyError', args: { reason: String(e) } } };
  }
};

const deleteFile = (filePath: string): { ok: true; value: undefined } | { ok: false; error: CopyError } => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'CopyError', args: { reason: String(e) } } };
  }
};

const fileExists = (filePath: string): Maybe<boolean> => {
  try {
    return some(fs.existsSync(filePath));
  } catch {
    return none();
  }
};

// ============================================================================
// Database operations
// ============================================================================

const openDatabase = (dbPath: string): { ok: true; value: Database.Database } | { ok: false; error: DatabaseError } => {
  try {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    return { ok: true, value: db };
  } catch (e) {
    return { ok: false, error: { name: 'DatabaseError', args: { reason: String(e) } } };
  }
};

const closeDatabase = (db: Database.Database): { ok: true; value: undefined } | { ok: false; error: DatabaseError } => {
  try {
    db.close();
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'DatabaseError', args: { reason: String(e) } } };
  }
};

// ============================================================================
// Schema operations
// ============================================================================

const createSystemTablesSql = `
  CREATE TABLE IF NOT EXISTS _meta (
    _key TEXT PRIMARY KEY,
    _value TEXT
  );

  CREATE TABLE IF NOT EXISTS _tables (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    _name TEXT NOT NULL UNIQUE,
    _label TEXT NOT NULL,
    _label_plural TEXT NOT NULL,
    _icon TEXT,
    _sort_order INTEGER DEFAULT 0,
    _created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );

  CREATE TABLE IF NOT EXISTS _fields (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    _table_id INTEGER NOT NULL REFERENCES _tables(_id),
    _name TEXT NOT NULL,
    _label TEXT NOT NULL,
    _type TEXT NOT NULL,
    _required INTEGER DEFAULT 0,
    _default_value TEXT,
    _options TEXT,
    _foreign_table_id INTEGER REFERENCES _tables(_id),
    _formula TEXT,
    _validation TEXT,
    _sort_order INTEGER DEFAULT 0,
    UNIQUE(_table_id, _name)
  );

  CREATE TABLE IF NOT EXISTS _views (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    _table_id INTEGER REFERENCES _tables(_id),
    _name TEXT NOT NULL,
    _icon TEXT,
    _type TEXT NOT NULL,
    _config TEXT NOT NULL DEFAULT '{}',
    _sort_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS _widgets (
    _id INTEGER PRIMARY KEY AUTOINCREMENT,
    _view_id INTEGER NOT NULL REFERENCES _views(_id),
    _type TEXT NOT NULL,
    _source_table TEXT,
    _source_filter TEXT,
    _config TEXT NOT NULL DEFAULT '{}',
    _position TEXT NOT NULL DEFAULT '{"x":0,"y":0,"w":12,"h":4}',
    _sort_order INTEGER DEFAULT 0
  );

  CREATE INDEX IF NOT EXISTS _fields_table_idx ON _fields(_table_id);
  CREATE UNIQUE INDEX IF NOT EXISTS _table_name_idx ON _fields(_table_id, _name);
  CREATE INDEX IF NOT EXISTS _views_table_idx ON _views(_table_id);
  CREATE INDEX IF NOT EXISTS _widgets_view_idx ON _widgets(_view_id);
`;

const initMeta = (db: Database.Database, name?: string): { ok: true; value: undefined } | { ok: false; error: SchemaError } => {
  try {
    const insertMeta = db.prepare(`INSERT INTO _meta (_key, _value) VALUES (?, ?)`);
    insertMeta.run('version', DOCUMENT_VERSION);
    insertMeta.run('created_at', new Date().toISOString());
    if (name) {
      insertMeta.run('name', name);
    }
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

const createSystemTables = (db: Database.Database): { ok: true; value: undefined } | { ok: false; error: SchemaError } => {
  try {
    db.exec('BEGIN IMMEDIATE');
    db.exec(createSystemTablesSql);
    db.exec('COMMIT');
    return { ok: true, value: undefined };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

// ============================================================================
// Schema parsing
// ============================================================================

interface ParsedField {
  id: number;
  name: string;
  label: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  options?: string[];
  foreignTable?: string;
  formula?: string;
}

interface ParsedTable {
  _id: number;
  _name: string;
  _label: string;
  _label_plural: string;
  icon?: string;
  fields: ParsedField[];
}

interface ParsedSchema {
  version: string;
  tables: ParsedTable[];
}

const parseFieldRow = (row: Record<string, unknown>, tables: Array<{ _id: number; _name: string }>): ParsedField => ({
  id: row._id as number,
  name: row._name as string,
  label: row._label as string,
  type: row._type as string,
  required: row._required === 1,
  defaultValue: row._default_value ? JSON.parse(row._default_value as string) : undefined,
  options: row._options ? JSON.parse(row._options as string) : undefined,
  foreignTable: row._foreign_table_id
    ? tables.find(t => t._id === row._foreign_table_id)?._name
    : undefined,
  formula: (row._formula as string) ?? undefined,
});

const readSchemaFromDb = (db: Database.Database): { ok: true; value: ParsedSchema } | { ok: false; error: SchemaError } => {
  try {
    const metaRows = db.prepare(`SELECT _key, _value FROM _meta`).all() as Array<{ _key: string; _value: string }>;
    const versionRow = metaRows.find(r => r._key === 'version');

    if (!versionRow) {
      return { ok: false, error: { name: 'SchemaError', args: { reason: 'Missing version in _meta' } } };
    }

    if (!SUPPORTED_VERSIONS.includes(versionRow._value)) {
      return { ok: false, error: { name: 'SchemaError', args: { reason: `Unsupported version: ${versionRow._value}` } } };
    }

    const tableRows = db.prepare(
      `SELECT _id, _name, _label, _label_plural, _icon, _sort_order FROM _tables ORDER BY _sort_order`
    ).all() as Array<{ _id: number; _name: string; _label: string; _label_plural: string; _icon: string | null; _sort_order: number }>;

    const fieldRows = db.prepare(
      `SELECT _id, _table_id, _name, _label, _type, _required, _default_value, _options, _foreign_table_id, _formula, _sort_order FROM _fields ORDER BY _sort_order`
    ).all() as Record<string, unknown>[];

    const tables = tableRows.map(t => ({
      _id: t._id,
      _name: t._name,
      _label: t._label,
      _label_plural: t._label_plural,
      icon: t._icon ?? undefined,
      fields: fieldRows
        .filter(f => f._table_id === t._id)
        .map(f => parseFieldRow(f, tableRows)),
    }));

    return { ok: true, value: { version: versionRow._value, tables } };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

// ============================================================================
// Data operations
// ============================================================================

const readRows = (
  db: Database.Database,
  table: string
): { ok: true; value: readonly Row[] } | { ok: false; error: SchemaError | InvalidIdentifierError | SystemTableError } => {
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: table } } };
  }
  if (isSystemTable(table)) {
    return { ok: false, error: { name: 'SystemTableError', args: { table } } };
  }
  try {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    return { ok: true, value: stmt.all() as Row[] };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

const insertRow = (
  db: Database.Database,
  table: string,
  values: Row
): { ok: true; value: number } | { ok: false; error: SchemaError | InvalidIdentifierError | SystemTableError } => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: 'SystemTableError', args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: table } } };
  }
  try {
    const columns = Object.keys(values);
    const placeholders = columns.map(() => '?').join(', ');
    const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
    return { ok: true, value: stmt.run(...Object.values(values)).lastInsertRowid as number };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

const updateRow = (
  db: Database.Database,
  table: string,
  id: number,
  values: Row
): { ok: true; value: undefined } | { ok: false; error: SchemaError | InvalidIdentifierError | SystemTableError } => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: 'SystemTableError', args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: table } } };
  }
  try {
    const setClause = Object.keys(values).map(k => `${k} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`);
    stmt.run(...Object.values(values), id);
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

const deleteRow = (
  db: Database.Database,
  table: string,
  id: number
): { ok: true; value: undefined } | { ok: false; error: SchemaError | InvalidIdentifierError | SystemTableError } => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: 'SystemTableError', args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: table } } };
  }
  try {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    stmt.run(id);
    return { ok: true, value: undefined };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

const upsertRow = (
  db: Database.Database,
  table: string,
  values: Row,
  matchFields: string[]
): { ok: true; value: number } | { ok: false; error: SchemaError | InvalidIdentifierError | SystemTableError } => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: 'SystemTableError', args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: table } } };
  }
  try {
    const columns = Object.keys(values);
    const placeholders = columns.map(() => '?').join(', ');
    const setClause = columns.map(k => `${k} = excluded.${k}`).join(', ');

    const onConflict = matchFields.length > 0
      ? `ON CONFLICT(${matchFields.join(', ')}) DO UPDATE SET ${setClause}`
      : `ON CONFLICT(id) DO UPDATE SET ${setClause}`;

    const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ${onConflict}`;
    const stmt = db.prepare(sql);
    return { ok: true, value: stmt.run(...Object.values(values)).lastInsertRowid as number };
  } catch (e) {
    return { ok: false, error: { name: 'SchemaError', args: { reason: String(e) } } };
  }
};

// ============================================================================
// Schema mutations
// ============================================================================

const createUserTable = (
  db: Database.Database,
  definition: TableDefinition
): { ok: true; value: number } | { ok: false; error: SchemaError | InvalidIdentifierError | TransactionError } => {
  if (!validateIdentifier(definition.name)) {
    return { ok: false, error: { name: 'InvalidIdentifierError', args: { identifier: definition.name } } };
  }
  try {
    db.exec('BEGIN IMMEDIATE');

    const insertTable = db.prepare(`
      INSERT INTO _tables (_name, _label, _label_plural, _icon, _sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = insertTable.run(
      definition.name,
      definition.label,
      definition.labelPlural,
      definition.icon ?? null,
      definition.fields.length
    );
    const tableId = result.lastInsertRowid as number;

    if (definition.fields.length > 0) {
      const insertField = db.prepare(`
        INSERT INTO _fields (_table_id, _name, _label, _type, _required, _default_value, _options, _formula, _sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      definition.fields.forEach((field, index) => {
        insertField.run(
          tableId,
          field.name,
          field.label,
          field.type,
          field.required ? 1 : 0,
          field.defaultValue ? JSON.stringify(field.defaultValue) : null,
          field.options ? JSON.stringify(field.options) : null,
          field.formula ?? null,
          index
        );
      });
    }

    const columnDefs = definition.fields.map(f => {
      let def = `"${f.name}" TEXT`;
      if (f.required) def += ' NOT NULL';
      return def;
    });
    columnDefs.push('id INTEGER PRIMARY KEY AUTOINCREMENT');
    columnDefs.push('created_at TEXT DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\'))');

    db.exec(`CREATE TABLE IF NOT EXISTS "${definition.name}" (${columnDefs.join(', ')})`);
    db.exec('COMMIT');

    return { ok: true, value: tableId };
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* ignore */ }
    return { ok: false, error: { name: 'TransactionError', args: { reason: String(e) } } };
  }
};

// ============================================================================
// Pane state
// ============================================================================

interface PaneState {
  path: string;
  tempPath: string;
  lock: Maybe<LockHandle>;
  isReadOnly: boolean;
  db: Database.Database;
  schema: ParsedSchema;
}

// ============================================================================
// Commit and close
// ============================================================================

const commitPane = (state: PaneState): { ok: true; value: undefined } | { ok: false; error: ReadOnlyError | TransactionError | CopyError | LockError } => {
  if (state.isReadOnly) {
    return { ok: false, error: { name: 'ReadOnlyError', args: {} } };
  }
  if (isNone(state.lock)) {
    return { ok: true, value: undefined };
  }
  try {
    // Checkpoint WAL before copy
    const db = new Database(state.tempPath);
    db.pragma('wal_checkpoint(TRUNCATE)');
    db.close();
    fs.copyFileSync(state.tempPath, state.path);
  } catch (e) {
    return { ok: false, error: { name: 'CopyError', args: { reason: String(e) } } };
  }
  // Refresh lock
  const lockResult = refreshLock({ lock: state.lock.value });
  if (!lockResult.ok) {
    return { ok: false, error: { name: 'LockError', args: { holderId: 'refresh_failed' } } };
  }
  return { ok: true, value: undefined };
};

const closePane = (state: PaneState): { ok: true; value: undefined } | { ok: false; error: DatabaseError | CopyError | LockError } => {
  const closeResult = closeDatabase(state.db);
  if (!closeResult.ok) {
    return closeResult;
  }
  const deleteResult = deleteFile(state.tempPath);
  if (!deleteResult.ok) {
    return deleteResult;
  }
  if (isNone(state.lock)) {
    return { ok: true, value: undefined };
  }
  const releaseResult = releaseLock({ lock: state.lock.value });
  if (!releaseResult.ok) {
    return { ok: false, error: { name: 'LockError', args: { holderId: 'release_failed' } } };
  }
  return { ok: true, value: undefined };
};

// ============================================================================
// openPane
// ============================================================================

export const openPane = (options: OpenPaneOptions): { ok: true; value: Pane } | { ok: false; error: unknown } => {
  const { path: filePath, readOnly } = options;

  // Check lock status
  const lockStatus = checkLockStatus(filePath);
  if (isSome(lockStatus) && lockStatus.value.isLocked && !lockStatus.value.isStale && !readOnly) {
    return {
      ok: false,
      error: {
        name: 'LockError',
        args: {
          holderId: lockStatus.value.holder?.holderId ?? 'unknown',
          holderName: lockStatus.value.holder?.holderName,
        },
      },
    };
  }

  // Acquire lock if not read-only
  let lockHandle: Maybe<LockHandle> = none();
  if (!readOnly) {
    const lockResult = acquireLock({ path: filePath });
    if (!lockResult.ok) {
      return { ok: false, error: lockResult.error };
    }
    lockHandle = some(lockResult.value);
  }

  // Ensure temp directory
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }

  // Copy file to temp
  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;

  // Open database
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;

  // Read schema
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

  const pane: Pane = {
    path: state.path,
    schema: {
      version: state.schema.version,
      tables: state.schema.tables.map(t => ({
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
    },
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table: string) => {
      const result = readRows(state.db, table);
      return result as unknown as import('@deessejs/fp').Result<readonly Row[], import('@deessejs/fp').Error>;
    },
    create: (table: string, values: Row) => {
      const result = insertRow(state.db, table, values);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    update: (table: string, id: number, values: Row) => {
      const result = updateRow(state.db, table, id, values);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    delete: (table: string, id: number) => {
      const result = deleteRow(state.db, table, id);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    upsert: (table: string, values: Row, matchFields: readonly string[]) => {
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addTable: (definition: TableDefinition) => {
      const result = createUserTable(state.db, definition);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addField: () => {
      return { ok: false, error: { name: 'SchemaError', args: { reason: 'Not implemented' } } } as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addView: () => {
      return { ok: false, error: { name: 'SchemaError', args: { reason: 'Not implemented' } } } as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    commit: () => {
      const result = commitPane(state);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    close: () => {
      const result = closePane(state);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
  };

  return { ok: true, value: pane };
};

// ============================================================================
// createPane
// ============================================================================

export const createPane = (options: CreatePaneOptions): { ok: true; value: Pane } | { ok: false; error: unknown } => {
  const { path: filePath, name, overwrite } = options;

  // Check if file exists
  const existsResult = fileExists(filePath);
  if (isSome(existsResult) && existsResult.value && !overwrite) {
    return { ok: false, error: { name: 'FileExistsError', args: { path: filePath } } };
  }

  // Create empty file
  const createResult = createEmptyFile(filePath);
  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }

  // Copy to temp location for editing (like openPane does)
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }

  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;

  // Open the temp file as database
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;

  // Create system tables
  const createSysResult = createSystemTables(db);
  if (!createSysResult.ok) {
    return { ok: false, error: createSysResult.error };
  }

  // Initialize meta
  if (name) {
    const metaResult = initMeta(db, name);
    if (!metaResult.ok) {
      return { ok: false, error: metaResult.error };
    }
  }

  // Read schema
  const schemaResult = readSchemaFromDb(db);
  if (!schemaResult.ok) {
    return { ok: false, error: schemaResult.error };
  }

  // Acquire lock
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

  const pane: Pane = {
    path: state.path,
    schema: {
      version: state.schema.version,
      tables: state.schema.tables.map(t => ({
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
    },
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table: string) => {
      const result = readRows(state.db, table);
      return result as unknown as import('@deessejs/fp').Result<readonly Row[], import('@deessejs/fp').Error>;
    },
    create: (table: string, values: Row) => {
      const result = insertRow(state.db, table, values);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    update: (table: string, id: number, values: Row) => {
      const result = updateRow(state.db, table, id, values);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    delete: (table: string, id: number) => {
      const result = deleteRow(state.db, table, id);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    upsert: (table: string, values: Row, matchFields: readonly string[]) => {
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addTable: (definition: TableDefinition) => {
      const result = createUserTable(state.db, definition);
      return result as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addField: () => {
      return { ok: false, error: { name: 'SchemaError', args: { reason: 'Not implemented' } } } as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    addView: () => {
      return { ok: false, error: { name: 'SchemaError', args: { reason: 'Not implemented' } } } as unknown as import('@deessejs/fp').Result<number, import('@deessejs/fp').Error>;
    },
    commit: () => {
      const result = commitPane(state);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
    close: () => {
      const result = closePane(state);
      return result as unknown as import('@deessejs/fp').Result<void, import('@deessejs/fp').Error>;
    },
  };

  return { ok: true, value: pane };
};