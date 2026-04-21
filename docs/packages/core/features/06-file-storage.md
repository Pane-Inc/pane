# File Storage

The `.pane` document acts as a **file container** — users can store any type of files (images, PDFs, documents, etc.) alongside the structured data. Large files are stored **outside** the SQLite database in a sidecar folder to keep the document portable and avoid corruption risks.

## Directory Structure

```
/shared/
├── payroll.pane              ← Main document (SQLite)
├── payroll.pane.lock        ← Lock file
└── payroll_files/             ← Sidecar folder (user files)
    ├── employees/
    │   ├── emp_001_photo.webp
    │   └── emp_001_contract.pdf
    ├── reports/
    │   └── quarterly_summary.xlsx
    └── photos/
        └── team_event_2024.jpg
```

> **Note:** The sidecar folder is named `{docname}_files/`, not `_attachments/` — it's a general-purpose file store, not just record attachments.

## Two Storage Patterns

### 1. Field-Based Attachments

Files linked to specific table records via a `file` field type:

```typescript
// Schema definition
{
  name: 'document',
  label: 'Document',
  type: 'file',
}
```

In the database, the field stores a **relative path**: `employees/emp_001_contract.pdf`

When user uploads a file:
1. File is saved to `{docname}_files/{table}/{record_id}/{filename}`
2. The relative path is stored in the record's field

### 2. Freeform Storage

Users can store arbitrary files in the sidecar folder without linking them to a specific record. The document does not track these files — they exist in the folder and the user manages them manually (e.g., via the desktop app's file browser).

## Path Resolution

```typescript
const resolveFilePath = (
  document: DocumentHandle,
  relativePath: string
): string => {
  const filesDir = `${document.path}_files`;
  return `${filesDir}/${relativePath}`;
};
```

Relative paths are **always relative to the sidecar folder**. No `../` escape is allowed.

```typescript
// Security: path sanitization
const sanitizePath = (relativePath: string): string => {
  // Remove any leading ../ or absolute paths
  return relativePath.replace(/\.\.\//g, '').replace(/^\//, '');
};
```

## File Operations

### On `open()`

```typescript
const copyFilesToTemp = (
  originalPath: string,
  tempPath: string
): void => {
  const originalFiles = `${originalPath}_files`;
  const tempFiles = `${tempPath}_files`;

  if (fs.existsSync(originalFiles)) {
    fs.cpSync(originalFiles, tempFiles, { recursive: true });
  }
};
```

### On `save()`

```typescript
const copyFilesFromTemp = (
  tempPath: string,
  originalPath: string
): void => {
  const tempFiles = `${tempPath}_files`;
  const originalFiles = `${originalPath}_files`;

  if (fs.existsSync(tempFiles)) {
    // Delete existing files that were removed in temp
    if (fs.existsSync(originalFiles)) {
      fs.rmSync(originalFiles, { recursive: true });
    }
    fs.cpSync(tempFiles, originalFiles, { recursive: true });
  }
};
```

### On `close()`

The temp directory (including temp files) is deleted automatically. The original files remain unchanged until `save()` is called.

## Supported File Types

There is **no hardcoded allowlist**. Users can store any file type. However, for security:

```typescript
// Configurable extension restrictions (optional, off by default)
type FileStorageConfig = {
  maxFileSizeMB: number;        // Default: 50MB
  allowedExtensions?: string[]; // null = allow all
  blockedExtensions?: string[]; // Default: ['exe', 'bat', 'cmd', 'ps1']
};
```

## Storage Organization

Files are organized by **table name** at the top level:

```
payroll_files/
├── employees/           ← Files for records in "employees" table
│   ├── 001/             ← Record ID 001
│   │   ├── photo.webp
│   │   └── contract.pdf
│   └── 002/             ← Record ID 002
│       └── contract.pdf
├── departments/         ← Files for "departments" table
│   └── 001/
│       └── logo.png
└── reports/             ← Freeform storage (no record linkage)
    └── quarterly.xlsx
```

The `file` field stores the path **relative to the sidecar folder**: `employees/001/photo.webp`

## Copy Operations on Open/Save

| Event | Action |
|-------|--------|
| `open()` | Copy `_files/` to temp alongside `.pane` |
| `save()` | Copy temp `_files/` back to original location |
| `close()` | Delete temp directory (including temp files) |

## Size Considerations

- **No hard limit** on total storage — limited by disk space
- **Per-file limit** configurable (default 50MB)
- **Large files** impact network share performance on open/save
- **Recommendation:** Keep individual files under 10MB for responsive experience

## Conflict Resolution

When multiple users edit the same file:

1. Lock mechanism protects the **SQLite database** (exclusive writer)
2. File conflicts (both edit same attachment) are **last writer wins**
3. No automatic merging or versioning for files

For critical files, users should maintain backups outside the shared folder.

## Security Notes

- **Relative paths only** — no `../` or absolute paths stored
- **Extension validation** — configurable blocklist for executables
- **No execution** — files are never run, only stored and served for download
- **Path sanitization** — all paths cleaned before disk operations

## Future Optimizations

- [ ] Incremental sync (only changed files copied on save)
- [ ] File compression in transit (especially for large images)
- [ ] Streaming for large files (avoid full copy on open)
- [ ] File versioning (history of attachment changes)