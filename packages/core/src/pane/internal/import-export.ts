// Import/Export operations for CSV and JSON formats
import Database from 'better-sqlite3';
import { ok, err, attempt } from '@deessejs/fp';
import type { Try } from '@deessejs/fp';
import type { Row } from '../primitives';
import { isSystemTable, validateIdentifier } from './helpers';
import { SchemaError, InvalidIdentifierError, SystemTableError } from './errors';

// ============================================================================
// CSV Parsing
// ============================================================================

/**
 * Parse a single CSV line handling quoted fields
 */
const parseCsvLine = (line: string): string[] => {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
};

/**
 * Parse CSV content into rows
 */
const parseCsvContent = (csvContent: string): Try<{ headers: string[]; rows: string[][] }, ReturnType<typeof SchemaError>> => {
  return attempt(() => {
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    const headers = parseCsvLine(lines[0]);
    const rows = lines.slice(1).map(line => parseCsvLine(line));

    return { headers, rows };
  }, (error) => SchemaError({ reason: `CSV parse error: ${String(error)}` }));
};

// ============================================================================
// Value conversion and validation
// ============================================================================

/**
 * Convert string value to appropriate type based on field definition
 */
const convertValue = (
  value: string,
  fieldType: string
): { ok: true; value: string | number | boolean | null }
  | { ok: false; error: string } => {
  if (value === '' || value === null || value === undefined) {
    return { ok: true, value: null };
  }

  const lowerType = fieldType.toLowerCase();
  switch (lowerType) {
    case 'number':
    case 'currency':
    case 'rating': {
      const num = parseFloat(value);
      if (isNaN(num)) {
        return { ok: false, error: `Invalid number: ${value}` };
      }
      return { ok: true, value: num };
    }
    case 'checkbox': {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1' || lower === 'yes') {
        return { ok: true, value: 1 };
      }
      if (lower === 'false' || lower === '0' || lower === 'no') {
        return { ok: true, value: 0 };
      }
      return { ok: false, error: `Invalid boolean: ${value}` };
    }
    default:
      return { ok: true, value };
  }
};

// ============================================================================
// Import: CSV
// ============================================================================

const importCsv = (
  db: Database.Database,
  table: string,
  csvContent: string,
  columnMapping?: Record<string, string>
): Try<number[], ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }

  return attempt(() => {
    // Parse CSV
    const parseResult = parseCsvContent(csvContent);
    if (!parseResult.ok) {
      throw parseResult.error;
    }

    const { headers, rows } = parseResult.value;
    if (headers.length === 0) {
      return [];
    }

    // Get table schema to validate fields
    // Note: SQLite stores all values as TEXT, so we need to look up the semantic type
    // from the _fields table rather than PRAGMA table_info
    const tableIdResult = db.prepare('SELECT _id FROM _tables WHERE _name = ?').get(table) as { _id: number } | undefined;
    if (!tableIdResult) {
      throw SchemaError({ reason: `Table not found: ${table}` });
    }

    // Get field types from _fields table (semantic types, not SQLite storage types)
    const fieldTypes = db.prepare('SELECT _name, _type FROM _fields WHERE _table_id = ?').all(tableIdResult._id) as { _name: string; _type: string }[];
    if (fieldTypes.length === 0) {
      throw SchemaError({ reason: `Table not found: ${table}` });
    }

    // Build column mapping (file column -> table column)
    const mappedColumns: { fileIndex: number; tableColumn: string; fieldType: string }[] = [];
    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      let tableColumn = columnMapping?.[header] ?? header;

      // Find the field in our semantic type map
      const fieldInfo = fieldTypes.find(f => f._name === tableColumn);
      if (!fieldInfo) {
        // Try case-insensitive match
        const caseInsensitiveMatch = fieldTypes.find(f => f._name.toLowerCase() === tableColumn.toLowerCase());
        if (caseInsensitiveMatch) {
          tableColumn = caseInsensitiveMatch._name;
          mappedColumns.push({ fileIndex: i, tableColumn, fieldType: caseInsensitiveMatch._type });
        }
        // Skip columns that don't match any table field
      } else {
        mappedColumns.push({ fileIndex: i, tableColumn, fieldType: fieldInfo._type });
      }
    }

    const insertedIds: number[] = [];

    // Insert each row
    for (const row of rows) {
      const values: Row = {};
      for (const { fileIndex, tableColumn, fieldType } of mappedColumns) {
        const rawValue = row[fileIndex] ?? '';
        const converted = convertValue(rawValue, fieldType);
        if (!converted.ok) {
          // Throw a proper error with name property
          const errObj = { name: 'ValidationError', message: `Row error: ${converted.error}` };
          throw errObj;
        }
        values[tableColumn] = converted.value;
      }

      const columns = Object.keys(values);
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      const serializedValues = Object.values(values).map(v =>
        Array.isArray(v) ? JSON.stringify(v) : v
      );
      const id = stmt.run(...serializedValues).lastInsertRowid as number;
      insertedIds.push(id);
    }

    return insertedIds;
  }, (error) => {
    if (error && typeof error === 'object' && 'name' in error) {
      return error as ReturnType<typeof SchemaError>;
    }
    return SchemaError({ reason: String(error) });
  });
};

