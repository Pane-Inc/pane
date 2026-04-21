# Functional Approach

`@pane/core` follows a **functional paradigm** with a simple entry point: the `Pane` handle.

## Pane Handle

```typescript
import { openPane, createPane } from '@pane/core';

const pane = openPane('/shared/payroll.pane');
pane.query('SELECT * FROM employees');
pane.create('employees', { name: 'Alice' });
pane.commit();
```

**Why a handle instead of scattered functions?**

| Old Approach | New Approach |
|--------------|--------------|
| `open()` → returns object | `openPane()` → returns `Pane` handle |
| `acquireLock()` separately | Lock auto-acquired |
| `save()` + `releaseLock()` separately | `commit()` handles both |
| `close()` separately | `commit()` or `close()` |

The `Pane` handle is an **immutable reference** to an open document. All operations are methods on this handle, but internally they are pure functions.

---

## Why No Classes?

Classes create implicit state via `this`. The `Pane` handle is different:

- It's a **plain object** (not a class instance)
- All state is explicit in its properties
- Methods return new states (or the same handle with updated internal tracking)

```typescript
// Pane handle is just a plain object
type Pane = {
  readonly path: string;
  readonly schema: Schema;
  readonly db: Database;
  // Methods don't use 'this' implicitly
};
```

**Benefits:**
- **Serializable** — handle can be passed around without surprises
- **Debuggable** — no hidden mutations, stack traces are clear
- **Testable** — methods are just functions that take the handle as first arg

---

## Result Types

All methods that can fail return discriminated unions:

```typescript
const result = pane.create('employees', { name: 'Alice' });

if (result.ok) {
  console.log(result.id);  // id is available
} else {
  console.log(result.error.code);  // error handling is explicit
}
```

---

## Immutable Pattern

When you call mutation methods, the handle is updated internally but the **reference remains valid**:

```typescript
const pane = openPane('/shared/payroll.pane');
pane.addTable({ name: 'employees', ... });  // handle now knows about new table
pane.addView({ name: 'List', ... });
pane.commit();  // save and release
```

This is different from class-based state where `this` mutates invisibly.

---

## File Structure

```
src/
├── pane.ts              # openPane, createPane, Pane type
├── query.ts             # pane.query()
├── crud.ts             # pane.read(), pane.create(), pane.update(), pane.delete()
├── schema/
│   ├── addTable.ts     # pane.addTable()
│   ├── addField.ts     # pane.addField()
│   └── ...
├── views/
│   ├── addView.ts      # pane.addView()
│   └── ...
├── lock.ts              # Internal lock management
└── types/               # All TypeScript types
```

Each file exports `const` functions. The `Pane` handle is composed from these.

---

## No Exceptions

`@pane/core` **never throws**. All error paths return via result types:

```typescript
// ✅ Correct
const result = pane.create('employees', { name: 'Alice' });
if (!result.ok) {
  // handle error
}

// ❌ Will never catch anything
try {
const result = pane.create('employees', { name: 'Alice' });
} catch (e) {
  // e is never thrown
}
```

---

## See Also

- [Document Lifecycle](./02-document-lifecycle.md) — Open → Work → Commit → Close
