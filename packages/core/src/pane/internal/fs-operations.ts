// Low-level fs operations
import type { Maybe, Try } from '@deessejs/fp';
import { none, some } from '@deessejs/fp';
import { ok, err, attempt } from '@deessejs/fp';
import * as fs from 'fs';
import Database from 'better-sqlite3';
import { getTempDir, getTempPath } from './helpers';
import { TempDirError, CopyError } from './errors';

const ensureTempDir = (): Try<string, ReturnType<typeof TempDirError>> => {
  return attempt(
    () => {
      const tempDir = getTempDir();
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      return tempDir;
    },
    (error) => TempDirError({ reason: String(error) })
  );
};

const copyFileToTemp = (sourcePath: string, tempDir: string): Try<string, ReturnType<typeof CopyError>> => {
  return attempt(
    () => {
      const tempPath = getTempPath(sourcePath, tempDir);
      fs.copyFileSync(sourcePath, tempPath);
      return tempPath;
    },
    (error) => CopyError({ reason: String(error) })
  );
};

const createEmptyFile = (targetPath: string): Try<undefined, ReturnType<typeof CopyError>> => {
  return attempt(
    () => {
      const db = new Database(targetPath);
      db.close();
      return undefined;
    },
    (error) => CopyError({ reason: String(error) })
  );
};

const deleteFile = (targetPath: string): Try<undefined, ReturnType<typeof CopyError>> => {
  return attempt(
    () => {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return undefined;
    },
    (error) => CopyError({ reason: String(error) })
  );
};

const fileExists = (targetPath: string): Maybe<boolean> => {
  return some(fs.existsSync(targetPath));
};

export { ensureTempDir, copyFileToTemp, createEmptyFile, deleteFile, fileExists };
