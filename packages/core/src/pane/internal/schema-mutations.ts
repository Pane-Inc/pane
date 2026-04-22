// Schema mutation operations (DDL)
import Database from 'better-sqlite3';
import { ok, err, attempt } from '@deessejs/fp';
import type { Try } from '@deessejs/fp';
import type { TableDefinition, FieldDefinition } from '../schema';
import { validateIdentifier } from './helpers';
import { SchemaError, InvalidIdentifierError, TransactionError } from './errors';

const createUserTable = (
  db: Database.Database,
  definition: TableDefinition
): Try<number, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof TransactionError>> => {
  if (!validateIdentifier(definition.name)) {
    return err(InvalidIdentifierError({ identifier: definition.name }));
  }
  return attempt(
    () => {
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
        const rowPlaceholders = definition.fields.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
        const insertFields = db.prepare(`
          INSERT INTO _fields (_table_id, _name, _label, _type, _required, _default_value, _options, _formula, _sort_order)
          VALUES ${rowPlaceholders}
        `);
        const insertFieldParams = definition.fields.flatMap((field, index) => [
          tableId,
          field.name,
          field.label,
          field.type,
          field.required ? 1 : 0,
          field.defaultValue ? JSON.stringify(field.defaultValue) : null,
          field.options ? JSON.stringify(field.options) : null,
          field.formula ?? null,
          index,
        ]);
        insertFields.run(...insertFieldParams);
      }

      const columnDefs = definition.fields.map(f => {
        let def = `"${f.name}" TEXT`;
        if (f.required) def += ' NOT NULL';
        return def;
      });
      columnDefs.push('id INTEGER PRIMARY KEY AUTOINCREMENT');
      columnDefs.push('created_at TEXT DEFAULT (strftime(\'%Y-%m-%dT%H:%M:%fZ\', \'now\'))');

      const uniqueFields = definition.fields.filter(f => f.unique);
      if (uniqueFields.length > 0) {
        const uniqueColumns = uniqueFields.map(f => `"${f.name}"`).join(', ');
        columnDefs.push(`UNIQUE(${uniqueColumns})`);
      }

      db.exec(`CREATE TABLE IF NOT EXISTS "${definition.name}" (${columnDefs.join(', ')})`);
      db.exec('COMMIT');

      return tableId;
    },
    (error) => {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return TransactionError({ reason: String(error) });
    }
  );
};

const addFieldToTable = (
  db: Database.Database,
  tableId: number,
  tableName: string,
  definition: FieldDefinition
): Try<number, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof TransactionError>> => {
  if (!validateIdentifier(definition.name)) {
    return err(InvalidIdentifierError({ identifier: definition.name }));
  }
  return attempt(
    () => {
      db.exec('BEGIN IMMEDIATE');

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
      const fieldId = result.lastInsertRowid as number;

      let columnDef = `"${definition.name}" TEXT`;
      if (definition.required) columnDef += ' NOT NULL';
      db.exec(`ALTER TABLE "${tableName}" ADD COLUMN ${columnDef}`);

      db.exec('COMMIT');
      return fieldId;
    },
    (error) => {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return TransactionError({ reason: String(error) });
    }
  );
};

const addViewToSchema = (
  db: Database.Database,
  tableId: number | null,
  definition: { name: string; icon?: string; type: string; config: Record<string, unknown> }
): Try<number, ReturnType<typeof SchemaError | typeof TransactionError>> => {
  return attempt(
    () => {
      db.exec('BEGIN IMMEDIATE');

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
      const viewId = result.lastInsertRowid as number;

      db.exec('COMMIT');
      return viewId;
    },
    (error) => {
      try { db.exec('ROLLBACK'); } catch { /* ignore */ }
      return TransactionError({ reason: String(error) });
    }
  );
};

export { createUserTable, addFieldToTable, addViewToSchema };
