// Drizzle schema for system tables
import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// System tables use "_" prefix to avoid conflicts with user table names

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
  options: text('_options'), // JSON array for select/multiselect
  foreignTableId: integer('_foreign_table_id').references(() => tables.id),
  formula: text('_formula'),
  validation: text('_validation'), // JSON object
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

export const views = sqliteTable('_views', {
  id: integer('_id').primaryKey().autoincrement(),
  tableId: integer('_table_id').references(() => tables.id),
  name: text('_name').notNull(),
  icon: text('_icon'),
  type: text('_type').notNull(),
  config: text('_config').notNull().default('{}'), // JSON
  sortOrder: integer('_sort_order').default(0),
}, (table) => [
  index('_views_table_idx').on(table.tableId),
]);

export const widgets = sqliteTable('_widgets', {
  id: integer('_id').primaryKey().autoincrement(),
  viewId: integer('_view_id').notNull().references(() => views.id),
  type: text('_type').notNull(),
  sourceTable: text('_source_table'),
  sourceFilter: text('_source_filter'), // JSON
  config: text('_config').notNull().default('{}'), // JSON
  position: text('_position').notNull().default('{"x":0,"y":0,"w":12,"h":4}'), // JSON
  sortOrder: integer('_sort_order').default(0),
}, (table) => [
  index('_widgets_view_idx').on(table.viewId),
]);

// User data table column name prefix (to distinguish from system fields)
export const USER_TABLE_COLUMN_PREFIX = '';

// Column names that conflict with internal column names
const INTERNAL_COLUMNS = ['_key', '_id', '_name', '_label', '_type', '_value', '_table_id', '_view_id', '_sort_order'];
