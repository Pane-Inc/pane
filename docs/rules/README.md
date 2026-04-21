# Coding Rules

## Developer Experience First

Always prioritize simplicity and usability for API consumers. The DX rule applies to all public APIs and exported types.

**Rule: Export types directly, not via ReturnType/typeof**

When a function returns a complex type, export the type separately so consumers don't have to use `ReturnType<typeof createPane>`.

**Bad:**
```typescript
// Consumer has to write complex type annotations
function createDocument(): Promise<ReturnType<typeof createPane>> { ... }
```

**Good:**
```typescript
// Export the type directly
export type { Pane };

// Consumer writes simple, readable code
function createDocument(): Promise<Pane> { ... }
```

**Rule: Simple error handling**

Never force consumers to dig through nested properties to handle errors.

**Bad:**
```typescript
const result = someFunction();
if (result.isErr) {
  console.log(result.error.args.reason); // Too nested!
}
```

**Good:**
```typescript
const result = someFunction();
if (isErr(result)) {
  console.log(result.error); // Simple!
}
```

**Rule: Avoid generic type parameters when concrete types work**

Prefer concrete return types over generic `T | null` or `Result<any, any>`.

## Never use `T | null`

Use `Maybe<T>` from `@deessejs/fp` instead of `T | null`.

**Bad:**
```typescript
const name: string | null = getName();
```

**Good:**
```typescript
const name: Maybe<string> = getName();
```

## Never use `globalThis`

Always import packages properly instead of using `globalThis`.

**Bad:**
```typescript
if (typeof globalThis.crypto?.randomUUID === 'function') { ... }
```

**Good:**
```typescript
import { randomUUID } from 'crypto';
```

## Never use native TypeScript errors

Use structured errors from `@deessejs/fp` as documented in [.claude/skills/deesse-fp/rules/error.md](../../.claude/skills/deesse-fp/rules/error.md).

**Bad:**
```typescript
throw new Error('Something went wrong');
return err(new Error('Invalid input'));
```

**Good:**
```typescript
import { error, err } from '@deessejs/fp';
import { z } from 'zod';

const ValidationError = error({
  name: 'ValidationError',
  schema: z.object({ field: z.string() }),
  message: (args) => `"${args.field}" is invalid`
});

return err(ValidationError({ field: 'email' }));
```

See [.claude/skills/deesse-fp/rules/error-handling.md](../../.claude/skills/deesse-fp/rules/error-handling.md) for error handling patterns.

## Functions must return Result or Maybe

Every function that can fail or return nothing must return `Result<T, E>` or `Maybe<T>` to preserve composability.

**Bad:**
```typescript
const divide = (a: number, b: number): number => {
  if (b === 0) throw new Error('Division by zero');
  return a / b;
};
```

**Good:**
```typescript
const divide = (a: number, b: number): Result<number, Error> =>
  b === 0
    ? err(DivisionByZeroError())
    : ok(a / b);
```

This allows chaining with `flatMap`, `map`, and other combinators without breaking the rail.

## No flatMap hell

Never chain multiple `flatMap` with excessive indentation. Break into small, named helper functions.

**Bad:**
```typescript
const result = pipe(
  some(value),
  flatMap(x => {
    return pipe(
      getAnother(x),
      flatMap(y => {
        return pipe(
          getSomethingElse(y),
          flatMap(z => ok({ x, y, z }))
        );
      })
    );
  })
);
```

**Good:**
```typescript
const combineXY = (x: number) => pipe(
  getAnother(x),
  map(y => ({ x, y }))
);

const combineAll = (value: number) => pipe(
  some(value),
  flatMap(combineXY),
  flatMap(({ x, y }) => map(getSomethingElse(y), z => ({ x, y, z })))
);
```

Rule: max 2-3 `flatMap` chains before extracting to a named function.

## No OOP Java-like patterns

Architecture must be entity-oriented, not OOP. No service/repository/domain layers.

**Forbidden:**
- `Repository`, `Service`, `Domain`, `Entity`, `Manager`, `Handler` suffixes or classes
- `new ClassName()` for domain logic (only data structures allowed)
- Stateful classes with methods
- Inheritance hierarchies

**Allowed:**
- Plain functions that transform data
- Immutable types (readonly)
- Module organization by entity domain

**Bad:**
```typescript
class UserRepository {
  findById(id: string): Promise<User> { ... }
  save(user: User): Promise<void> { ... }
}
```

**Good:**
```typescript
// User module with pure functions
const findUserById = (db: Database, id: string): Result<User, Error> => { ... };
const saveUser = (db: Database, user: User): Result<void, Error> => { ... };
```

## Subagent Review Instructions

When requesting a subagent to review code, always include this instruction:

> "Before reviewing, read [rules/README.md](./rules/README.md) to understand the project's coding rules. Key rules: DX first (export types directly, simple error handling), never use `T | null` (use Maybe), never use native TypeScript errors (use structured errors from @deessejs/fp), every function must return Result or Maybe, no OOP patterns (no Repository/Service/Domain)."