// ============================================================================
// Export: CSV
// ============================================================================

const exportCsv = (
  db: Database.Database,
  table: string
): Try<string, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }

  return attempt(() => {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    const rows = stmt.all() as Row[];

    if (rows.length === 0) {
      return '';
    }

    // Get headers from first row
    const headers = Object.keys(rows[0]);

    // Build CSV lines
    const lines: string[] = [];

    // Header line
    lines.push(headers.map(h => `"${h.replace(/"/g, '""')}"`).join(','));

    // Data lines
    for (const row of rows) {
      const values = headers.map(h => {
        const value = row[h];
        if (value === null || value === undefined) {
          return '';
        }
        if (Array.isArray(value)) {
          return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        }
        const str = String(value);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      lines.push(values.join(','));
    }

    return lines.join('\n');
  }, (error) => SchemaError({ reason: String(error) }));
};

// ============================================================================
// Import: JSON
// ============================================================================

const importJson = (
  db: Database.Database,
  table: string,
  jsonContent: string,
  columnMapping?: Record<string, string>
): Try<number[], ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }

  return attempt(() => {
    // Parse JSON
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonContent);
    } catch (e) {
      throw SchemaError({ reason: `Invalid JSON: ${String(e)}` });
    }

    if (!Array.isArray(parsed)) {
      throw SchemaError({ reason: 'JSON content must be an array' });
    }

    if (parsed.length === 0) {
      return [];
    }

    // Get table schema to validate fields
    // Note: SQLite stores all values as TEXT, so we need to look up the semantic type
    // from the _fields table rather than PRAGMA table_info
    const tableIdResult = db.prepare('SELECT _id FROM _tables WHERE _name = ?').get(table) as { _id: number } | undefined;
    if (!tableIdResult) {
      throw SchemaError({ reason: `Table not found: ${table}` });
    }

    // Get field types from _fields table (semantic types, not SQLite storage types)
    const fieldTypes = db.prepare('SELECT _name, _type FROM _fields WHERE _table_id = ?').all(tableIdResult._id) as { _name: string; _type: string }[];
    if (fieldTypes.length === 0) {
      throw SchemaError({ reason: `Table not found: ${table}` });
    }

    const insertedIds: number[] = [];

    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      if (typeof item !== 'object' || item === null) {
        throw SchemaError({ reason: `Row ${i + 1}: expected object` });
      }

      const values: Row = {};
      const obj = item as Record<string, unknown>;

      for (const [fileKey, fileValue] of Object.entries(obj)) {
        // Apply column mapping if provided
        const tableColumn = columnMapping?.[fileKey] ?? fileKey;

        // Find table field in our semantic type map
        const fieldInfo = fieldTypes.find(f => f._name === tableColumn);
        if (!fieldInfo) {
          // Try case-insensitive match
          const match = fieldTypes.find(f => f._name.toLowerCase() === tableColumn.toLowerCase());
          if (match) {
            const converted = convertValue(String(fileValue ?? ''), match._type);
            if (!converted.ok) {
              throw SchemaError({ reason: `Row ${i + 1}, field ${tableColumn}: ${converted.error}` });
            }
            values[match._name] = converted.value;
          }
          continue;
        }

        const converted = convertValue(String(fileValue ?? ''), fieldInfo._type);
        if (!converted.ok) {
          throw SchemaError({ reason: `Row ${i + 1}, field ${tableColumn}: ${converted.error}` });
        }
        values[tableColumn] = converted.value;
      }

      const columns = Object.keys(values);
      const placeholders = columns.map(() => '?').join(', ');
      const stmt = db.prepare(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
      const serializedValues = Object.values(values).map(v =>
        Array.isArray(v) ? JSON.stringify(v) : v
      );
      const id = stmt.run(...serializedValues).lastInsertRowid as number;
      insertedIds.push(id);
    }

    return insertedIds;
  }, (error) => {
    if (error && typeof error === 'object' && 'name' in error) {
      return error as ReturnType<typeof SchemaError>;
    }
    return SchemaError({ reason: String(error) });
  });
};

// ============================================================================
// Export: JSON
// ============================================================================

const exportJson = (
  db: Database.Database,
  table: string
): Try<string, ReturnType<typeof SchemaError | typeof InvalidIdentifierError | typeof SystemTableError>> => {
  if (isSystemTable(table)) {
    return err(SystemTableError({ table }));
  }
  if (!validateIdentifier(table)) {
    return err(InvalidIdentifierError({ identifier: table }));
  }

  return attempt(() => {
    const stmt = db.prepare(`SELECT * FROM ${table}`);
    const rows = stmt.all() as Row[];

    // Parse JSON strings for array fields
    const parsedRows = rows.map(row => {
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

    return JSON.stringify(parsedRows, null, 2);
  }, (error) => SchemaError({ reason: String(error) }));
};

// ============================================================================
// Exports
// ============================================================================

export { importCsv, exportCsv, importJson, exportJson };