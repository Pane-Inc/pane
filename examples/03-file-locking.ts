/**
 * Example 03: File Locking - Concurrent Access Control
 *
 * This example demonstrates:
 * - How Pane uses file locking to prevent concurrent modifications
 * - Opening a file in read-only mode
 * - Handling lock conflicts gracefully
 */

import { createPane, openPane, Pane } from '@pane/core';
import { isOk, isErr } from '@deessejs/fp';

// Create a simple document
async function createSimpleDocument(): Promise<Pane | null> {
  console.log('Creating simple document...');

  const result = createPane({
    path: './locked_example.pane',
    name: 'Lock Example',
    overwrite: true,
  });

  if (!result.ok) {
    console.error('Failed to create pane:', result.error);
    return null;
  }

  const pane = result.value;

  // Add a simple table
  pane.addTable({
    name: 'notes',
    label: 'Note',
    labelPlural: 'Notes',
    fields: [
      { name: 'content', label: 'Content', type: 'text', required: true },
    ],
  });

  // Add some data
  pane.create('notes', { content: 'This is a locked note' });

  return pane;
}

// Open in exclusive mode (default) - can write
function openExclusive(): { ok: true; value: Pane } | { ok: false; error: unknown } {
  console.log('\nOpening in exclusive mode...');

  const result = openPane({
    path: './locked_example.pane',
    readOnly: false, // This is the default
  });

  if (isErr(result)) {
    console.error('Failed to open exclusively:', result.error);
    return { ok: false, error: result.error };
  }

  console.log('Opened exclusively (can write)');
  return { ok: true, value: result.value };
}

// Open in read-only mode - can have multiple readers
function openReadOnly(): { ok: true; value: Pane } | { ok: false; error: unknown } {
  console.log('\nOpening in read-only mode...');

  const result = openPane({
    path: './locked_example.pane',
    readOnly: true,
  });

  if (isErr(result)) {
    console.error('Failed to open read-only:', result.error);
    return { ok: false, error: result.error };
  }

  console.log('Opened read-only (multiple instances allowed)');
  return { ok: true, value: result.value };
}

// Demonstrate lock release on close
async function demonstrateLockRelease() {
  console.log('\n--- Lock Release Demo ---');

  // Open exclusively
  const exclusive = openExclusive();
  if (!exclusive.ok) return;

  const pane1 = exclusive.value;
  console.log('Pane 1 has the lock');

  // Try to open again in exclusive mode - should fail
  const pane2Result = openPane({ path: './locked_example.pane', readOnly: false });

  if (isErr(pane2Result)) {
    console.log('Could not open exclusively (as expected - pane1 holds lock)');
  } else {
    console.log('Pane 2 opened - this is unexpected!');
    pane2Result.value.close();
  }

  // But read-only should work
  const readOnlyResult = openReadOnly();

  if (readOnlyResult.ok) {
    console.log('Read-only open succeeded (multiple readers allowed)');

    // Read some data
    const readResult = readOnlyResult.value.read('notes');
    if (isOk(readResult)) {
      console.log(`Found ${readResult.value.length} notes`);
    }

    // Close read-only
    readOnlyResult.value.close();
    console.log('Read-only instance closed');
  }

  // Close exclusive
  console.log('Closing exclusive pane...');
  pane1.close();

  console.log('\nPane 1 closed');
}

// Demonstrate read-only mode
async function demonstrateReadOnlyMode() {
  console.log('\n--- Read-Only Mode Demo ---');

  // Open in read-only mode
  const readOnlyResult = openReadOnly();
  if (!readOnlyResult.ok) return;

  const readOnlyPane = readOnlyResult.value;
  console.log('Read-only pane opened');
  console.log('Is read-only:', readOnlyPane.isReadOnly);

  // Try to write - should be prevented
  console.log('Attempting to create a note (should fail)...');
  const createResult = readOnlyPane.create('notes', { content: 'Test' });

  if (isErr(createResult)) {
    console.log('Create failed as expected (read-only mode)');
  } else {
    console.log('Create succeeded - this is unexpected!');
  }

  // But reading should work
  const readResult = readOnlyPane.read('notes');

  if (isOk(readResult)) {
    console.log('Read succeeded');
    console.log(`Found ${readResult.value.length} notes`);
  }

  // Close read-only
  readOnlyPane.close();
  console.log('Read-only pane closed');
}

// Main execution
async function main() {
  const pane = await createSimpleDocument();

  if (!pane) {
    console.error('Exiting due to error');
    return;
  }

  pane.commit();
  pane.close();

  await demonstrateLockRelease();
  await demonstrateReadOnlyMode();

  console.log('\nDone!');
}

main().catch(console.error);