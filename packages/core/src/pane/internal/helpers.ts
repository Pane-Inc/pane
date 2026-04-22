// Pure helper functions
import * as path from 'path';
import * as os from 'os';
import { randomUUID } from 'crypto';
import { SYSTEM_TABLES } from './constants';

const getTempDir = (): string => path.join(os.tmpdir(), 'pane');

const getTempPath = (sourcePath: string, tempDir: string): string => {
  const fileName = `${path.basename(sourcePath, '.pane')}_${randomUUID()}.pane`;
  return path.join(tempDir, fileName);
};

const isSystemTable = (name: string): boolean =>
  SYSTEM_TABLES.includes(name as typeof SYSTEM_TABLES[number]);

const validateIdentifier = (name: string): boolean =>
  /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !isSystemTable(name);

export { getTempDir, getTempPath, isSystemTable, validateIdentifier };
