// Pane state interface
import type { Maybe } from '@deessejs/fp';
import type { LockHandle } from '../lock';
import type { ParsedSchema } from './database';

export interface PaneState {
  path: string;
  tempPath: string;
  lock: Maybe<LockHandle>;
  isReadOnly: boolean;
  db: Database.Database;
  schema: ParsedSchema;
}
