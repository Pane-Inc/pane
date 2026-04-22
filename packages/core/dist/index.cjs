'use strict';

var fp = require('@deessejs/fp');
var zod = require('zod');
var crypto = require('crypto');
var fs2 = require('fs');
var properLockfile = require('proper-lockfile');
var Database = require('better-sqlite3');
var path = require('path');
var os = require('os');

function _interopDefault (e) { return e && e.__esModule ? e : { default: e }; }

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var fs2__namespace = /*#__PURE__*/_interopNamespace(fs2);
var properLockfile__namespace = /*#__PURE__*/_interopNamespace(properLockfile);
var Database__default = /*#__PURE__*/_interopDefault(Database);
var path__namespace = /*#__PURE__*/_interopNamespace(path);
var os__namespace = /*#__PURE__*/_interopNamespace(os);

// src/errors/types.ts
var FileLockedError = fp.error({
  name: "FileLockedError",
  schema: zod.z.object({
    holderId: zod.z.string(),
    holderName: zod.z.string().optional()
  }),
  message: (args) => `File is locked by ${args.holderName ?? args.holderId}`
});
var LockExpiredError = fp.error({
  name: "LockExpiredError",
  schema: zod.z.object({}),
  message: () => "Lock has expired"
});
var SchemaMismatchError = fp.error({
  name: "SchemaMismatchError",
  schema: zod.z.object({
    documentVersion: zod.z.string(),
    supportedVersion: zod.z.string()
  }),
  message: (args) => `Document version ${args.documentVersion} not supported (max: ${args.supportedVersion})`
});
var ValidationError = fp.error({
  name: "ValidationError",
  schema: zod.z.object({
    field: zod.z.string(),
    reason: zod.z.string()
  }),
  message: (args) => `"${args.field}" is invalid: ${args.reason}`
});
var WriteError = fp.error({
  name: "WriteError",
  schema: zod.z.object({
    reason: zod.z.string()
  }),
  message: (args) => `Write failed: ${args.reason}`
});
var LockWriteError = fp.error({
  name: "LockWriteError",
  schema: zod.z.object({
    reason: zod.z.string()
  }),
  message: (args) => `Failed to write lock file: ${args.reason}`
});
var LockNotFoundError = fp.error({
  name: "LockNotFoundError",
  schema: zod.z.object({}),
  message: () => "Lock file not found"
});
var LOCK_DURATION_MS = 15 * 60 * 1e3;
var LOCK_SUFFIX = ".lock";
var holderId = fp.none();
var generateHolderId = () => {
  if (fp.isSome(holderId)) {
    return holderId.value;
  }
  const newId = crypto.randomUUID();
  holderId = fp.some(newId);
  return newId;
};
var getLockPath = (filePath) => `${filePath}${LOCK_SUFFIX}`;
var readLockFile = (lockPath) => {
  try {
    if (!fs2__namespace.existsSync(lockPath)) {
      return fp.none();
    }
    const content = fs2__namespace.readFileSync(lockPath, "utf-8");
    const parsed = JSON.parse(content);
    return fp.some(parsed);
  } catch {
    return fp.none();
  }
};
var writeLockFile = (lockPath, content) => {
  try {
    fs2__namespace.writeFileSync(lockPath, JSON.stringify(content), "utf-8");
    return fp.ok(fp.unit);
  } catch (e) {
    return fp.err(LockWriteError({ reason: String(e) }));
  }
};
var acquireFileLock = (lockPath) => {
  try {
    properLockfile__namespace.lockSync(lockPath, {
      lockfilePath: lockPath,
      retries: { retries: 3, factor: 1, minTimeout: 100, maxTimeout: 500 }
    });
    return fp.ok(fp.unit);
  } catch {
    return fp.err(FileLockedError({ holderId: "unknown" }));
  }
};
var releaseFileLock = (lockPath) => {
  try {
    properLockfile__namespace.unlockSync(lockPath, { lockfilePath: lockPath });
    return fp.ok(fp.unit);
  } catch (e) {
    return fp.err(LockWriteError({ reason: String(e) }));
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
  if (fp.isSome(existingLock)) {
    const isStale = isLockStaleByContent(existingLock.value);
    const fileExists2 = fs2__namespace.existsSync(options.path);
    if (!isStale && fileExists2) {
      return fp.err(
        FileLockedError({
          holderId: existingLock.value.holderId,
          holderName: existingLock.value.holderName
        })
      );
    }
  }
  const lockResult = acquireFileLock(lockPath);
  if (!fp.ok(lockResult)) {
    return lockResult;
  }
  const lockContent = {
    holderId: id,
    holderName: options.holderName,
    acquiredAt: (/* @__PURE__ */ new Date()).toISOString(),
    expiresAt: new Date(Date.now() + LOCK_DURATION_MS).toISOString()
  };
  const writeResult = writeLockFile(lockPath, lockContent);
  if (!fp.ok(writeResult)) {
    return writeResult;
  }
  return fp.ok(createLockHandle(options.path, id, options.holderName));
};
var releaseLock = (options) => {
  const lockPath = getLockPath(options.lock.path);
  releaseFileLock(lockPath);
  try {
    if (fs2__namespace.existsSync(lockPath)) {
      fs2__namespace.unlinkSync(lockPath);
    }
    return fp.ok(fp.unit);
  } catch (e) {
    return fp.err(LockWriteError({ reason: String(e) }));
  }
};
var refreshLock = (options) => {
  const lockPath = getLockPath(options.lock.path);
  const lockOpt = readLockFile(lockPath);
  if (!fp.isSome(lockOpt)) {
    return fp.err(LockNotFoundError({}));
  }
  const lockContent = lockOpt.value;
  const newExpiresAt = new Date(Date.now() + LOCK_DURATION_MS);
  const updatedContent = {
    ...lockContent,
    expiresAt: newExpiresAt.toISOString()
  };
  const writeResult = writeLockFile(lockPath, updatedContent);
  if (!fp.ok(writeResult)) {
    return writeResult;
  }
  return fp.ok({
    ...options.lock,
    expiresAt: new Date(updatedContent.expiresAt)
  });
};
var isLockStale = (expiresAt) => {
  const expiryDate = new Date(expiresAt);
  if (isNaN(expiryDate.getTime())) {
    return fp.none();
  }
  return fp.some(expiryDate < /* @__PURE__ */ new Date());
};
var checkLockStatus = (filePath) => {
  const lockPath = getLockPath(filePath);
  const lockContent = readLockFile(lockPath);
  if (fp.isSome(lockContent)) {
    return fp.some({
      isLocked: true,
      isStale: isLockStaleByContent(lockContent.value),
      holder: lockContent.value
    });
  }
  return fp.some({ isLocked: false, isStale: false });
};
var DOCUMENT_VERSION = "1.0.0";
var SUPPORTED_VERSIONS = ["1.0.0"];
var SYSTEM_TABLES = ["_meta", "_tables", "_fields", "_views", "_widgets"];
var getTempDir = () => path__namespace.join(os__namespace.tmpdir(), "pane");
var getTempPath = (sourcePath, tempDir) => {
  const fileName = `${path__namespace.basename(sourcePath, ".pane")}_${crypto.randomUUID()}.pane`;
  return path__namespace.join(tempDir, fileName);
};
var isSystemTable = (name) => SYSTEM_TABLES.includes(name);
var validateIdentifier = (name) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSystemTable(name);
var ensureTempDir = () => {
  try {
    const tempDir = getTempDir();
    if (!fs2__namespace.existsSync(tempDir)) {
      fs2__namespace.mkdirSync(tempDir, { recursive: true });
    }
    return { ok: true, value: tempDir };
  } catch (e) {
    return { ok: false, error: { name: "TempDirError", args: { reason: String(e) } } };
  }
};
var copyFileToTemp = (sourcePath, tempDir) => {
  try {
    const tempPath = getTempPath(sourcePath, tempDir);
    fs2__namespace.copyFileSync(sourcePath, tempPath);
    return { ok: true, value: tempPath };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var createEmptyFile = (targetPath) => {
  try {
    const db = new Database__default.default(targetPath);
    db.close();
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var deleteFile = (filePath) => {
  try {
    if (fs2__namespace.existsSync(filePath)) {
      fs2__namespace.unlinkSync(filePath);
    }
    return { ok: true, value: void 0 };
  } catch (e) {
    return { ok: false, error: { name: "CopyError", args: { reason: String(e) } } };
  }
};
var fileExists = (filePath) => {
  try {
    return fp.some(fs2__namespace.existsSync(filePath));
  } catch {
    return fp.none();
  }
};
var openDatabase = (dbPath) => {
  try {
    const db = new Database__default.default(dbPath);
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
        return { ok: true, value: { id: existing.id, action: "updated" } };
      } else {
        const placeholders2 = columns.map(() => "?").join(", ");
        const sql2 = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders2})`;
        const stmt2 = db.prepare(sql2);
        return { ok: true, value: { id: stmt2.run(...valuesList).lastInsertRowid, action: "inserted" } };
      }
    }
    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    const stmt = db.prepare(sql);
    return { ok: true, value: { id: stmt.run(...valuesList).lastInsertRowid, action: "inserted" } };
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
    const uniqueFields = definition.fields.filter((f) => f.unique);
    if (uniqueFields.length > 0) {
      const uniqueColumns = uniqueFields.map((f) => `"${f.name}"`).join(", ");
      columnDefs.push(`UNIQUE(${uniqueColumns})`);
    }
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
var addFieldToTable = (db, tableId, tableName, definition) => {
  if (!validateIdentifier(definition.name)) {
    return { ok: false, error: { name: "InvalidIdentifierError", args: { identifier: definition.name } } };
  }
  try {
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
    return { ok: true, value: fieldId };
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
    }
    return { ok: false, error: { name: "TransactionError", args: { reason: String(e) } } };
  }
};
var addViewToSchema = (db, tableId, definition) => {
  try {
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
    return { ok: true, value: viewId };
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
  if (fp.isNone(state.lock)) {
    return { ok: true, value: void 0 };
  }
  try {
    const db = new Database__default.default(state.tempPath);
    db.pragma("wal_checkpoint(TRUNCATE)");
    db.close();
    fs2__namespace.copyFileSync(state.tempPath, state.path);
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
  if (fp.isNone(state.lock)) {
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
  if (fp.isSome(lockStatus) && lockStatus.value.isLocked && !lockStatus.value.isStale && !readOnly) {
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
  let lockHandle = fp.none();
  if (!readOnly) {
    const lockResult = acquireLock({ path: filePath });
    if (!lockResult.ok) {
      return { ok: false, error: lockResult.error };
    }
    lockHandle = fp.some(lockResult.value);
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
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const result = insertRow(state.db, table, values);
      return result;
    },
    update: (table, id, values) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const result = updateRow(state.db, table, id, values);
      return result;
    },
    delete: (table, id) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const result = deleteRow(state.db, table, id);
      return result;
    },
    upsert: (table, values, matchFields) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const result = upsertRow(state.db, table, values, [...matchFields]);
      return result;
    },
    addTable: (definition) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const result = createUserTable(state.db, definition);
      return result;
    },
    addField: (tableId, definition) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
      }
      const table = state.schema.tables.find((t) => t._id === tableId);
      if (!table) {
        return { ok: false, error: { name: "SchemaError", args: { reason: `Table with id ${tableId} not found` } } };
      }
      const result = addFieldToTable(state.db, tableId, table._name, definition);
      return result;
    },
    addView: (tableId, definition) => {
      if (state.isReadOnly) {
        return { ok: false, error: { name: "ReadOnlyError", args: {} } };
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
  return { ok: true, value: pane };
};
var createPane = (options) => {
  const { path: filePath, name, overwrite } = options;
  const existsResult = fileExists(filePath);
  if (fp.isSome(existsResult) && existsResult.value && !overwrite) {
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
    lock: fp.some(lockResult.value),
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
    addField: (tableId, definition) => {
      const table = state.schema.tables.find((t) => t._id === tableId);
      if (!table) {
        return { ok: false, error: { name: "SchemaError", args: { reason: `Table with id ${tableId} not found` } } };
      }
      const result = addFieldToTable(state.db, tableId, table._name, definition);
      return result;
    },
    addView: (tableId, definition) => {
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
  return { ok: true, value: pane };
};

exports.FileLockedError = FileLockedError;
exports.LockExpiredError = LockExpiredError;
exports.LockNotFoundError = LockNotFoundError;
exports.LockWriteError = LockWriteError;
exports.SchemaMismatchError = SchemaMismatchError;
exports.ValidationError = ValidationError;
exports.WriteError = WriteError;
exports.acquireLock = acquireLock;
exports.checkLockStatus = checkLockStatus;
exports.createPane = createPane;
exports.isLockStale = isLockStale;
exports.openPane = openPane;
exports.refreshLock = refreshLock;
exports.releaseLock = releaseLock;
//# sourceMappingURL=index.cjs.map
//# sourceMappingURL=index.cjs.map