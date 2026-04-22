# Document Lifecycle

The `.pane` document lifecycle manages the complete open → work → commit → close flow using the `Pane` handle.

## Pane Handle

```typescript
const pane = openPane(path: string): Pane
const pane = createPane(options: { path: string; overwrite?: boolean }): Pane
```

**Methods on `Pane`:**

| Method | Description |
|--------|-------------|
| `pane.read(table, options?)` | Read records with optional filters |
| `pane.create(table, values)` | Create new record |
| `pane.update(table, id, values)` | Update existing record |
| `pane.delete(table, id)` | Delete record |
| `pane.upsert(table, values, matchFields)` | Insert or update by unique field(s) |
| `pane.query(sql, params?)` | Execute raw SQL (advanced) |
| `pane.addTable(definition)` | Create a new table |
| `pane.addField(tableId, definition)` | Add field to existing table |
| `pane.addView(definition)` | Create a new view |
| `pane.commit()` | Save changes and release lock |
| `pane.close()` | Close without saving |

---

## openPane

Open an existing `.pane` document:

```typescript
const pane = openPane('/shared/payroll.pane');
```

**Steps:**
1. Check `.lock` file — stale locks are cleaned up
2. Copy to temp directory
3. Open SQLite with WAL mode
4. Return `Pane` handle

---

## createPane

Create a new `.pane` document:

```typescript
const pane = createPane({ path: '/new/payroll.pane' });
```

**Steps:**
1. Create new SQLite file at path
2. Create system tables (`_meta`, `_tables`, `_fields`, `_views`, `_widgets`)
3. Return `Pane` handle

---

## Work

The `Pane` handle provides all operations:

```typescript
const pane = openPane('/shared/payroll.pane');

// Read data
const employees = pane.read('employees', {
  where: { field: 'status', operator: 'eq', value: 'active' },
});

// Write data
pane.create('employees', { name: 'Alice', email: 'alice@example.com' });

// Update
pane.update('employees', 42, { status: 'inactive' });

// Schema changes
pane.addTable({ name: 'equipment', label: 'Equipment', ... });
```

---

## commit

Save all changes and release lock:

```typescript
pane.commit();
```

**Steps:**
1. Verify write lock is held
2. Commit all pending transactions
3. Copy temp → original path (atomic rename)
4. Update lock heartbeat
5. Release lock

---

## close

Close without saving:

```typescript
pane.close();
```

**Steps:**
1. Close SQLite connection
2. Delete temp directory
3. Release lock (if held)

> **Note:** `close()` discards all unsaved changes. Use `commit()` to save.

---

## State Transitions

```
               ┌─────────────┐
               │   CLOSED    │
               └──────┬──────┘
                      │ openPane()
                      ▼
┌─────────────┐      ┌─────────────┐
│   LOCKED    │◄────►│   OPEN      │
│  (another   │      │  (working)  │
│   writer)   │      └──────┬──────┘
└─────────────┘             │
                    ┌──────┴──────┐
                    │             │
               commit()         close()
                    │             │
                    ▼             ▼
              ┌─────────┐   ┌──────────┐
              │ COMMITTED│   │  CLOSED │
              └─────────┘   └──────────┘
```

---

## Full Example

```typescript
import { openPane, createPane } from '@pane/core';

// Open and work
const pane = openPane('/shared/payroll.pane');

// Add schema
pane.addTable({
  name: 'employees',
  label: 'Employee',
  labelPlural: 'Employees',
  fields: [
    { name: 'name', label: 'Name', type: 'text', required: true },
    { name: 'email', label: 'Email', type: 'text' },
  ],
});

// Add data
pane.create('employees', { name: 'Alice', email: 'alice@example.com' });

// Save and close
pane.commit();
```

Or create from scratch:

```typescript
const pane = createPane({ path: '/new/project.pane' });
pane.addTable({ name: 'tasks', label: 'Task', labelPlural: 'Tasks', fields: [...] });
pane.commit();
```

---

## See Also

- [Query & Mutate](./09-query-and-mutate.md) — Data operations
- [Schema Mutations](./10-schema-mutations.md) — Schema changes
- [Lock System](./03-lock-system.md) — Multi-user coordination
