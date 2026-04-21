# Schema System

The schema system defines the structure of user-defined tables via system tables stored **inside** the `.pane` file.

## System Tables

These tables are created automatically in every `.pane` file:

| Table | Purpose |
|-------|---------|
| `_meta` | Document metadata (version, created_at, last_modified) |
| `_tables` | User-defined table definitions |
| `_fields` | Field definitions for each table |
| `_relations` | Foreign key relationships |

## Drizzle Schema

```typescript
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// Internal prefix "_" avoids naming conflicts with user table names

export const meta = sqliteTable('_meta', {
  key: text('_key').primaryKey(),
  value: text('_value'),
});

export const tables = sqliteTable('_tables', {
  id: integer('_id').primaryKey().autoincrement(),
  name: text('_name').notNull().unique(),
  label: text('_label').notNull(),
  labelPlural: text('_label_plural').notNull(),
  icon: text('_icon'),
  sortOrder: integer('_sort_order').default(0),
  createdAt: text('_created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});

export const fields = sqliteTable('_fields', {
  id: integer('_id').primaryKey().autoincrement(),
  tableId: integer('_table_id').notNull().references(() => tables.id),
  name: text('_name').notNull(),
  label: text('_label').notNull(),
  type: text('_type').notNull(),
  required: integer('_required').default(0),
  defaultValue: text('_default_value'),
  options: text('_options'),           // JSON array for select/multiselect
  foreignTableId: integer('_foreign_table_id').references(() => tables.id),
  formula: text('_formula'),
  validation: text('_validation'),    // JSON object
  sortOrder: integer('_sort_order').default(0),
}, (table) => [
  uniqueIndex('_table_name_idx').on(table.tableId, table.name),
  index('_fields_table_idx').on(table.tableId),
]);

export const relations = sqliteTable('_relations', {
  id: integer('_id').primaryKey().autoincrement(),
  fromTableId: integer('_from_table_id').references(() => tables.id),
  fromFieldId: integer('_from_field_id').references(() => fields.id),
  toTableId: integer('_to_table_id').references(() => tables.id),
  toFieldId: integer('_to_field_id').references(() => fields.id),
}, (table) => [
  uniqueIndex('_from_field_idx').on(table.fromFieldId),
]);
```

> **Note:** Internal column names use `_` prefix to avoid conflicts with user-defined field names.

---

## Schema Types

The `Schema` type represents the complete schema of a `.pane` document:

```typescript
type Schema = {
  readonly version: string;
  readonly tables: readonly TableDefinition[];
};

type TableDefinition = {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly labelPlural: string;
  readonly icon?: string;
  readonly fields: readonly FieldDefinition[];
};

type FieldDefinition = {
  readonly id: number;
  readonly name: string;
  readonly label: string;
  readonly type: FieldType;
  readonly required: boolean;
  readonly defaultValue?: unknown;
  readonly options?: readonly string[];
  readonly foreignTable?: string;
  readonly formula?: string;
};

type FieldType =
  | 'text' | 'textarea' | 'number' | 'boolean'
  | 'date' | 'datetime' | 'select' | 'multiselect'
  | 'foreign' | 'file' | 'formula';
```

---

## Reading Schema

```typescript
const readSchema = (db: Database): Schema
```

Reads `_tables` and `_fields`, joins them, and returns a `Schema` object with full table and field definitions.

---

## Dynamic Table Creation

When a user defines a new table, `@pane/core` creates it in two steps:

1. Insert into `_tables` and `_fields` (schema metadata)
2. Create the actual SQLite table

```typescript
import { db } from '@pane/core';
import { tables, fields } from './schema';
import { eq } from 'drizzle-orm';

const createTable = (definition: TableDefinition): number => {
  // 1. Register table in _tables
  const [tableRecord] = db.insert(tables).values({
    name: definition.name,
    label: definition.label,
    labelPlural: definition.labelPlural,
    icon: definition.icon,
    sortOrder: definition.sortOrder ?? 0,
  }).returning({ id: tables.id });

  // 2. Insert field definitions
  for (const field of definition.fields) {
    db.insert(fields).values({
      tableId: tableRecord.id,
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required ? 1 : 0,
      defaultValue: field.defaultValue,
      options: field.options ? JSON.stringify(field.options) : null,
      foreignTableId: field.foreignTable ? getTableId(field.foreignTable) : null,
      formula: field.formula,
    });
  }

  // 3. Create the actual SQL table
  db.execute(buildCreateTableSQL(definition));

  return tableRecord.id;
};
```

---

## User Data Tables

User-defined tables are standard Drizzle tables with an auto-incrementing `id`:

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// Equipment table created by user
export const equipment = sqliteTable('equipment', {
  id: integer('id').primaryKey().autoincrement(),
  name: text('name').notNull(),
  type: text('type').notNull(),           // select: 'Computer' | 'Furniture' | ...
  status: text('status').notNull(),        // select: 'Available' | 'In Use' | ...
  assignedTo: integer('assigned_to').references(() => employees.id),
  createdAt: text('created_at').default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
```

Drizzle automatically creates the index on the foreign key column.

---

## Schema Evolution

The schema can change over time:

- **Add table** — Insert into `_tables`, create SQL table
- **Add field** — Insert into `_fields`, ALTER TABLE ADD COLUMN
- **Rename table** — Update `_tables`, ALTER TABLE RENAME TO
- **Delete field** — Mark deleted in `_fields` (soft delete), `DROP COLUMN` (SQLite 3.35.0+)
- **Delete table** — Mark deleted in `_tables`, DROP TABLE

---

## See Also

- [Field Types](./05-field-types.md) — All available field types
- [Schema Mutations](./10-schema-mutations.md) — Runtime schema modifications
