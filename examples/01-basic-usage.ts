/**
 * Example 01: Basic Usage - Creating and Opening Panes
 *
 * This example demonstrates:
 * - Creating a new .pane document
 * - Opening an existing .pane document
 * - Adding tables and fields
 * - Basic CRUD operations
 */

import { createPane, openPane, Pane } from '@pane/core';
import { isOk, isErr } from '@deessejs/fp';

// Define a task table structure
const taskTableDefinition = {
  name: 'tasks',
  label: 'Task',
  labelPlural: 'Tasks',
  icon: 'checkbox',
  fields: [
    { name: 'title', label: 'Title', type: 'text', required: true },
    { name: 'description', label: 'Description', type: 'text', required: false },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['pending', 'in_progress', 'done'] },
    { name: 'priority', label: 'Priority', type: 'number', required: false, defaultValue: 0 },
  ],
};

// Create a new pane document
async function createNewDocument(): Promise<Pane | null> {
  console.log('Creating new document...');

  const result = createPane({
    path: './example.pane',
    name: 'Example Document',
    overwrite: true,
  });

  if (isErr(result)) {
    console.error('Failed to create pane:', result.error);
    return null;
  }

  const pane = result.value;
  console.log('Pane created successfully!');
  console.log('Path:', pane.path);
  console.log('Schema version:', pane.schema.version);

  return pane;
}

// Add a table to the pane
async function addTaskTable(pane: Pane) {
  console.log('\nAdding tasks table...');

  const result = pane.addTable(taskTableDefinition);

  if (isErr(result)) {
    console.error('Failed to add table:', result.error);
    return;
  }

  console.log('Table added with ID:', result.value);
}

// Insert some tasks
async function insertTasks(pane: Pane) {
  console.log('\nInserting tasks...');

  const tasks = [
    { title: 'Learn Pane', status: 'done', priority: 1 },
    { title: 'Build first app', status: 'in_progress', priority: 2 },
    { title: 'Write documentation', status: 'pending', priority: 3 },
  ];

  for (const task of tasks) {
    const result = pane.create('tasks', task);
    if (isOk(result)) {
      console.log(`Created task with ID: ${result.value}`);
    } else {
      console.error('Failed to create task:', result.error);
    }
  }
}

// Read all tasks
async function readTasks(pane: Pane) {
  console.log('\nReading all tasks...');

  const result = pane.read('tasks');

  if (isErr(result)) {
    console.error('Failed to read tasks:', result.error);
    return;
  }

  console.log(`Found ${result.value.length} tasks:`);
  for (const row of result.value) {
    console.log(`  - [${row.id}] ${row.title} (${row.status})`);
  }
}

// Update a task
async function updateTask(pane: Pane) {
  console.log('\nUpdating task 1...');

  const result = pane.update('tasks', 1, { status: 'in_progress', priority: 5 });

  if (isOk(result)) {
    console.log('Task updated successfully!');
  } else {
    console.error('Failed to update task:', result.error);
  }
}

// Delete a task
async function deleteTask(pane: Pane) {
  console.log('\nDeleting task 3...');

  const result = pane.delete('tasks', 3);

  if (isOk(result)) {
    console.log('Task deleted successfully!');
  } else {
    console.error('Failed to delete task:', result.error);
  }
}

// Main execution
async function main() {
  const pane = await createNewDocument();

  if (!pane) {
    console.error('Exiting due to error');
    return;
  }

  await addTaskTable(pane);
  await insertTasks(pane);
  await readTasks(pane);
  await updateTask(pane);
  await readTasks(pane);
  await deleteTask(pane);
  await readTasks(pane);

  // Commit changes and close
  console.log('\nCommitting changes...');
  const commitResult = pane.commit();
  if (isOk(commitResult)) {
    console.log('Changes committed!');
  }

  console.log('\nClosing pane...');
  const closeResult = pane.close();
  if (isOk(closeResult)) {
    console.log('Pane closed!');
  }

  // Reopen the document
  console.log('\n--- Reopening document ---');
  const openResult = openPane({ path: './example.pane' });

  if (isErr(openResult)) {
    console.error('Failed to open pane:', openResult.error);
    return;
  }

  const reopenedPane = openResult.value;
  await readTasks(reopenedPane);

  // Close the reopened pane
  console.log('\nClosing reopened pane...');
  reopenedPane.close();
}

main().catch(console.error);