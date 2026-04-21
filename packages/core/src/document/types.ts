// Document types
import type { Maybe, Result } from '@deessejs/fp';
import type { Schema } from '../schema';
import type { LockHandle } from '../lock';
import type { PaneError, LockExpiredError } from '../errors';

export type DocumentHandle = {
  readonly path: string;
  readonly schema: Schema;
  readonly lock: Maybe<LockHandle>;
};

export type DocumentResult = Result<DocumentHandle, PaneError | LockExpiredError>;

export type OpenOptions = {
  readonly path: string;
  readonly readOnly?: boolean;
};

export type CreateOptions = {
  readonly path: string;
  readonly name?: string;
  readonly version?: string;
};