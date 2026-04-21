import { error, none, isSome, err, ok, unit, some, isNone } from '@deessejs/fp';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import * as fs2 from 'fs';
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
  try {
    if (!fs2.existsSync(lockPath)) {
      return none();
    }
    const content = fs2.readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(content);
    return some(parsed);
  } catch {
    return none();
  }
};
var writeLockFile = (lockPath, content) => {
  try {
    fs2.writeFileSync(lockPath, JSON.stringify(content), "utf-8");
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
    const fileExists2 = fs2.existsSync(options.path);
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
    if (fs2.existsSync(lockPath)) {
      fs2.unlinkSync(lockPath);
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
var DOCUMENT_VERSION = "1.0.0";
var SUPPORTED_VERSIONS = ["1.0.0"];
var SYSTEM_TABLES = ["_meta", "_tables", "_fields", "_views", "_widgets"];
var getTempDir = () => path.join(os.tmpdir(), "pane");
var getTempPath = (sourcePath, tempDir) => {
  const fileName = `${path.basename(sourcePath, ".pane")}_${randomUUID()}.pane`;
  return path.join(tempDir, fileName);
};
var isSystemTable = (name) => SYSTEM_TABLES.includes(name);
var validateIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSystemTable(name);
var ensureTempDir = () => {
  try {
    const tempDir = getTempDir();
    if (!fs2.existsSync(tempDir)) {
      fs2.mkdirSync(tempDir, { recursive: true });
    }
    return { ok: true, value: tempDir };
  } catch (e) {
    return { ok: false, error: { name: "TempDirError", args: { reason: String(e) } } };
  }
};
var copyFileToTemp = (sourcePath, tempDir) => {
  try {
    const tempPath = getTempPath(sourcePath, tempDir);
    fs2.copyFileSync(sourcePath, tempPath);
    return { ok: true, value: tempPath };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var createEmptyFile = (targetPath) => {
  try {
    const db = new Database(targetPath);
    db.close();
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var deleteFile = (filePath) => {
  try {
    if (fs2.existsSync(filePath)) {
      fs2.unlinkSync(filePath);
    }
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var fileExists = (filePath) => {
  try {
    return some(fs2.existsSync(filePath));
  } catch {
    return none();
  }
};
var openDatabase = (dbPath) => {
  try {
    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    return { ok: true, value: db };
  } catch (e) {
    return { ok: false, error: { name: "DatabaseError", args: { reason: String(e) } } };
  }
};
var closeDatabase = (db) => {
  try {
    db.close();
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "DatabaseError", args: { reason: String(e) } } };
  }
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
  try {
    const insertMeta = db.prepare(`INSERT INTO _meta (_key, _value) VALUES (?, ?)`);
    insertMeta.run("version", DOCUMENT_VERSION);
    insertMeta.run("created_at", (/* @__PURE__ */ new Date()).toISOString());
    if (name) {
      insertMeta.run("name", name);
    }
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var createSystemTables = (db) => {
  try {
    db.exec("BEGIN IMMEDIATE");
    db.exec(createSystemTablesSql);
    db.exec("COMMIT");
    return { ok: true, value: void 0 };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
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
  try {
    const metaRows = db.prepare(`SELECT _key, _value FROM _meta`).all();
    const versionRow = metaRows.find((r) => r._key === "version");
    if (!versionRow) {
      return { ok: false, error: { name: "SchemaError", args: { reason: "Missing version in _meta" } } };
    }
    if (!SUPPORTED_VERSIONS.includes(versionRow._value)) {
      return { ok: false, error: { name: "SchemaError", args: { reason: `Unsupported version: ${versionRow._value}` } } };
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
    return { ok: true, value: { version: versionRow._value, tables } };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var readRows = (db, table) => {
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: table } } };
  }
  if (isSystemTable(table)) {
    return { ok: false, error: { name: "SystemTableError", args: { table } } };
  }
  try {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    return { ok: true, value: stmt.all() };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var insertRow = (db, table, values) => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: "SystemTableError", args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: table } } };
  }
  try {
    const columns = Object.keys(values);
    const placeholders = columns.map(() => "?").join(", ");
    const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`);
    return { ok: true, value: stmt.run(...Object.values(values)).lastInsertRowid };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var updateRow = (db, table, id, values) => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: "SystemTableError", args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: table } } };
  }
  try {
    const setClause = Object.keys(values).map((k) => `${k} = ?`).join(", ");
    const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`);
    stmt.run(...Object.values(values), id);
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var deleteRow = (db, table, id) => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: "SystemTableError", args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: table } } };
  }
  try {
    const stmt = db.prepare(`DELETE FROM ${table} WHERE id = ?`);
    stmt.run(id);
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var upsertRow = (db, table, values, matchFields) => {
  if (isSystemTable(table)) {
    return { ok: false, error: { name: "SystemTableError", args: { table } } };
  }
  if (!validateIdentifier(table)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: table } } };
  }
  try {
    const columns = Object.keys(values);
    const placeholders = columns.map(() => "?").join(", ");
    const setClause = columns.map((k) => `${k} = excluded.${k}`).join(", ");
    const onConflict = matchFields.length > 0 ? `ON CONFLICT(${matchFields.join(", ")}) DO UPDATE SET ${setClause}` : `ON CONFLICT(id) DO UPDATE SET ${setClause}`;
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders}) ${onConflict}`;
    const stmt = db.prepare(sql);
    return { ok: true, value: stmt.run(...Object.values(values)).lastInsertRowid };
  } catch (e) {
    return { ok: false, error: { name: "SchemaError", args: { reason: String(e) } } };
  }
};
var createUserTable = (db, definition) => {
  if (!validateIdentifier(definition.name)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: definition.name } } };
  }
  try {
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
    db.exec(`CREATE TABLE IF NOT EXISTS "${definition.name}" (${columnDefs.join(", ")})`);
    db.exec("COMMIT");
    return { ok: true, value: tableId };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    return { ok: false, error: { name: "TransactionError", args: { reason: String(e) } } };
  }
};
var commitPane = (state) => {
  if (state.isReadOnly) {
    return { ok: false, error: { name: "ReadOnlyError", args: {} } };
  }
  if (isNone(state.lock)) {
    return { ok: true, value: void 0 };
  }
  try {
    const db = new Database(state.tempPath);
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    fs2.copyFileSync(state.tempPath, state.path);
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
  const lockResult = refreshLock({ lock: state.lock.value });
  if (!lockResult.ok) {
    return { ok: false, error: { name: "LockError", args: { holderId: "refresh_failed" } } };
  }
  return { ok: true, value: void 0 };
};
var closePane = (state) => {
  const closeResult = closeDatabase(state.db);
  if (!closeResult.ok) {
    return closeResult;
  }
  const deleteResult = deleteFile(state.tempPath);
  if (!deleteResult.ok) {
    return deleteResult;
  }
  if (isNone(state.lock)) {
    return { ok: true, value: void 0 };
  }
  const releaseResult = releaseLock({ lock: state.lock.value });
  if (!releaseResult.ok) {
    return { ok: false, error: { name: "LockError", args: { holderId: "release_failed" } } };
  }
  return { ok: true, value: void 0 };
};
var openPane = (options) => {
  const { path: filePath, readOnly } = options;
  const lockStatus = checkLockStatus(filePath);
  if (isSome(lockStatus) && lockStatus.value.isLocked && !lockStatus.value.isStale && !readOnly) {
    return {
      ok: false,
      error: {
        name: "LockError",
        args: {
          holderId: lockStatus.value.holder?.holderId ?? "unknown",
          holderName: lockStatus.value.holder?.holderName
        }
      }
    };
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
  const pane = {
    path: state.path,
    schema: {
      version: state.schema.version,
      tables: state.schema.tables.map((t) => ({
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
    },
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table) => {
      const result = readRows(state.db, table);
      return result;
    },
    create: (table, values) => {
      const result = insertRow(state.db, table, values);
      return result;
    },
    update: (table, id, values) => {
      const result = updateRow(state.db, table, id, values);
      return result;
    },
    delete: (table, id) => {
      const result = deleteRow(state.db, table, id);
      return result;
    },
    upsert: (table, values, matchFields) => {
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result;
    },
    addTable: (definition) => {
      const result = createUserTable(state.db, definition);
      return result;
    },
    addField: () => {
      return { ok: false, error: { name: "SchemaError", args: { reason: "Not implemented" } } };
    },
    addView: () => {
      return { ok: false, error: { name: "SchemaError", args: { reason: "Not implemented" } } };
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
  return { ok: true, value: pane };
};
var createPane = (options) => {
  const { path: filePath, name, overwrite } = options;
  const existsResult = fileExists(filePath);
  if (isSome(existsResult) && existsResult.value && !overwrite) {
    return { ok: false, error: { name: "FileExistsError", args: { path: filePath } } };
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
  const pane = {
    path: state.path,
    schema: {
      version: state.schema.version,
      tables: state.schema.tables.map((t) => ({
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
    },
    lock: state.lock,
    isReadOnly: state.isReadOnly,
    read: (table) => {
      const result = readRows(state.db, table);
      return result;
    },
    create: (table, values) => {
      const result = insertRow(state.db, table, values);
      return result;
    },
    update: (table, id, values) => {
      const result = updateRow(state.db, table, id, values);
      return result;
    },
    delete: (table, id) => {
      const result = deleteRow(state.db, table, id);
      return result;
    },
    upsert: (table, values, matchFields) => {
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result;
    },
    addTable: (definition) => {
      const result = createUserTable(state.db, definition);
      return result;
    },
    addField: () => {
      return { ok: false, error: { name: "SchemaError", args: { reason: "Not implemented" } } };
    },
    addView: () => {
      return { ok: false, error: { name: "SchemaError", args: { reason: "Not implemented" } } };
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
  return { ok: true, value: pane };
};

export { FileLockedError, LockExpiredError, LockNotFoundError, LockWriteError, SchemaMismatchError, ValidationError, WriteError, acquireLock, checkLockStatus, createPane, isLockStale, openPane, refreshLock, releaseLock };
//# sourceMappingURL=index.js.map
//# sourceMappingURL=index.js.map