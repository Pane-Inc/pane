// Database initialization and schema parsing
import Database from 'better-sqlite3';
import { ok, err, attempt } from '@deessejs/fp';
import type { Try } from '@deessejs/fp';
import { DOCUMENT_VERSION, SUPPORTED_VERSIONS } from './constants';
import { DatabaseError, SchemaError } from './errors';

export interface ParsedSchema {
  version: string;
  tables: ParsedTable[];
}

export interface ParsedField {
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

export interface ParsedTable {
  id: number;
  name: string;
  label: string;
  labelPlural: string;
  icon?: string;
  fields: ParsedField[];
}

const openDatabase = (dbPath: string): Try<Database.Database, ReturnType<typeof DatabaseError>> => {
  return attempt(
    () => {
      const db = new Database(dbPath);
      db.pragma('journal_mode = WAL');
      db.pragma('foreign_keys = ON');
      return db;
    },
    (error) => DatabaseError({ reason: String(error) })
  );
};

const closeDatabase = (db: Database.Database): Try<undefined, ReturnType<typeof DatabaseError>> => {
  return attempt(
    () => {
      db.close();
      return undefined;
    },
    (error) => DatabaseError({ reason: String(error) })
  );
};

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

const initMeta = (db: Database.Database, name?: string): Try<undefined, ReturnType<typeof SchemaError>> => {
  return attempt(
    () => {
      const insertMeta = db.prepare(`INSERT INTO _meta (_key, _value) VALUES (?, ?)`);
      insertMeta.run('version', DOCUMENT_VERSION);
      insertMeta.run('created_at', new Date().toISOString());
      if (name) {
        insertMeta.run('name', name);
      }
      return undefined;
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

const createSystemTables = (db: Database.Database): Try<undefined, ReturnType<typeof SchemaError>> => {
  return attempt(
    () => {
      db.exec('BEGIN IMMEDIATE');
      db.exec(createSystemTablesSql);
      db.exec('COMMIT');
      return undefined;
    },
    (error) => {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return SchemaError({ reason: String(error) });
    }
  );
};

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

const readSchemaFromDb = (db: Database.Database): Try<ParsedSchema, ReturnType<typeof SchemaError>> => {
  return attempt(
    () => {
      const metaRows = db.prepare(`SELECT _key, _value FROM _meta`).all() as Array<{ _key: string; _value: string }>;
      const versionRow = metaRows.find(r => r._key === 'version');

      if (!versionRow) {
        throw new Error('Missing version in _meta');
      }

      if (!SUPPORTED_VERSIONS.includes(versionRow._value)) {
        throw new Error(`Unsupported version: ${versionRow._value}`);
      }

      const tableRows = db.prepare(
        `SELECT _id, _name, _label, _label_plural, _icon, _sort_order FROM _tables ORDER BY _sort_order`
      ).all() as Array<{ _id: number; _name: string; _label: string; _label_plural: string; _icon: string | null; _sort_order: number }>;

      const fieldRows = db.prepare(
        `SELECT _id, _table_id, _name, _label, _type, _required, _default_value, _options, _foreign_table_id, _formula, _sort_order FROM _fields ORDER BY _sort_order`
      ).all() as Record<string, unknown>[];

      const tables = tableRows.map(t => ({
        id: t._id,
        name: t._name,
        label: t._label,
        labelPlural: t._label_plural,
        icon: t._icon ?? undefined,
        fields: fieldRows
          .filter(f => f._table_id === t._id)
          .map(f => parseFieldRow(f, tableRows)),
      }));

      return { version: versionRow._value, tables };
    },
    (error) => {
      // Re-throw if it's already a SchemaError
      if (error && typeof error === 'object' && 'name' in error && error.name === 'SchemaError') {
        return error as ReturnType<typeof SchemaError>;
      }
      // The error passed here is what attempt() constructed from the caught error.
      // attempt() does: new Error(String(originalError)) for non-Error objects.
      // So for a thrown non-Error object, error.message = "Error: [object Object]"
      // For a caught Error object, error.message = the actual message
      if (error && typeof error === 'object' && 'message' in error) {
        const msg = String(error.message);
        // If message is "[object Object]" or "Error: [object Object]", the original
        // was a non-Error object which we couldn't extract info from
        if (msg === '[object Object]' || msg === 'Error: [object Object]') {
          return SchemaError({ reason: 'Unexpected error type in schema read' });
        }
        // Otherwise use the message
        return SchemaError({ reason: msg });
      }
      return SchemaError({ reason: String(error) });
    }
  );
};

export { openDatabase, closeDatabase, createSystemTables, initMeta, readSchemaFromDb, parseFieldRow };
export type { ParsedField, ParsedTable };
