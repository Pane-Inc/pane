import { error, none, isSome, err, ok, unit, some, attempt, isNone } from '@deessejs/fp';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as properLockfile from 'proper-lockfile';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as os from 'os';

// src/errors/types.ts
var FileLockedError = error({
  name: "FileLockedError",
  schema: z.object({
    holderId: z.string(),
    holderName: z.string().optional()
  }),
  message: (args) => `File is locked by ${args.holderName ?? args.holderId}`
});
var LockExpiredError = error({
  name: "LockExpiredError",
  schema: z.object({}),
  message: () => "Lock has expired"
});
var SchemaMismatchError = error({
  name: "SchemaMismatchError",
  schema: z.object({
    documentVersion: z.string(),
    supportedVersion: z.string()
  }),
  message: (args) => `Document version ${args.documentVersion} not supported (max: ${args.supportedVersion})`
});
var ValidationError = error({
  name: "ValidationError",
  schema: z.object({
    field: z.string(),
    reason: z.string()
  }),
  message: (args) => `"${args.field}" is invalid: ${args.reason}`
});
var WriteError = error({
  name: "WriteError",
  schema: z.object({
    reason: z.string()
  }),
  message: (args) => `Write failed: ${args.reason}`
});
var LockWriteError = error({
  name: "LockWriteError",
  schema: z.object({
    reason: z.string()
  }),
  message: (args) => `Failed to write lock file: ${args.reason}`
});
var LockNotFoundError = error({
  name: "LockNotFoundError",
  schema: z.object({}),
  message: () => "Lock file not found"
});
var LOCK_DURATION_MS = 15 * 60 * 1e3;
var LOCK_SUFFIX = ".lock";
var holderId = none();
var generateHolderId = () => {
  if (isSome(holderId)) {
    return holderId.value;
  }
  const newId = randomUUID();
  holderId = some(newId);
  return newId;
};
var getLockPath = (filePath) => `${filePath}${LOCK_SUFFIX}`;
var readLockFile = (lockPath) => {
  if (!fs.existsSync(lockPath)) {
    return none();
  }
  try {
    const content = fs.readFileSync(lockPath, "utf-8");
    return some(JSON.parse(content));
  } catch {
    return none();
  }
};
var writeLockFile = (lockPath, content) => {
  try {
    fs.writeFileSync(lockPath, JSON.stringify(content), "utf-8");
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};
var acquireFileLock = (lockPath) => {
  try {
    properLockfile.lockSync(lockPath, {
      lockfilePath: lockPath,
      retries: { retries: 3, factor: 1, minTimeout: 100, maxTimeout: 500 }
    });
    return ok(unit);
  } catch {
    return err(FileLockedError({ holderId: "unknown" }));
  }
};
var releaseFileLock = (lockPath) => {
  try {
    properLockfile.unlockSync(lockPath, { lockfilePath: lockPath });
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};
var isLockStaleByContent = (content) => {
  const expiryDate = new Date(content.expiresAt);
  return expiryDate < /* @__PURE__ */ new Date();
};
var createLockHandle = (path2, id, name) => {
  const now = /* @__PURE__ */ new Date();
  return {
    path: path2,
    holderId: id,
    holderName: name,
    acquiredAt: now,
    expiresAt: new Date(now.getTime() + LOCK_DURATION_MS)
  };
};
var acquireLock = (options) => {
  const lockPath = getLockPath(options.path);
  const id = generateHolderId();
  const existingLock = readLockFile(lockPath);
  if (isSome(existingLock)) {
    const isStale = isLockStaleByContent(existingLock.value);
    const fileExists2 = fs.existsSync(options.path);
    if (!isStale && fileExists2) {
      return err(
        FileLockedError({
          holderId: existingLock.value.holderId,
          holderName: existingLock.value.holderName
        })
      );
    }
  }
  const lockResult = acquireFileLock(lockPath);
  if (!ok(lockResult)) {
    return lockResult;
  }
  const lockContent = {
    holderId: id,
    holderName: options.holderName,
    acquiredAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: new Date(Date.now() + LOCK_DURATION_MS).toISOString()
  };
  const writeResult = writeLockFile(lockPath, lockContent);
  if (!ok(writeResult)) {
    return writeResult;
  }
  return ok(createLockHandle(options.path, id, options.holderName));
};
var releaseLock = (options) => {
  const lockPath = getLockPath(options.lock.path);
  releaseFileLock(lockPath);
  try {
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
    return ok(unit);
  } catch (e) {
    return err(LockWriteError({ reason: String(e) }));
  }
};
var refreshLock = (options) => {
  const lockPath = getLockPath(options.lock.path);
  const lockOpt = readLockFile(lockPath);
  if (!isSome(lockOpt)) {
    return err(LockNotFoundError({}));
  }
  const lockContent = lockOpt.value;
  const newExpiresAt = new Date(Date.now() + LOCK_DURATION_MS);
  const updatedContent = {
    ...lockContent,
    expiresAt: newExpiresAt.toISOString()
  };
  const writeResult = writeLockFile(lockPath, updatedContent);
  if (!ok(writeResult)) {
    return writeResult;
  }
  return ok({
    ...options.lock,
    expiresAt: new Date(updatedContent.expiresAt)
  });
};
var isLockStale = (expiresAt) => {
  const expiryDate = new Date(expiresAt);
  if (isNaN(expiryDate.getTime())) {
    return none();
  }
  return some(expiryDate < /* @__PURE__ */ new Date());
};
var checkLockStatus = (filePath) => {
  const lockPath = getLockPath(filePath);
  const lockContent = readLockFile(lockPath);
  if (isSome(lockContent)) {
    return some({
      isLocked: true,
      isStale: isLockStaleByContent(lockContent.value),
      holder: lockContent.value
    });
  }
  return some({ isLocked: false, isStale: false });
};

// src/pane/internal/constants.ts
var DOCUMENT_VERSION = "1.0.0";
var SUPPORTED_VERSIONS = ["1.0.0"];
var SYSTEM_TABLES = ["_meta", "_tables", "_fields", "_views", "_widgets"];

// src/pane/internal/helpers.ts
var getTempDir = () => path.join(os.tmpdir(), "pane");
var getTempPath = (sourcePath, tempDir) => {
  const fileName = `${path.basename(sourcePath, ".pane")}_${randomUUID()}.pane`;
  return path.join(tempDir, fileName);
};
var isSystemTable = (name) => SYSTEM_TABLES.includes(name);
var validateIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSystemTable(name);
var TempDirError = error({
  name: "TempDirError",
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to create temp dir: ${args.reason}`
});
var CopyError = error({
  name: "CopyError",
  schema: z.object({ reason: z.string() }),
  message: (args) => `Failed to copy file: ${args.reason}`
});
var DatabaseError = error({
  name: "DatabaseError",
  schema: z.object({ reason: z.string() }),
  message: (args) => `Database error: ${args.reason}`
});
var SchemaError = error({
  name: "SchemaError",
  schema: z.object({ reason: z.string() }),
  message: (args) => `Schema error: ${args.reason}`
});
var TransactionError = error({
  name: "TransactionError",
  schema: z.object({ reason: z.string() }),
  message: (args) => `Transaction error: ${args.reason}`
});
var InvalidIdentifierError = error({
  name: "InvalidIdentifierError",
  schema: z.object({ identifier: z.string() }),
  message: (args) => `Invalid identifier: ${args.identifier}`
});
var SystemTableError = error({
  name: "SystemTableError",
  schema: z.object({ table: z.string() }),
  message: (args) => `Cannot modify system table: ${args.table}`
});
var ReadOnlyError = error({
  name: "ReadOnlyError",
  schema: z.object({}),
  message: () => "Operation not permitted in read-only mode"
});
var LockError = error({
  name: "LockError",
  schema: z.object({ holderId: z.string(), holderName: z.string().optional() }),
  message: (args) => `Lock error: holder ${args.holderId}${args.holderName ? ` (${args.holderName})` : ""}`
});

// src/pane/internal/fs-operations.ts
var ensureTempDir = () => {
  return attempt(
    () => {
      const tempDir = getTempDir();
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      return tempDir;
    },
    (error3) => TempDirError({ reason: String(error3) })
  );
};
var copyFileToTemp = (sourcePath, tempDir) => {
  return attempt(
    () => {
      const tempPath = getTempPath(sourcePath, tempDir);
      fs.copyFileSync(sourcePath, tempPath);
      return tempPath;
    },
    (error3) => CopyError({ reason: String(error3) })
  );
};
var createEmptyFile = (targetPath) => {
  return attempt(
    () => {
      const db = new Database(targetPath);
      db.close();
      return void 0;
    },
    (error3) => CopyError({ reason: String(error3) })
  );
};
var deleteFile = (targetPath) => {
  return attempt(
    () => {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return void 0;
    },
    (error3) => CopyError({ reason: String(error3) })
  );
};
var fileExists = (targetPath) => {
  return some(fs.existsSync(targetPath));
};
var openDatabase = (dbPath) => {
  return attempt(
    () => {
      const db = new Database(dbPath);
      db.pragma("journal_mode = WAL");
      db.pragma("foreign_keys = ON");
      return db;
    },
    (error3) => DatabaseError({ reason: String(error3) })
  );
};
var closeDatabase = (db) => {
  return attempt(
    () => {
      db.close();
      return void 0;
    },
    (error3) => DatabaseError({ reason: String(error3) })
  );
};
var createSystemTablesSql = `
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
var initMeta = (db, name) => {
  return attempt(
    () => {
      const insertMeta = db.prepare(`INSERT INTO _meta (_key, _value) VALUES (?, ?)`);
      insertMeta.run("version", DOCUMENT_VERSION);
      insertMeta.run("created_at", (/* @__PURE__ */ new Date()).toISOString());
      if (name) {
        insertMeta.run("name", name);
      }
      return void 0;
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var createSystemTables = (db) => {
  return attempt(
    () => {
      db.exec("BEGIN IMMEDIATE");
      db.exec(createSystemTablesSql);
      db.exec("COMMIT");
      return void 0;
    },
    (error3) => {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      return SchemaError({ reason: String(error3) });
    }
  );
};
var parseFieldRow = (row, tables) => ({
  id: row._id,
  name: row._name,
  label: row._label,
  type: row._type,
  required: row._required === 1,
  defaultValue: row._default_value ? JSON.parse(row._default_value) : void 0,
  options: row._options ? JSON.parse(row._options) : void 0,
  foreignTable: row._foreign_table_id ? tables.find((t) => t._id === row._foreign_table_id)?._name : void 0,
  formula: row._formula ?? void 0
});
var readSchemaFromDb = (db) => {
  return attempt(
    () => {
      const metaRows = db.prepare(`SELECT _key, _value FROM _meta`).all();
      const versionRow = metaRows.find((r) => r._key === "version");
      if (!versionRow) {
        throw SchemaError({ reason: "Missing version in _meta" });
      }
      if (!SUPPORTED_VERSIONS.includes(versionRow._value)) {
        throw SchemaError({ reason: `Unsupported version: ${versionRow._value}` });
      }
      const tableRows = db.prepare(
        `SELECT _id, _name, _label, _label_plural, _icon, _sort_order FROM _tables ORDER BY _sort_order`
      ).all();
      const fieldRows = db.prepare(
        `SELECT _id, _table_id, _name, _label, _type, _required, _default_value, _options, _foreign_table_id, _formula, _sort_order FROM _fields ORDER BY _sort_order`
      ).all();
      const tables = tableRows.map((t) => ({
        _id: t._id,
        _name: t._name,
        _label: t._label,
        _label_plural: t._label_plural,
        icon: t._icon ?? void 0,
        fields: fieldRows.filter((f) => f._table_id === t._id).map((f) => parseFieldRow(f, tableRows))
      }));
      return { version: versionRow._value, tables };
    },
    (error3) => {
      if (error3 && typeof error3 === "object" && "name" in error3 && error3.name === "SchemaError") {
        return error3;
      }
      return SchemaError({ reason: String(error3) });
    }
  );
};
var readRows = (db, table) => {
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  return attempt(
    () => {
      const stmt = db.prepare(`SELECT * FROM ${table}`);
      return stmt.all();
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var insertRow = (db, table, values) => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  return attempt(
    () => {
      const columns = Object.keys(values);
      const placeholders = columns.map(() => "?").join(", ");
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
      return stmt.run(...Object.values(values)).lastInsertRowid;
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var updateRow = (db, table, id, values) => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  return attempt(
    () => {
      const setClause = Object.keys(values).map((k) => `${k} = ?`).join(", ");
      const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`);
      stmt.run(...Object.values(values), id);
      return void 0;
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var deleteRow = (db, table, id) => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  return attempt(
    () => {
      const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
      stmt.run(id);
      return void 0;
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var upsertRow = (db, table, values, matchFields) => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  return attempt(
    () => {
      const columns = Object.keys(values);
      const valuesList = Object.values(values).map((v) => {
        if (Array.isArray(v)) return JSON.stringify(v);
        return v;
      });
      if (matchFields.length > 0) {
        const existingStmt = db.prepare(`SELECT id FROM ${table} WHERE ${matchFields.map((f) => `${f} = ?`).join(" AND ")}`);
        const existingValues = matchFields.map((f) => values[f]);
        const existing = existingStmt.get(...existingValues);
        if (existing) {
          const nonMatchColumns = columns.filter((c) => !matchFields.includes(c));
          const setClause = nonMatchColumns.map((k) => `${k} = ?`).join(", ");
          const updateSql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
          const updateStmt = db.prepare(updateSql);
          const updateValues = nonMatchColumns.map((k) => {
            const v = values[k];
            if (Array.isArray(v)) return JSON.stringify(v);
            return v;
          });
          updateStmt.run(...updateValues, existing.id);
          return { id: existing.id, action: "updated" };
        } else {
          const placeholders2 = columns.map(() => "?").join(", ");
          const sql2 = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders2})`;
          const stmt2 = db.prepare(sql2);
          return { id: stmt2.run(...valuesList).lastInsertRowid, action: "inserted" };
        }
      }
      const placeholders = columns.map(() => "?").join(", ");
      const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      return { id: stmt.run(...valuesList).lastInsertRowid, action: "inserted" };
    },
    (error3) => SchemaError({ reason: String(error3) })
  );
};
var createUserTable = (db, definition) => {
  if (!validateIdentifier(definition.name)) {
    return err(InvalidIdentifierError({ identifier: definition.name }));
  }
  return attempt(
    () => {
      db.exec("BEGIN IMMEDIATE");
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
      const tableId = result.lastInsertRowid;
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
      const columnDefs = definition.fields.map((f) => {
        let def = `"${f.name}" TEXT`;
        if (f.required) def += " NOT NULL";
        return def;
      });
      columnDefs.push("id INTEGER PRIMARY KEY AUTOINCREMENT");
      columnDefs.push("created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))");
      const uniqueFields = definition.fields.filter((f) => f.unique);
      if (uniqueFields.length > 0) {
        const uniqueColumns = uniqueFields.map((f) => `"${f.name}"`).join(", ");
        columnDefs.push(`UNIQUE(${uniqueColumns})`);
      }
      db.exec(`CREATE TABLE IF NOT EXISTS "${definition.name}" (${columnDefs.join(", ")})`);
      db.exec("COMMIT");
      return tableId;
    },
    (error3) => {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      return TransactionError({ reason: String(error3) });
    }
  );
};
var addFieldToTable = (db, tableId, tableName, definition) => {
  if (!validateIdentifier(definition.name)) {
    return err(InvalidIdentifierError({ identifier: definition.name }));
  }
  return attempt(
    () => {
      db.exec("BEGIN IMMEDIATE");
      const insertField = db.prepare(`
        INSERT INTO _fields (_table_id, _name, _label, _type, _required, _default_value, _options, _formula, _sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insertField.run(
        tableId,
        definition.name,
        definition.label,
        definition.type,
        definition.required ? 1 : 0,
        definition.defaultValue ? JSON.stringify(definition.defaultValue) : null,
        definition.options ? JSON.stringify(definition.options) : null,
        definition.formula ?? null,
        0
      );
      const fieldId = result.lastInsertRowid;
      let columnDef = `"${definition.name}" TEXT`;
      if (definition.required) columnDef += " NOT NULL";
      db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDef}`);
      db.exec("COMMIT");
      return fieldId;
    },
    (error3) => {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      return TransactionError({ reason: String(error3) });
    }
  );
};
var addViewToSchema = (db, tableId, definition) => {
  return attempt(
    () => {
      db.exec("BEGIN IMMEDIATE");
      const insertView = db.prepare(`
        INSERT INTO _views (_table_id, _name, _icon, _type, _config, _sort_order)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const result = insertView.run(
        tableId,
        definition.name,
        definition.icon ?? null,
        definition.type,
        JSON.stringify(definition.config),
        0
      );
      const viewId = result.lastInsertRowid;
      db.exec("COMMIT");
      return viewId;
    },
    (error3) => {
      try {
        db.exec("ROLLBACK");
      } catch {
      }
      return TransactionError({ reason: String(error3) });
    }
  );
};
var commitPane = (state) => {
  if (state.isReadOnly) {
    return err(ReadOnlyError({}));
  }
  if (isNone(state.lock)) {
    return ok(void 0);
  }
  const checkpointResult = attempt(
    () => {
      const db = new Database(state.tempPath);
      db.pragma("wal_checkpoint(TRUNCATE)");
      db.close();
      fs.copyFileSync(state.tempPath, state.path);
      return void 0;
    },
    (error3) => CopyError({ reason: String(error3) })
  );
  if (!checkpointResult.ok) {
    return checkpointResult;
  }
  const lockResult = refreshLock({ lock: state.lock.value });
  if (!lockResult.ok) {
    return err(LockError({ holderId: "refresh_failed" }));
  }
  return ok(void 0);
};
var closePane = (state) => {
  const closeResult = closeDatabase(state.db);
  if (!closeResult.ok) {
    return err(LockError({ holderId: closeResult.error.name }));
  }
  const deleteResult = deleteFile(state.tempPath);
  if (!deleteResult.ok) {
    return err(LockError({ holderId: deleteResult.error.args.holderId }));
  }
  if (isNone(state.lock)) {
    return ok(void 0);
  }
  const releaseResult = releaseLock({ lock: state.lock.value });
  if (!releaseResult.ok) {
    return err(LockError({ holderId: "release_failed" }));
  }
  return ok(void 0);
};

// src/pane/pane.ts
var createPaneObject = (state, schema) => {
  const buildSchema = () => ({
    version: schema.version,
    tables: schema.tables.map((t) => ({
      id: t._id,
      name: t._name,
      label: t._label,
      labelPlural: t._label_plural,
      icon: t.icon,
      fields: t.fields.map((f) => ({
        id: f.id,
        name: f.name,
        label: f.label,
        type: f.type,
        required: f.required,
        defaultValue: f.defaultValue,
        options: f.options,
        foreignTable: f.foreignTable,
        formula: f.formula
      }))
    }))
  });
  return {
    path: state.path,
    schema: buildSchema(),
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table) => {
      const result = readRows(state.db, table);
      return result;
    },
    create: (table, values) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = insertRow(state.db, table, values);
      return result;
    },
    update: (table, id, values) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = updateRow(state.db, table, id, values);
      return result;
    },
    delete: (table, id) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = deleteRow(state.db, table, id);
      return result;
    },
    upsert: (table, values, matchFields) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result;
    },
    addTable: (definition) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = createUserTable(state.db, definition);
      return result;
    },
    addField: (tableId, definition) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const table = state.schema.tables.find((t) => t._id === tableId);
      if (!table) {
        return err(SchemaError({ reason: `Table with id ${tableId} not found` }));
      }
      const result = addFieldToTable(state.db, tableId, table._name, definition);
      return result;
    },
    addView: (tableId, definition) => {
      if (state.isReadOnly) {
        return err(ReadOnlyError({}));
      }
      const result = addViewToSchema(state.db, tableId, definition);
      return result;
    },
    commit: () => {
      const result = commitPane(state);
      return result;
    },
    close: () => {
      const result = closePane(state);
      return result;
    }
  };
};
var openPane = (options) => {
  const { path: filePath, readOnly } = options;
  const lockStatus = checkLockStatus(filePath);
  if (isSome(lockStatus) && lockStatus.value.isLocked && !lockStatus.value.isStale && !readOnly) {
    return err(LockError({
      holderId: lockStatus.value.holder?.holderId ?? "unknown",
      holderName: lockStatus.value.holder?.holderName
    }));
  }
  let lockHandle = none();
  if (!readOnly) {
    const lockResult = acquireLock({ path: filePath });
    if (!lockResult.ok) {
      return { ok: false, error: lockResult.error };
    }
    lockHandle = some(lockResult.value);
  }
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }
  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;
  const schemaResult = readSchemaFromDb(db);
  if (!schemaResult.ok) {
    return { ok: false, error: schemaResult.error };
  }
  const state = {
    path: filePath,
    tempPath,
    lock: lockHandle,
    isReadOnly: readOnly ?? false,
    db,
    schema: schemaResult.value
  };
  return ok(createPaneObject(state, schemaResult.value));
};
var createPane = (options) => {
  const { path: filePath, name, overwrite } = options;
  const existsResult = fileExists(filePath);
  if (isSome(existsResult) && existsResult.value && !overwrite) {
    return err(LockError({ holderId: "FileExistsError", holderName: `File already exists: ${filePath}` }));
  }
  const createResult = createEmptyFile(filePath);
  if (!createResult.ok) {
    return { ok: false, error: createResult.error };
  }
  const tempDirResult = ensureTempDir();
  if (!tempDirResult.ok) {
    return { ok: false, error: tempDirResult.error };
  }
  const copyResult = copyFileToTemp(filePath, tempDirResult.value);
  if (!copyResult.ok) {
    return { ok: false, error: copyResult.error };
  }
  const tempPath = copyResult.value;
  const dbResult = openDatabase(tempPath);
  if (!dbResult.ok) {
    return { ok: false, error: dbResult.error };
  }
  const db = dbResult.value;
  const createSysResult = createSystemTables(db);
  if (!createSysResult.ok) {
    return { ok: false, error: createSysResult.error };
  }
  if (name) {
    const metaResult = initMeta(db, name);
    if (!metaResult.ok) {
      return { ok: false, error: metaResult.error };
    }
  }
  const schemaResult = readSchemaFromDb(db);
  if (!schemaResult.ok) {
    return { ok: false, error: schemaResult.error };
  }
  const lockResult = acquireLock({ path: filePath });
  if (!lockResult.ok) {
    return { ok: false, error: lockResult.error };
  }
  const state = {
    path: filePath,
    tempPath,
    lock: some(lockResult.value),
    isReadOnly: false,
    db,
    schema: schemaResult.value
  };
  return ok(createPaneObject(state, schemaResult.value));
};

export { FileLockedError, LockExpiredError, LockNotFoundError, LockWriteError, SchemaMismatchError, ValidationError, WriteError, acquireLock, checkLockStatus, createPane, isLockStale, openPane, refreshLock, releaseLock };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map