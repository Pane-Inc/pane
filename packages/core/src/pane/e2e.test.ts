/**
 * E2E tests for Pane lifecycle - create, open, commit, close, persist
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createPane, openPane } from '@pane/core';
import { isOk, isErr } from '@deessejs/fp';
import * as fs from 'fs';
import * as path from 'path';

// Type guard for Result/Try - checks the ok property directly
const toOk = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): result is { ok: true; value: T } => {
  return result.ok === true;
};

const TEST_DIR = path.join(__dirname, '.test-temp');

const taskTableDefinition = {
  name: 'tasks',
  label: 'Task',
  labelPlural: 'Tasks',
  icon: 'checkbox',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['pending', 'in_progress', 'done'] },
    { name: 'priority', label: 'Priority', type: 'number', required: false, defaultValue: 0 },
  ],
};

const getTestPath = (name: string) => path.join(TEST_DIR, `${name}.pane`);
const cleanup = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    ['.lock', '-wal', '-shm'].forEach(ext => {
      const f = filePath + ext;
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  } catch { /* ignore */ }
};

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
});

describe('Full Workflow E2E', () => {
  it('create table → insert rows → update → commit → reopen → verify persistence', () => {
    const filePath = getTestPath('workflow-test');
    cleanup(filePath);

    // 1. Create pane
    const createResult = createPane({ path: filePath, name: 'Test Doc', overwrite: true });
    expect(toOk(createResult), `Failed to create pane: ${JSON.stringify(createResult)}`).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    // 2. Add table
    const tableResult = pane.addTable(taskTableDefinition);
    expect(isOk(tableResult), `Failed to add table: ${isErr(tableResult) ? JSON.stringify(tableResult.error) : ''}`).toBe(true);

    // 3. Insert tasks
    const tasks = [
      { title: 'Learn Pane', status: 'done', priority: 1 },
      { title: 'Build first app', status: 'in_progress', priority: 2 },
      { title: 'Write documentation', status: 'pending', priority: 3 },
    ];

    const ids: number[] = [];
    for (const task of tasks) {
      const insertResult = pane.create('tasks', task);
      expect(isOk(insertResult), `Failed to insert: ${isErr(insertResult) ? JSON.stringify(insertResult.error) : ''}`).toBe(true);
      ids.push(insertResult.value);
    }
    expect(ids).toEqual([1, 2, 3]);

    // 4. Read all tasks
    const readResult = pane.read('tasks');
    expect(isOk(readResult), `Failed to read: ${isErr(readResult) ? JSON.stringify(readResult.error) : ''}`).toBe(true);
    expect(readResult.value.length).toBe(3);
    expect(readResult.value[0].title).toBe('Learn Pane');
    expect(readResult.value[1].status).toBe('in_progress');

    // 5. Update task
    const updateResult = pane.update('tasks', 1, { status: 'in_progress', priority: 5 });
    expect(isOk(updateResult), `Failed to update: ${isErr(updateResult) ? JSON.stringify(updateResult.error) : ''}`).toBe(true);

    // 6. Delete task
    const deleteResult = pane.delete('tasks', 3);
    expect(isOk(deleteResult), `Failed to delete: ${isErr(deleteResult) ? JSON.stringify(deleteResult.error) : ''}`).toBe(true);

    // 7. Commit and close
    const commitResult = pane.commit();
    expect(isOk(commitResult), `Failed to commit: ${isErr(commitResult) ? JSON.stringify(commitResult.error) : ''}`).toBe(true);

    const closeResult = pane.close();
    expect(isOk(closeResult), `Failed to close: ${isErr(closeResult) ? JSON.stringify(closeResult.error) : ''}`).toBe(true);

    // 8. Reopen and verify persistence
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult), `Failed to reopen: ${JSON.stringify(openResult)}`).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    // Verify schema persisted
    expect(reopenedPane.schema.version).toBe('1.0.0');
    expect(reopenedPane.schema.tables.length).toBe(1);
    expect(reopenedPane.schema.tables[0].name).toBe('tasks');

    // Verify data persisted - should have 2 tasks (one deleted)
    const reopenReadResult = reopenedPane.read('tasks');
    expect(isOk(reopenReadResult), `Failed to read after reopen: ${isErr(reopenReadResult) ? JSON.stringify(reopenReadResult.error) : ''}`).toBe(true);
    expect(reopenReadResult.value.length).toBe(2);

    // Verify the update persisted (note: number becomes string in SQLite)
    const updatedTask = reopenReadResult.value.find(t => t.id === 1);
    expect(updatedTask?.status).toBe('in_progress');
    expect(parseFloat(updatedTask?.priority as string)).toBe(5); // SQLite stores numbers as TEXT with possible decimal

    reopenedPane.close();
  });

  it('creates new pane with system tables', () => {
    const filePath = getTestPath('system-tables-test');
    cleanup(filePath);

    const result = createPane({ path: filePath, name: 'System Tables Test', overwrite: true });
    expect(toOk(result)).toBe(true);
    const pane = (result as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];
    expect(pane.schema.version).toBe('1.0.0');
    expect(pane.schema.tables.length).toBe(0);

    pane.close();
  });

  it('adds multiple tables and verifies schema', () => {
    const filePath = getTestPath('multi-table-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, name: 'Multi Table Test', overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    const table1Result = pane.addTable({
      name: 'users',
      label: 'User',
      labelPlural: 'Users',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'name', label: 'Name', type: 'text', required: false },
      ],
    });
    expect(isOk(table1Result)).toBe(true);

    const table2Result = pane.addTable({
      name: 'posts',
      label: 'Post',
      labelPlural: 'Posts',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'content', label: 'Content', type: 'textarea', required: false },
      ],
    });
    expect(isOk(table2Result)).toBe(true);

    pane.commit();
    pane.close();

    // Reopen and verify
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    expect(reopenedPane.schema.tables.length).toBe(2);
    expect(reopenedPane.schema.tables.find(t => t.name === 'users')).toBeDefined();
    expect(reopenedPane.schema.tables.find(t => t.name === 'posts')).toBeDefined();
    reopenedPane.close();
  });

  it('upsert inserts new row when not exists', () => {
    const filePath = getTestPath('upsert-insert-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'contacts',
      label: 'Contact',
      labelPlural: 'Contacts',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'name', label: 'Name', type: 'text', required: false },
      ],
    });

    const upsertResult = pane.upsert('contacts', { email: 'alice@test.com', name: 'Alice' }, ['email']);
    expect(isOk(upsertResult), `Upsert failed: ${isErr(upsertResult) ? JSON.stringify(upsertResult.error) : ''}`).toBe(true);
    expect(upsertResult.value.action).toBe('inserted');
    expect(upsertResult.value.id).toBe(1);

    pane.commit();
    pane.close();

    // Reopen and verify
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('contacts');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value.length).toBe(1);
    expect(readResult.value[0].email).toBe('alice@test.com');
    reopenedPane.close();
  });

  it('upsert updates existing row when exists', () => {
    const filePath = getTestPath('upsert-update-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'contacts',
      label: 'Contact',
      labelPlural: 'Contacts',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'name', label: 'Name', type: 'text', required: false },
      ],
    });

    // First upsert - inserts
    const insertResult = pane.upsert('contacts', { email: 'alice@test.com', name: 'Alice' }, ['email']);
    expect(isOk(insertResult)).toBe(true);
    expect(insertResult.value.action).toBe('inserted');

    // Second upsert with same email - updates
    const updateResult = pane.upsert('contacts', { email: 'alice@test.com', name: 'Alice Updated' }, ['email']);
    expect(isOk(updateResult), `Upsert update failed: ${isErr(updateResult) ? JSON.stringify(updateResult.error) : ''}`).toBe(true);
    expect(updateResult.value.action).toBe('updated');
    expect(updateResult.value.id).toBe(1);

    pane.commit();
    pane.close();

    // Reopen and verify only one row exists with updated name
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('contacts');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value.length).toBe(1);
    expect(readResult.value[0].name).toBe('Alice Updated');
    reopenedPane.close();
  });

  it('adds fields to existing table via addField', () => {
    const filePath = getTestPath('add-field-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    const tableResult = pane.addTable({
      name: 'products',
      label: 'Product',
      labelPlural: 'Products',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
    });
    expect(isOk(tableResult)).toBe(true);
    const tableId = tableResult.value;

    // Add a new field
    const fieldResult = pane.addField(tableId, {
      id: 0,
      name: 'price',
      label: 'Price',
      type: 'number',
      required: false,
    });
    expect(isOk(fieldResult), `addField failed: ${isErr(fieldResult) ? JSON.stringify(fieldResult.error) : ''}`).toBe(true);

    // Insert with both fields
    const insertResult = pane.create('products', { name: 'Widget', price: 19.99 });
    expect(isOk(insertResult)).toBe(true);

    pane.commit();
    pane.close();

    // Reopen and verify
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('products');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value[0].name).toBe('Widget');
    expect(readResult.value[0].price).toBe('19.99'); // SQLite TEXT
    reopenedPane.close();
  });

  it('adds view to schema via addView', () => {
    const filePath = getTestPath('add-view-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    const tableResult = pane.addTable({
      name: 'notes',
      label: 'Note',
      labelPlural: 'Notes',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
      ],
    });
    expect(isOk(tableResult)).toBe(true);
    const tableId = tableResult.value;

    // Add a view
    const viewResult = pane.addView(tableId, {
      name: 'kanban_view',
      icon: 'kanban',
      type: 'kanban',
      config: { groupBy: 'status' },
    });
    expect(isOk(viewResult), `addView failed: ${isErr(viewResult) ? JSON.stringify(viewResult.error) : ''}`).toBe(true);
    expect(viewResult.value).toBeGreaterThan(0);

    pane.commit();
    pane.close();

    // Verify view persisted by checking schema
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const table = reopenedPane.schema.tables.find(t => t.name === 'notes');
    expect(table).toBeDefined();
    reopenedPane.close();
  });

  it('rejects write operations in read-only mode', () => {
    const filePath = getTestPath('readonly-test');
    cleanup(filePath);

    // Create and add some data
    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'items',
      label: 'Item',
      labelPlural: 'Items',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
    });

    pane.create('items', { name: 'Test Item' });
    pane.commit();
    pane.close();

    // Open in read-only mode
    const openResult = openPane({ path: filePath, readOnly: true });
    expect(toOk(openResult)).toBe(true);
    const readOnlyPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    expect(readOnlyPane.isReadOnly).toBe(true);

    // Read should work
    const readResult = readOnlyPane.read('items');
    expect(isOk(readResult)).toBe(true);

    // Create should fail
    const createResult2 = readOnlyPane.create('items', { name: 'New Item' });
    expect(isErr(createResult2)).toBe(true);
    if (isErr(createResult2)) {
      expect(createResult2.error.name).toBe('ReadOnlyError');
    }

    // Update should fail
    const updateResult = readOnlyPane.update('items', 1, { name: 'Updated' });
    expect(isErr(updateResult)).toBe(true);
    if (isErr(updateResult)) {
      expect(updateResult.error.name).toBe('ReadOnlyError');
    }

    // Delete should fail
    const deleteResult = readOnlyPane.delete('items', 1);
    expect(isErr(deleteResult)).toBe(true);
    if (isErr(deleteResult)) {
      expect(deleteResult.error.name).toBe('ReadOnlyError');
    }

    // Commit should fail
    const commitResult = readOnlyPane.commit();
    expect(isErr(commitResult)).toBe(true);

    readOnlyPane.close();
  });

  it('handles multiselect fields with JSON serialization', () => {
    const filePath = getTestPath('multiselect-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'contacts',
      label: 'Contact',
      labelPlural: 'Contacts',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'tags', label: 'Tags', type: 'multiselect', required: false, options: ['vip', 'lead', 'customer'] },
      ],
    });

    // Insert with multiselect
    const insertResult = pane.create('contacts', {
      email: 'bob@test.com',
      tags: ['vip', 'customer'],
    });
    expect(isOk(insertResult)).toBe(true);

    pane.commit();
    pane.close();

    // Reopen and verify array persisted correctly
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('contacts');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value[0].tags).toEqual(['vip', 'customer']);
    reopenedPane.close();
  });

  it('filters rows using where options', () => {
    const filePath = getTestPath('filter-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'tasks',
      label: 'Task',
      labelPlural: 'Tasks',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'status', label: 'Status', type: 'select', required: true, options: ['pending', 'done'] },
        { name: 'priority', label: 'Priority', type: 'number', required: false },
      ],
    });

    // Insert test data
    pane.create('tasks', { title: 'Task 1', status: 'done', priority: 1 });
    pane.create('tasks', { title: 'Task 2', status: 'pending', priority: 2 });
    pane.create('tasks', { title: 'Task 3', status: 'done', priority: 3 });

    pane.commit();
    pane.close();

    // Reopen and filter
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    // Filter by status = 'done'
    const filterResult = reopenedPane.read('tasks', {
      where: [{ field: 'status', operator: '=', value: 'done' }],
    });
    expect(isOk(filterResult), `Filter failed: ${isErr(filterResult) ? JSON.stringify(filterResult.error) : ''}`).toBe(true);
    expect(filterResult.value.length).toBe(2);
    expect(filterResult.value.every(t => t.status === 'done')).toBe(true);

    reopenedPane.close();
  });

  it('orders rows using orderBy options', () => {
    const filePath = getTestPath('orderby-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'tasks',
      label: 'Task',
      labelPlural: 'Tasks',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'priority', label: 'Priority', type: 'number', required: false },
      ],
    });

    // Insert test data (not in order)
    pane.create('tasks', { title: 'Task C', priority: 3 });
    pane.create('tasks', { title: 'Task A', priority: 1 });
    pane.create('tasks', { title: 'Task B', priority: 2 });

    pane.commit();
    pane.close();

    // Reopen and order
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    // Order by priority ascending
    const orderResult = reopenedPane.read('tasks', {
      orderBy: [{ field: 'priority', direction: 'asc' }],
    });
    expect(isOk(orderResult), `OrderBy failed: ${isErr(orderResult) ? JSON.stringify(orderResult.error) : ''}`).toBe(true);
    expect(orderResult.value.length).toBe(3);
    expect(orderResult.value[0].title).toBe('Task A');
    expect(orderResult.value[1].title).toBe('Task B');
    expect(orderResult.value[2].title).toBe('Task C');

    reopenedPane.close();
  });

  it('limits rows using limit and offset options', () => {
    const filePath = getTestPath('limit-offset-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'items',
      label: 'Item',
      labelPlural: 'Items',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
    });

    // Insert 5 items
    for (let i = 1; i <= 5; i++) {
      pane.create('items', { name: `Item ${i}` });
    }

    pane.commit();
    pane.close();

    // Reopen and test limit/offset
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    // Test limit only
    const limitResult = reopenedPane.read('items', { limit: 2 });
    expect(isOk(limitResult), `Limit failed: ${isErr(limitResult) ? JSON.stringify(limitResult.error) : ''}`).toBe(true);
    expect(limitResult.value.length).toBe(2);

    // Test limit with offset
    const offsetResult = reopenedPane.read('items', { limit: 2, offset: 2 });
    expect(isOk(offsetResult), `Offset failed: ${isErr(offsetResult) ? JSON.stringify(offsetResult.error) : ''}`).toBe(true);
    expect(offsetResult.value.length).toBe(2);
    expect(offsetResult.value[0].name).toBe('Item 3');

    reopenedPane.close();
  });

  it('imports CSV content into table', () => {
    const filePath = getTestPath('import-csv-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'products',
      label: 'Product',
      labelPlural: 'Products',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'price', label: 'Price', type: 'number', required: false },
      ],
    });

    const csvContent = `name,price
Widget,19.99
Gadget,29.99
Tool,9.99`;

    const importResult = pane.importCsv('products', csvContent);
    expect(isOk(importResult), `importCsv failed: ${isErr(importResult) ? JSON.stringify(importResult.error) : ''}`).toBe(true);
    expect(importResult.value.length).toBe(3);

    pane.commit();
    pane.close();

    // Verify data was imported
    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('products');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value.length).toBe(3);
    expect(readResult.value[0].name).toBe('Widget');
    expect(readResult.value[0].price).toBe('19.99');
    reopenedPane.close();
  });

  it('exports table content to CSV', () => {
    const filePath = getTestPath('export-csv-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'tasks',
      label: 'Task',
      labelPlural: 'Tasks',
      fields: [
        { name: 'title', label: 'Title', type: 'text', required: true },
        { name: 'done', label: 'Done', type: 'checkbox', required: false },
      ],
    });

    pane.create('tasks', { title: 'Task 1', done: 1 });
    pane.create('tasks', { title: 'Task 2', done: 0 });

    const exportResult = pane.exportCsv('tasks');
    expect(isOk(exportResult), `exportCsv failed: ${isErr(exportResult) ? JSON.stringify(exportResult.error) : ''}`).toBe(true);

    const lines = exportResult.value.split('\n');
    expect(lines.length).toBe(3);
    expect(lines[0]).toContain('title');
    expect(lines[0]).toContain('done');
    expect(lines[1]).toContain('Task 1');
    expect(lines[2]).toContain('Task 2');

    pane.close();
  });

  it('imports JSON content into table', () => {
    const filePath = getTestPath('import-json-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'users',
      label: 'User',
      labelPlural: 'Users',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
        { name: 'age', label: 'Age', type: 'number', required: false },
      ],
    });

    const jsonContent = JSON.stringify([
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ]);

    const importResult = pane.importJson('users', jsonContent);
    expect(isOk(importResult), `importJson failed: ${isErr(importResult) ? JSON.stringify(importResult.error) : ''}`).toBe(true);
    expect(importResult.value.length).toBe(2);

    pane.commit();
    pane.close();

    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('users');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value.length).toBe(2);
    expect(readResult.value[0].name).toBe('Alice');
    expect(readResult.value[1].name).toBe('Bob');
    reopenedPane.close();
  });

  it('exports table content to JSON', () => {
    const filePath = getTestPath('export-json-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'items',
      label: 'Item',
      labelPlural: 'Items',
      fields: [
        { name: 'label', label: 'Label', type: 'text', required: true },
      ],
    });

    pane.create('items', { label: 'First' });
    pane.create('items', { label: 'Second' });

    const exportResult = pane.exportJson('items');
    expect(isOk(exportResult), `exportJson failed: ${isErr(exportResult) ? JSON.stringify(exportResult.error) : ''}`).toBe(true);

    const parsed = JSON.parse(exportResult.value);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(2);
    expect(parsed[0].label).toBe('First');
    expect(parsed[1].label).toBe('Second');

    pane.close();
  });

  it('imports CSV with column mapping', () => {
    const filePath = getTestPath('import-csv-mapping-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'contacts',
      label: 'Contact',
      labelPlural: 'Contacts',
      fields: [
        { name: 'email', label: 'Email', type: 'text', required: true },
        { name: 'fullName', label: 'Full Name', type: 'text', required: false },
      ],
    });

    const csvContent = `Email Address,Full Name
alice@test.com,Alice Anderson
bob@test.com,Bob Builder`;

    const importResult = pane.importCsv('contacts', csvContent, {
      'Email Address': 'email',
      'Full Name': 'fullName',
    });
    expect(isOk(importResult), `importCsv with mapping failed: ${isErr(importResult) ? JSON.stringify(importResult.error) : ''}`).toBe(true);
    expect(importResult.value.length).toBe(2);

    pane.commit();
    pane.close();

    const openResult = openPane({ path: filePath });
    expect(toOk(openResult)).toBe(true);
    const reopenedPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];
    const readResult = reopenedPane.read('contacts');
    expect(isOk(readResult)).toBe(true);
    expect(readResult.value[0].email).toBe('alice@test.com');
    expect(readResult.value[0].fullName).toBe('Alice Anderson');
    reopenedPane.close();
  });

  it('rejects import operations in read-only mode', () => {
    const filePath = getTestPath('import-readonly-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'items',
      label: 'Item',
      labelPlural: 'Items',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
    });

    pane.create('items', { name: 'Test Item' });
    pane.commit();
    pane.close();

    const openResult = openPane({ path: filePath, readOnly: true });
    expect(toOk(openResult)).toBe(true);
    const readOnlyPane = (openResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof openPane>>['value'];

    const csvImportResult = readOnlyPane.importCsv('items', 'name\nNew Item');
    expect(isErr(csvImportResult)).toBe(true);
    if (isErr(csvImportResult)) {
      expect(csvImportResult.error.name).toBe('ReadOnlyError');
    }

    const jsonImportResult = readOnlyPane.importJson('items', '[]');
    expect(isErr(jsonImportResult)).toBe(true);
    if (isErr(jsonImportResult)) {
      expect(jsonImportResult.error.name).toBe('ReadOnlyError');
    }

    readOnlyPane.close();
  });

  it('handles malformed CSV gracefully', () => {
    const filePath = getTestPath('malformed-csv-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'data',
      label: 'Data',
      labelPlural: 'Data',
      fields: [
        { name: 'value', label: 'Value', type: 'number', required: false },
      ],
    });

    const csvContent = `value
42`;

    const importResult = pane.importCsv('data', csvContent);
    expect(isOk(importResult)).toBe(true);
    expect(importResult.value.length).toBe(1);

    const badCsvContent = `value
not_a_number`;

    const badImportResult = pane.importCsv('data', badCsvContent);
    expect(isErr(badImportResult)).toBe(true);

    pane.close();
  });

  it('handles malformed JSON gracefully', () => {
    const filePath = getTestPath('malformed-json-test');
    cleanup(filePath);

    const createResult = createPane({ path: filePath, overwrite: true });
    expect(toOk(createResult)).toBe(true);
    const pane = (createResult as { ok: true; value: unknown }).value as Awaited<ReturnType<typeof createPane>>['value'];

    pane.addTable({
      name: 'data',
      label: 'Data',
      labelPlural: 'Data',
      fields: [
        { name: 'name', label: 'Name', type: 'text', required: true },
      ],
    });

    const badJsonContent = 'not valid json at all';

    const importResult = pane.importJson('data', badJsonContent);
    expect(isErr(importResult)).toBe(true);

    const nonArrayJson = '{"name": "test"}';

    const nonArrayResult = pane.importJson('data', nonArrayJson);
    expect(isErr(nonArrayResult)).toBe(true);

    pane.close();
  });
});