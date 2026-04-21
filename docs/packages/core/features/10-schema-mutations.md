# Schema Mutations

The `Pane` handle provides methods for creating, modifying, and deleting tables and fields at runtime.

## addTable()

Create a new table:

```typescript
const tableId = pane.addTable(definition: TableDefinition): number
```

**Example:**

```typescript
const tableId = pane.addTable({
  name: 'equipment',
  label: 'Equipment',
  labelPlural: 'Equipment',
  icon: 'box',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'type', label: 'Type', type: 'select', options: ['Computer', 'Furniture', 'Vehicle'] },
    { name: 'status', label: 'Status', type: 'select', options: ['Available', 'In Use', 'Broken'] },
    { name: 'assignedTo', label: 'Assigned To', type: 'foreign', foreignTable: 'employees' },
  ],
});

console.log(`Created table with id: ${tableId}`);
```

**What it does:**
1. Inserts record into `_tables`
2. Inserts field definitions into `_fields`
3. Creates the actual SQL table
4. Creates indexes on foreign key columns
5. Auto-generates a default list view

---

## renameTable()

Rename an existing table:

```typescript
pane.renameTable(tableId: number, newName: string, newLabel: string): void
```

**Example:**

```typescript
pane.renameTable(tableId, 'vehicles', 'Vehicle');
```

> **Note:** `newName` must be unique across all table names.

---

## deleteTable()

Soft-delete a table (marks as deleted, preserves data):

```typescript
pane.deleteTable(tableId: number): void
```

**Example:**

```typescript
pane.deleteTable(tableId);
// Table marked as deleted, hidden from UI
// Data preserved in SQL table
```

> **Safety:** `deleteTable()` performs a **soft delete**. Use `dropTable()` to permanently delete.

---

## dropTable()

Permanently delete a table and all its data:

```typescript
pane.dropTable(tableId: number): void
```

> **Warning:** This deletes the SQL table and ALL DATA. This cannot be undone.

**Cascades to:**
- All field definitions removed from `_fields`
- All views associated with this table deleted
- `_relations` cleanup

---

## addField()

Add a new field to an existing table:

```typescript
const fieldId = pane.addField(tableId: number, definition: FieldDefinition): number
```

**Example:**

```typescript
const fieldId = pane.addField(tableId, {
  name: 'serialNumber',
  label: 'Serial Number',
  type: 'text',
  required: false,
});
```

> **Note:** Adding a field with `type: 'formula'` does NOT add a SQL column — formula fields are computed, not stored.

---

## updateField()

Modify an existing field definition:

```typescript
pane.updateField(fieldId: number, changes: Partial<FieldDefinition>): void
```

**Example:**

```typescript
pane.updateField(fieldId, {
  label: 'Equipment Status',
  required: true,
  options: ['Available', 'In Use', 'Broken'],
});
```

**Allowed changes:**
- `label` — Display label
- `required` — Required flag
- `options` — For `select`/`multiselect` types
- `defaultValue` — Default value
- `sortOrder` — Display order

**Not allowed to change:**
- `name` — Use `renameField()` instead
- `type` — Changing type requires recreating the field

---

## renameField()

Rename a field:

```typescript
pane.renameField(fieldId: number, newName: string, newLabel: string): void
```

---

## deleteField()

Soft-delete a field:

```typescript
pane.deleteField(fieldId: number): void
```

Performs a **soft delete** — field marked as deleted in `_fields`, but data preserved.

---

## dropField()

Permanently remove a field:

```typescript
pane.dropField(fieldId: number): void
```

> **Warning:** Requires SQLite 3.35.0+. Returns error on older versions.

---

## Code-First Table Definition

For TypeScript developers, define tables directly with Drizzle schema syntax:

```typescript
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import { pane } from '@pane/core';

export const equipment = sqliteTable('equipment', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  status: text('status').notNull(),
  assignedTo: integer('assigned_to').references(() => employees.id),
  createdAt: text('created_at'),
}, (table) => [
  index('idx_type').on(table.type),
]);

pane.registerTable(equipment, {
  label: 'Equipment',
  labelPlural: 'Equipment',
  icon: 'box',
});
```

**What `registerTable` does:**
1. Inserts record into `_tables` with metadata
2. Reads Drizzle column definitions and inserts into `_fields`
3. Creates the SQL table (if not exists)
4. Creates indexes
5. Auto-generates a default list view

### Field Mapping

Drizzle column types map to pane field types:

| Drizzle | Pane Field Type | Notes |
|---------|----------------|-------|
| `text()` | `text` | |
| `integer()` (number) | `number` | |
| `text()` with ISO date | `date` / `datetime` | When column name contains `date` |
| `text()` + `.references()` | `foreign` | |
| `text()` with JSON array | `multiselect` | When `.array()` modifier |
| (no column) | `formula` | Via `.generated()` |

---

## Example: Building a Schema

```typescript
const pane = createPane({ path: '/new/hr.pane' });

// Create employees table
const empTableId = pane.addTable({
  name: 'employees',
  label: 'Employee',
  labelPlural: 'Employees',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'text' },
    { name: 'department', label: 'Department', type: 'select', options: ['Engineering', 'Sales', 'HR'] },
    { name: 'hireDate', label: 'Hire Date', type: 'date' },
  ],
});

// Create equipment table with foreign key to employees
const eqTableId = pane.addTable({
  name: 'equipment',
  label: 'Equipment',
  labelPlural: 'Equipment',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'type', label: 'Type', type: 'select', options: ['Computer', 'Furniture', 'Vehicle'] },
    { name: 'status', label: 'Status', type: 'select', options: ['Available', 'In Use', 'Broken'] },
    { name: 'assignedTo', label: 'Assigned To', type: 'foreign', foreignTable: 'employees' },
  ],
});

pane.commit();
```

---

## See Also

- [Document Lifecycle](./02-document-lifecycle.md) — Pane handle overview
- [Schema System](./04-schema-system.md) — System tables and types
- [Field Types](./05-field-types.md) — All available field types
