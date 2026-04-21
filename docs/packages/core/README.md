# @pane/core

The foundational package of the Pane ecosystem. `@pane/core` is a **pure JavaScript/TypeScript library** that handles all internal logic for the `.pane` file format — the document-based architecture at the heart of Pane applications.

> **Note:** This package is intended for **internal use** within the Pane ecosystem. It is not yet published to npm, though that may change in the future.

---

## What It Is

A `.pane` file is a **SQLite database** with a specific schema that enables:

- **Local-first** data storage — no server required
- **Network-shareable** documents — copy to a shared drive and collaborate
- **Offline-capable** applications — works without internet
- **Dynamic schema** — user-defined tables and fields (when using the platform version)

The core package abstracts all the complexity of this file format behind simple `const` functions and **immutable types**.

---

## Features

All features are documented in [`./features/`](./features/).

| Document | Description |
|----------|-------------|
| [01 - Functional Approach](./features/01-functional-approach.md) | No classes, no services — only const functions and immutable types |
| [02 - Document Lifecycle](./features/02-document-lifecycle.md) | Open → Work → Save → Close flow |
| [03 - Lock System](./features/03-lock-system.md) | Shadow lockfile pattern for multi-user coordination |
| [04 - Schema System](./features/04-schema-system.md) | System tables (`_tables`, `_fields`, `_relations`) inside the document |
| [05 - Field Types](./features/05-field-types.md) | text, number, select, foreign, file, formula, etc. |
| [06 - File Storage](./features/06-file-storage.md) | Sidecar folder for images, PDFs, documents, etc. |
| [07 - Error Types](./features/07-error-types.md) | Discriminated union result types, no exceptions |
| [08 - Views & Widgets](./features/08-views-and-widgets.md) | View types, widget configs, ViewRenderer contract |
| [09 - CRUD Operations](./features/09-query-and-mutate.md) | Data access API — read(), create(), update(), delete(), query() |
| [10 - Schema Mutations](./features/10-schema-mutations.md) | Create, modify, delete tables and fields at runtime |
| [11 - Import & Export](./features/11-import-export.md) | CSV, JSON import/export |

---

## Quick Start

```typescript
import { openPane, createPane } from '@pane/core';

// Open existing document
const pane = openPane('/shared/payroll.pane');

// Read and write data
pane.read('employees');
pane.create('employees', { name: 'Alice' });
pane.update('employees', 1, { name: 'Bob' });
pane.delete('employees', 1);

// Schema changes
pane.addTable({ name: 'equipment', label: 'Equipment', ... });
pane.addView({ name: 'Kanban', type: 'kanban', ... });

// Save and close
pane.commit();
```

Or create a new document:

```typescript
const pane = createPane({ path: '/new/payroll.pane' });
pane.addTable({ name: 'employees', label: 'Employee', ... });
pane.commit();
```

---

## Architecture

```
@pane/core
├── src/
│   ├── pane.ts              # openPane(), createPane(), Pane type
│   ├── query.ts             # pane.query()
│   ├── mutate.ts           # pane.mutate()
│   ├── schema/
│   │   ├── addTable.ts     # pane.addTable()
│   │   ├── addField.ts     # pane.addField()
│   │   └── ...
│   ├── views/
│   │   ├── addView.ts      # pane.addView()
│   │   └── ...
│   ├── lock.ts             # Internal lock management
│   └── types/              # All TypeScript types
        └── index.ts
```

All modules export **`const` functions and `type` definitions**.

---

## Dependencies

This package is **framework-agnostic** — no React, no Electron dependencies. It can be used in:

- Node.js CLI tools
- Electron main process
- Tauri Rust backend (via FFI)
- Web workers (for browser-based tools)

### Peer Dependencies

- `better-sqlite3` — Synchronous SQLite for Node.js
- `drizzle-orm` — Type-safe SQL with Drizzle
- `proper-lockfile` — Retry logic for lock acquisition
- `uuid` — Unique ID generation

---

## Roadmap

- [ ] Schema migration system (detect version, run transforms)
- [ ] Formula evaluation engine (jsep-based)
- [ ] Change tracking / audit log
- [ ] Index optimization for foreign key lookups
- [ ] Package publishing to npm

---

## See Also

- [@pane/react](../react/README.md) — React presentation layer