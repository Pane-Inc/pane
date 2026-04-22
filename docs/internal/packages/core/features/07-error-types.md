# Error Types

All `@pane/core` functions return error information via discriminated union result types, not exceptions.

## Result Pattern

```typescript
type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// Usage
const result = open({ path: '/shared/payroll.pane' });
if (result.ok) {
  workWith(result.value);  // DocumentHandle
} else {
  handle(result.error);    // ErrorType
}
```

## Error Types

### FileLockedError

Another user currently holds the write lock.

```typescript
type FileLockedError = {
  code: 'FILE_LOCKED';
  holderId: string;
  holderName?: string;
};
```

**Recovery:** Wait for lock to be released, or open read-only.

### LockExpiredError

Your lock has expired (missed heartbeat refresh).

```typescript
type LockExpiredError = {
  code: 'LOCK_EXPIRED';
};
```

**Recovery:** Re-acquire lock.

### SchemaMismatchError

Document schema version is incompatible with the current `@pane/core` version. This happens when the document was created with a newer version of the library.

```typescript
type SchemaMismatchError = {
  code: 'SCHEMA_MISMATCH';
  documentVersion: string;    // Version stored in the document
  supportedVersion: string;   // Max version supported by this library
};
```

**Recovery:** Run migrations, or upgrade `@pane/core`.

### ValidationError

Data doesn't satisfy field constraints.

```typescript
type ValidationError = {
  code: 'VALIDATION_ERROR';
  field: string;
  message: string;
};
```

**Recovery:** Fix the invalid data before submitting.

### WriteError

General write failure (disk full, permissions, etc.).

```typescript
type WriteError = {
  code: 'WRITE_ERROR';
  cause: string;
};
```

**Recovery:** Check disk space, permissions, path validity.

## Exhaustive Handling

TypeScript forces you to handle all error cases:

```typescript
const saveResult = save(document);
if (!saveResult.ok) {
  switch (saveResult.error.code) {
    case 'LOCK_EXPIRED':
      // reacquire and retry
      break;
    case 'WRITE_ERROR':
      // report to user
      break;
    // All cases must be handled
  }
}
```

## No Exceptions Thrown

`@pane/core` **never throws exceptions**. All error paths return via result types. This ensures:

- All error paths are explicit in type signatures
- Async operations don't need try/catch for expected errors
- Error handling is exhaustive (TypeScript checks)

```typescript
// ✅ Correct — error handling is explicit
const result = save(document);
if (!result.ok) {
  // handle error
}

// ❌ Will never catch anything from @pane/core
try {
  save(document);
} catch (e) {
  // e is never thrown
}
```

## Error Codes

| Code | Meaning |
|------|---------|
| `FILE_LOCKED` | Another user holds the lock |
| `LOCK_EXPIRED` | Your lock heartbeat missed |
| `SCHEMA_MISMATCH` | Document version incompatible |
| `VALIDATION_ERROR` | Data doesn't match field rules |
| `WRITE_ERROR` | Disk/permission failure |