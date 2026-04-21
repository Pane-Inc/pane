# Project Guidelines

See [docs/](../../docs/) for documentation and guides.

See [rules/README.md](./rules/README.md) for coding rules.

Key points:
- Never use `T | null` — use `Maybe<T>` from `@deessejs/fp`
- Never use `globalThis` — import packages properly
- Never use native TypeScript errors — use structured errors from `@deessejs/fp`
- Every function must return `Result<T, E>` or `Maybe<T>` to preserve composability