// Data operations (CRUD)
import Database from 'better-sqlite3';
import { ok, err, attempt } from '@deessejs/fp';
import type { Try } from '@deessejs/fp';
import type { Row } from '../primitives';
import type { FilterCondition, OrderBy, ReadOptions } from '../types';
import { isSystemTable, validateIdentifier } from './helpers';
import { SchemaError, InvalidIdentifierError, SystemTableError } from './errors';

const buildWhereClause = (
  conditions: readonly FilterCondition[]
): { clause: string; values: (string | number)[] } => {
  const clauses: string[] = [];
  const values: (string | number)[] = [];

  for (const cond of conditions) {
    if (!validateIdentifier(cond.field)) {
      continue; // Skip invalid fields
    }

    switch (cond.operator) {
      case '=':
      case '!=':
      case '>':
      case '<':
      case '>=':
      case '<=':
        clauses.push(`${cond.field} ${cond.operator} ?`);
        values.push(cond.value as string | number);
        break;
      case 'like':
        clauses.push(`${cond.field} LIKE ?`);
        values.push(`%${cond.value}%`);
        break;
      case 'in':
        if (Array.isArray(cond.value) && cond.value.length > 0) {
          const placeholders = cond.value.map(() => '?').join(', ');
          clauses.push(`${cond.field} IN (${placeholders})`);
          values.push(...cond.value.map(v => v as string | number));
        }
        break;
      case 'not_in':
        if (Array.isArray(cond.value) && cond.value.length > 0) {
          const placeholders = cond.value.map(() => '?').join(', ');
          clauses.push(`${cond.field} NOT IN (${placeholders})`);
          values.push(...cond.value.map(v => v as string | number));
        }
        break;
    }
  }

  return { clause: clauses.join(' AND '), values };
};

const buildOrderByClause = (
  orderBy: readonly OrderBy[]
): string => {
  const clauses: string[] = [];

  for (const order of orderBy) {
    if (!validateIdentifier(order.field)) {
      continue; // Skip invalid fields
    }
    const direction = order.direction === 'desc' ? 'DESC' : 'ASC';
    clauses.push(`${order.field} ${direction}`);
  }

  return clauses.join(', ');
};

const readRows = (
  db: Database.Database,
  table: string,
  options?: ReadOptions
): Try<readonly Row[], ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  return attempt(
    () => {
      let sql = `SELECT * FROM ${table}`;

      // Build WHERE clause
      const whereClause = options?.where && options.where.length > 0
        ? buildWhereClause(options.where)
        : null;

      if (whereClause && whereClause.clause) {
        sql += ` WHERE ${whereClause.clause}`;
      }

      // Build ORDER BY clause
      const orderByClause = options?.orderBy && options.orderBy.length > 0
        ? buildOrderByClause(options.orderBy)
        : null;

      if (orderByClause) {
        sql += ` ORDER BY ${orderByClause}`;
      }

      // Add LIMIT
      if (options?.limit !== undefined && options.limit > 0) {
        sql += ` LIMIT ${options.limit}`;
      }

      // Add OFFSET
      if (options?.offset !== undefined && options.offset > 0) {
        sql += ` OFFSET ${options.offset}`;
      }

      const stmt = db.prepare(sql);
      const rows = whereClause && whereClause.values.length > 0
        ? stmt.all(...whereClause.values) as Row[]
        : stmt.all() as Row[];
      // Parse JSON for any field that looks like a JSON array string
      return rows.map(row => {
        const parsed: Row = {};
        for (const [key, value] of Object.entries(row)) {
          if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
            try {
              parsed[key] = JSON.parse(value);
            } catch {
              parsed[key] = value;
            }
          } else {
            parsed[key] = value;
          }
        }
        return parsed;
      });
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

const insertRow = (
  db: Database.Database,
  table: string,
  values: Row
): Try<number, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  const columns = Object.keys(values);
  for (const column of columns) {
    if (!validateIdentifier(column)) {
      return err(InvalidIdentifierError({ identifier: column }));
    }
  }
  return attempt(
    () => {
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      // JSON.stringify array values before inserting
      const serializedValues = Object.values(values).map(v =>
        Array.isArray(v) ? JSON.stringify(v) : v
      );
      return stmt.run(...serializedValues).lastInsertRowid as number;
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

const updateRow = (
  db: Database.Database,
  table: string,
  id: number,
  values: Row
): Try<undefined, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  const columns = Object.keys(values);
  for (const column of columns) {
    if (!validateIdentifier(column)) {
      return err(InvalidIdentifierError({ identifier: column }));
    }
  }
  return attempt(
    () => {
      const setClause = columns.map(k => `${k} = ?`).join(', ');
      const stmt = db.prepare(`UPDATE ${table} SET ${setClause} WHERE id = ?`);
      stmt.run(...Object.values(values), id);
      return undefined;
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

const deleteRow = (
  db: Database.Database,
  table: string,
  id: number
): Try<undefined, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
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
      return undefined;
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

const upsertRow = (
  db: Database.Database,
  table: string,
  values: Row,
  matchFields: string[]
): Try<{ id: number; action: 'inserted' | 'updated' }, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }
  const columns = Object.keys(values);
  for (const column of columns) {
    if (!validateIdentifier(column)) {
      return err(InvalidIdentifierError({ identifier: column }));
    }
  }
  for (const field of matchFields) {
    if (!validateIdentifier(field)) {
      return err(InvalidIdentifierError({ identifier: field }));
    }
  }
  return attempt(
    () => {
      const columns = Object.keys(values);
      const valuesList = Object.values(values).map(v => {
        if (Array.isArray(v)) return JSON.stringify(v);
        return v;
      });

      if (matchFields.length > 0) {
        const existingStmt = db.prepare(`SELECT id FROM ${table} WHERE ${matchFields.map(f => `${f} = ?`).join(' AND ')}`);
        const existingValues = matchFields.map(f => values[f]);
        const existing = existingStmt.get(...existingValues) as { id: number } | undefined;

        if (existing) {
          const nonMatchColumns = columns.filter(c => !matchFields.includes(c));
          const setClause = nonMatchColumns.map(k => `${k} = ?`).join(', ');
          const updateSql = `UPDATE ${table} SET ${setClause} WHERE id = ?`;
          const updateStmt = db.prepare(updateSql);
          const updateValues = nonMatchColumns.map(k => {
            const v = values[k];
            if (Array.isArray(v)) return JSON.stringify(v);
            return v;
          });
          updateStmt.run(...updateValues, existing.id);
          return { id: existing.id, action: 'updated' as const };
        } else {
          const placeholders = columns.map(() => '?').join(', ');
          const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
          const stmt = db.prepare(sql);
          return { id: stmt.run(...valuesList).lastInsertRowid as number, action: 'inserted' as const };
        }
      }

      const placeholders = columns.map(() => '?').join(', ');
      const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
      const stmt = db.prepare(sql);
      return { id: stmt.run(...valuesList).lastInsertRowid as number, action: 'inserted' as const };
    },
    (error) => SchemaError({ reason: String(error) })
  );
};

export { readRows, insertRow, updateRow, deleteRow, upsertRow };
