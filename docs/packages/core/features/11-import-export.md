# Import & Export

Move data into and out of `.pane` documents via standard formats.

## Export

Export data from a table or view to a file.

```typescript
const exportTable = (
  db: Database,
  options: ExportOptions
): ExportResult

type ExportOptions = {
  table: string;
  format: 'csv' | 'json';
  path: string;
  columns?: string[];        // Which columns to export (default: all)
  filter?: FilterDefinition; // Row filter
  sort?: SortDefinition;     // Sort order
};

type SortDefinition = {
  field: string;
  direction: 'asc' | 'desc';
};

type ExportResult =
  | { ok: true; path: string; rowCount: number }
  | { ok: false; error: WriteError };
```

**Example:**

```typescript
// Export all employees to CSV
const result = exportTable(db, {
  table: 'employees',
  format: 'csv',
  path: '/exports/employees.csv',
});

if (result.ok) {
  console.log(`Exported ${result.rowCount} rows to ${result.path}`);
}

// Export with filters and specific columns
const result = exportTable(db, {
  table: 'employees',
  format: 'json',
  path: '/exports/engineering_team.json',
  columns: ['name', 'email', 'hire_date'],
  filter: { field: 'department', operator: 'eq', value: 'Engineering' },
  sort: { field: 'hire_date', direction: 'desc' },
});
```

### Export Views

Export a view's filtered/sorted data:

```typescript
const exportView = (
  db: Database,
  options: ExportViewOptions
): ExportResult

type ExportViewOptions = {
  viewId: number;
  format: 'csv' | 'json';
  path: string;
};
```

---

## Import

Import data from a file into a table.

```typescript
const importData = (
  db: Database,
  options: ImportOptions
): ImportResult

type ImportOptions = {
  table: string;
  format: 'csv' | 'json';
  path: string;
  mode: 'insert' | 'upsert' | 'replace';  // How to handle existing data
  matchFields?: string[];  // For upsert/replace: which fields to match
  columnMapping?: Record<string, string>;  // Map file columns to table fields
};

type ImportResult =
  | { ok: true; inserted: number; updated: number; skipped: number }
  | { ok: false; error: ValidationError | WriteError };
```

**Mode behavior:**

| Mode | Existing Row | Non-existing Row |
|------|-------------|------------------|
| `insert` | Error (skipped) | Insert new |
| `upsert` | Update matched | Insert new |
| `replace` | Delete matched, insert new | Insert new |

**Example:**

```typescript
// Import CSV, inserting new records
const result = importData(db, {
  table: 'employees',
  format: 'csv',
  path: '/imports/new_hires.csv',
  mode: 'insert',
});

// Import with column mapping
const result = importData(db, {
  table: 'employees',
  format: 'csv',
  path: '/imports/hr_system.csv',
  mode: 'upsert',
  matchFields: ['email'],  // Match existing by email
  columnMapping: {
    'Full Name': 'name',
    'Email Address': 'email',
    'Dept': 'department',
  },
});
```

---

## File Formats

### CSV

Expected format:
- First row: column headers (must match field names or mapped names)
- Subsequent rows: data
- UTF-8 encoding, comma-separated

### JSON

Expected format:
```json
[
  { "name": "Alice", "email": "alice@example.com" },
  { "name": "Bob", "email": "bob@example.com" }
]
```

---

## Validation During Import

Imported data is validated against field types:

- `number`: Must be finite number
- `date`/`datetime`: Must match ISO 8601
- `select`/`multiselect`: Values must be in options array
- `foreign`: Must reference existing id

---

## Error Handling

```typescript
type ImportError = {
  code: 'IMPORT_ERROR';
  row: number;        // Row number that failed
  field: string;      // Field that failed validation
  value: unknown;    // Value that failed
  message: string;   // Validation message
};
```

Import stops on first validation error. To skip errors:

```typescript
const result = importData(db, {
  table: 'employees',
  format: 'csv',
  path: '/imports/data.csv',
  mode: 'insert',
  onError: 'skip',  // Skip bad rows, continue
});
```

---

## See Also

- [Query & Mutate](./09-query-and-mutate.md) — Reading and writing data
- [Schema Mutations](./10-schema-mutations.md) — Modifying table structure
