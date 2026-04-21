# Wareflow Examples

This directory contains examples demonstrating how to use the `@pane/core` library.

## Running Examples

Before running the examples, ensure you have built the core package:

```bash
cd packages/core
npm install
npm run build
```

Then run an example:

```bash
npx tsx examples/01-basic-usage.ts
```

## Examples

### 01-basic-usage.ts
Demonstrates core functionality:
- Creating a new `.pane` document
- Adding tables with different field types
- Inserting, reading, updating, and deleting records
- Committing changes and closing a pane

### 02-advanced-usage.ts
Demonstrates advanced features:
- Using upsert for insert-or-update semantics
- Working with multiple related tables
- In-memory filtering and sorting

### 03-file-locking.ts
Demonstrates the locking mechanism:
- Opening files in exclusive (write) vs read-only mode
- How locks prevent concurrent modifications
- Handling lock conflicts gracefully

## Key Concepts

### Pane Document
A `.pane` file is a SQLite database that stores:
- System tables (`_meta`, `_tables`, `_fields`, `_views`, `_widgets`) for schema
- User tables for application data
- WAL mode enabled for better concurrency

### Error Handling
All functions return `Result<T, E>` from `@deessejs/fp`. Use `isOk()` and `isErr()` to check:

```typescript
const result = pane.create('table', values);
if (isErr(result)) {
  console.error('Failed:', result.err);
  return;
}
console.log('Created with ID:', result.value);
```

### File Locking
- Each `.pane` file has an associated `.lock` file
- Exclusive mode (default): one writer, prevents other writers
- Read-only mode: multiple readers allowed simultaneously
- Locks auto-expire after 15 minutes for safety