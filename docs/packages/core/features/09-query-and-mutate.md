# CRUD Operations

The `Pane` handle provides simple CRUD methods for reading and writing data.

## read()

Fetch records from a table.

```typescript
const rows = pane.read(table: string, options?: ReadOptions): Row[]

type ReadOptions = {
  where?: FilterDefinition;
  orderBy?: { field: string; direction: 'asc' | 'desc' };
  limit?: number;
  offset?: number;
};
```

**Examples:**

```typescript
// All records
const rows = pane.read('employees');

// With filter
const active = pane.read('employees', {
  where: { field: 'status', operator: 'eq', value: 'active' },
});

// With sorting and limit
const recent = pane.read('employees', {
  orderBy: { field: 'hire_date', direction: 'desc' },
  limit: 10,
});
```

**Returns:** Array of `Row` objects. Empty array if no results.

---

## create()

Insert a new record.

```typescript
const result = pane.create(table: string, values: Record<string, unknown>): CreateResult

type CreateResult =
  | { ok: true; id: number }
  | { ok: false; error: ValidationError | WriteError };
```

**Example:**

```typescript
const result = pane.create('employees', {
  name: 'Alice',
  email: 'alice@example.com',
  department_id: 1,
  status: 'active',
});

if (result.ok) {
  console.log(`Created employee with id: ${result.id}`);
}
```

---

## update()

Update an existing record.

```typescript
const result = pane.update(table: string, id: number, values: Record<string, unknown>): UpdateResult
```

**Example:**

```typescript
const result = pane.update('employees', 42, {
  status: 'inactive',
  updated_at: new Date().toISOString(),
});

if (result.ok) {
  console.log(`Updated record`);
}
```

---

## delete()

Delete a record.

```typescript
const result = pane.delete(table: string, id: number): DeleteResult
```

**Example:**

```typescript
const result = pane.delete('employees', 42);
```

---

## upsert()

Insert or update based on unique field(s).

```typescript
const result = pane.upsert(
  table: string,
  values: Record<string, unknown>,
  matchFields: string[]
): UpsertResult
```

**Example:**

```typescript
// Insert if email doesn't exist, update if it does
const result = pane.upsert('employees', {
  email: 'alice@example.com',
  name: 'Alice',
  status: 'active',
}, ['email']);

if (result.ok) {
  console.log(`Upserted with id: ${result.id}`);
}
```

---

## query() [Advanced]

For complex queries beyond simple CRUD, use `query()` with raw SQL:

```typescript
const rows = pane.query(sql: string, params?: readonly unknown[]): Row[]
```

**Examples:**

```typescript
// JOIN query
const rows = pane.query(`
  SELECT e.name, d.label as department
  FROM employees e
  JOIN departments d ON e.department_id = d.id
  WHERE e.status = ?
`, ['active']);

// Aggregation
const count = pane.query('SELECT COUNT(*) as total FROM employees')[0].total;
```

---

## Validation

All write operations validate values against the table schema:

| Type | Validation |
|------|------------|
| `text` / `textarea` | Coerced to string |
| `number` | Must be finite number |
| `boolean` | 0 or 1 |
| `date` / `datetime` | ISO 8601 format |
| `select` | Must be in options array |
| `multiselect` | All items must be in options array |
| `foreign` | Must reference existing id in target table |
| `file` | Relative path (sanitized) |
| `formula` | Ignored on write (computed, not stored) |

---

## System Fields

If a table has `createdAt` or `updatedAt` columns, they are auto-populated:

- **`create()`:** Sets `createdAt` and `updatedAt` to now
- **`update()`:** Sets `updatedAt` to now

---

## Example: Full CRUD

```typescript
const pane = openPane('/shared/payroll.pane');

// Create
const { id } = pane.create('employees', {
  name: 'Alice',
  email: 'alice@example.com',
});

// Read
const [employee] = pane.read('employees', {
  where: { field: 'id', operator: 'eq', value: id },
});

// Update
pane.update('employees', id, {
  status: 'inactive',
});

// Delete
pane.delete('employees', id);

pane.commit();
```

---

## See Also

- [Document Lifecycle](./02-document-lifecycle.md) — Pane handle overview
- [Schema Mutations](./10-schema-mutations.md) — Table and field operations
- [Filter Definition](./08-views-and-widgets.md#filter-definition) — Filter syntax
