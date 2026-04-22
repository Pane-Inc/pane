# No Inline Imports

Never use inline type imports for `@deessejs/fp` types. Always import types directly from the package.

## Why

Inline imports make types harder to read and consumers would need to write the same verbose syntax:

**Bad:**
```typescript
return result as unknown as import('@deessejs/fp').Result<readonly Row[], import('@deessejs/fp').Error>;
```

**Also Bad:**
```typescript
import type { Result, Error } from '@deessejs/fp';
// Using Result directly in type position but not as explicit generic
```

## Good

```typescript
import type { Result, Error } from '@deessejs/fp';

return result as unknown as Result<readonly Row[], Error>;
```

Or better yet, define a proper error type:

```typescript
// In errors.ts
const DatabaseError = error({
  name: 'DatabaseError',
  schema: z.object({ reason: z.string() }),
  message: (args) => `Database error: ${args.reason}`
});

export type DatabaseError = ReturnType<typeof DatabaseError>;

// In database.ts
return ok(tempDir);
return err(DatabaseError({ reason: String(e) }));
```

## Rule

Always import types explicitly at the top of the file. Do not use `import(...)` in type positions.
