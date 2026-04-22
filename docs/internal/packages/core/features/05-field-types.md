# Field Types

Each field in a user-defined table has a specific type that determines how data is stored and rendered.

## Supported Types

| Type | Description | SQLite Storage | Notes |
|------|-------------|----------------|-------|
| `text` | Single-line string | TEXT | Max ~65k characters |
| `textarea` | Multi-line text | TEXT | No practical limit |
| `number` | Integer or decimal | REAL | 64-bit float |
| `boolean` | Yes/No toggle | INTEGER | 0 = false, 1 = true |
| `date` | Date only | TEXT | ISO 8601: `2024-01-15` |
| `datetime` | Date + time | TEXT | ISO 8601: `2024-01-15T10:30:00.000Z` |
| `select` | Single choice | TEXT | Value from options array |
| `multiselect` | Multiple choices | TEXT | JSON array: `["opt1", "opt2"]` |
| `foreign` | Lookup to another table | INTEGER | FK to target table's `id` |
| `file` | File attachment | TEXT | Relative path in sidecar folder |
| `formula` | Calculated value | — | Computed at read time, not stored |

## Type Definitions

```typescript
type FieldDefinition = {
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly options?: readonly string[];     // select, multiselect
  readonly foreignTable?: string;           // foreign type only
  readonly formula?: string;               // formula type only
};

type FieldType =
  | 'text' | 'textarea' | 'number' | 'boolean'
  | 'date' | 'datetime' | 'select' | 'multiselect'
  | 'foreign' | 'file' | 'formula';
```

## select

Single-choice from predefined options:

```typescript
{
  name: 'status',
  label: 'Status',
  type: 'select',
  required: true,
  options: ['Active', 'Inactive', 'Pending'],
}
```

UI renders as dropdown. Stored as plain string value.

## multiselect

Multiple choices from predefined options:

```typescript
{
  name: 'tags',
  label: 'Tags',
  type: 'multiselect',
  options: ['Urgent', 'Review', 'Blocked', 'Done'],
}
```

UI renders as checkbox group. Stored as JSON array: `["Urgent", "Done"]`.

## foreign

Reference to a record in another table:

```typescript
{
  name: 'department_id',
  label: 'Department',
  type: 'foreign',
  required: false,
  foreignTable: 'departments',
}
```

UI renders as searchable dropdown/lookup. Stored as integer (the `id` of the referenced record).

## file

Attachment stored in sidecar folder:

```typescript
{
  name: 'document',
  label: 'Document',
  type: 'file',
}
```

UI renders as file picker/upload button. Stored as relative path: `employees/emp_001_contract.pdf`.

## formula

Calculated at read time, not stored:

```typescript
{
  name: 'total_price',
  label: 'Total Price',
  type: 'formula',
  formula: 'unit_price * quantity * (1 - discount)',
}
```

Evaluated using `jsep` expression parser. Dependencies tracked automatically.

> **Circular dependencies:** If field A depends on field B which depends on field A, the result is undefined. Avoid creating circular formula dependencies.

## Type Validation

When `mutate()` is called, field values are validated against their type:

```typescript
type ValidationError = {
  code: 'VALIDATION_ERROR';
  field: string;
  message: string;
};

// Examples of validation rules:
// - number: must be finite, not NaN
// - date: must match ISO 8601 format
// - select: must be one of options[]
// - multiselect: all items must be in options[]
// - foreign: must reference existing id in foreignTable
```

## SQL Column Type Mapping

When creating user tables, field types map to SQLite types:

| FieldType | SQLite Type | Notes |
|-----------|-------------|-------|
| text, textarea | TEXT | |
| number | REAL | For currency, use INTEGER (cents) instead |
| boolean | INTEGER | 0/1 |
| date, datetime | TEXT | ISO 8601 strings |
| select | TEXT | |
| multiselect | TEXT | JSON array |
| foreign | INTEGER | FK with index |
| file | TEXT | Relative path |
| formula | — | No column, computed |