# Lock System

The lock system implements the **shadow lockfile pattern** (same as Microsoft Word and Excel) for multi-user coordination over network shares.

## Lock File

```
payroll.pane           ← Document (anyone can read)
payroll.pane.lock      ← Lock file (exclusive write access)
```

The lock file is a **hidden file** (dot-prefix on Unix, hidden attribute on Windows) that signals "someone is currently editing."

## LockHandle

```typescript
type LockHandle = {
  readonly path: string;           // Path to the .pane file
  readonly holderId: string;       // Unique ID for this holder
  readonly holderName?: string;     // Display name (optional)
  readonly acquiredAt: Date;        // When lock was acquired
  readonly expiresAt: Date;         // Heartbeat deadline
};

type LockResult =
  | { ok: true; lock: LockHandle }
  | { ok: false; error: FileLockedError | LockExpiredError };
```

## Acquiring a Lock

```typescript
const acquireLock = (options: { path: string; holderName?: string }): LockResult
```

1. **Check existing lock** — Read `path + '.lock'` if exists
2. **If stale** (no heartbeat for 15min) → take ownership, orphan cleanup
3. **If valid** → return `{ ok: false, error: { code: 'FILE_LOCKED', holderId, holderName } }`
4. **Create lock file** — Write holder info + 15min expiry
5. **Return** — `{ ok: true, lock: LockHandle }`

## Heartbeat

A writer must **refresh the lock** periodically to maintain ownership:

```typescript
const refreshLock = (lock: LockHandle): LockHandle
```

Each refresh extends `expiresAt` by 15 minutes from now. The writer should refresh **before** the current expiry to stay alive.

> **Timing:** If `expiresAt` is set to 15 minutes from now, a writer that refreshes every 60 seconds will always succeed. If the writer dies and stops refreshing, the lock becomes stale 15 minutes after the last refresh.

## Releasing a Lock

```typescript
const releaseLock = (lock: LockHandle): void
```

Deletes the `.lock` file. After this, another user can acquire the lock.

## Auto-Expiry

If a writer process dies without releasing the lock:

- Lock file remains but heartbeat stops
- After 15 minutes with no refresh, lock is considered **stale**
- Next acquire attempt treats it as orphan and cleans it up

## Reader Behavior

Readers (open without write intent) do **NOT** need a lock:

1. Open document without acquiring lock
2. Can read all data
3. If lock file exists with valid heartbeat → show "data may be stale" warning
4. Cannot save unless lock is acquired

## Lock Behavior Summary

| Actor | Lock Needed | Can Read | Can Write | Stale After |
|-------|-------------|----------|-----------|-------------|
| Writer | Yes (acquireLock) | Yes | Yes | 15min no heartbeat |
| Reader | No | Yes | No | N/A |
| Orphan cleanup | Auto on acquire | — | — | 15min after death |

## Implementation Notes

- Lock file is JSON: `{ holderId, holderName, acquiredAt, expiresAt }`
- Uses `proper-lockfile` for retry logic and race condition handling
- Lock is per-file, not per-process — one writer per `.pane` file