/**
 * Unit tests for lock system - acquire, release, refresh, and conflict scenarios
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  acquireLock,
  releaseLock,
  refreshLock,
  isLockStale,
  checkLockStatus,
} from './lock';
import type { LockHandle } from './types';

const TEST_DIR = path.join(__dirname, '.test-temp');

const getTestPath = (name: string) => path.join(TEST_DIR, `${name}.pane`);

const cleanup = (filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    const lockPath = filePath + '.lock';
    if (fs.existsSync(lockPath)) {
      fs.unlinkSync(lockPath);
    }
  } catch { /* ignore */ }
};

beforeEach(() => {
  if (!fs.existsSync(TEST_DIR)) {
    fs.mkdirSync(TEST_DIR, { recursive: true });
  }
});

afterEach(() => {
  try {
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true, force: true });
    }
  } catch { /* ignore */ }
});

describe('lock', () => {
  describe('acquireLock', () => {
    it('acquires lock on new file', () => {
      const filePath = getTestPath('acquire-lock-test');
      cleanup(filePath);

      // Create empty file
      fs.writeFileSync(filePath, '');

      const result = acquireLock({ path: filePath, holderName: 'Test Holder' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.path).toBe(filePath);
        expect(result.value.holderId).toBeDefined();
        expect(result.value.holderName).toBe('Test Holder');
        expect(result.value.acquiredAt).toBeInstanceOf(Date);
        expect(result.value.expiresAt).toBeInstanceOf(Date);
      }

      cleanup(filePath);
    });

    it('fails to acquire lock when already locked by another process', () => {
      const filePath = getTestPath('already-locked-test');
      cleanup(filePath);

      // Create empty file
      fs.writeFileSync(filePath, '');

      // First lock should succeed
      const firstLock = acquireLock({ path: filePath, holderName: 'First Holder' });
      expect(firstLock.ok).toBe(true);

      // Second lock should fail with FileLockedError
      const secondLock = acquireLock({ path: filePath, holderName: 'Second Holder' });
      expect(secondLock.ok).toBe(false);
      if (!secondLock.ok) {
        expect(secondLock.error.name).toBe('FileLockedError');
        // Note: holderId may not be directly accessible on the error object
        // The important thing is that it returns FileLockedError
      }

      // Cleanup - release the first lock
      if (firstLock.ok) {
        releaseLock({ lock: firstLock.value });
      }
    });

    it('allows lock acquisition when existing lock is stale', () => {
      const filePath = getTestPath('stale-lock-test');
      cleanup(filePath);

      // Create empty file
      fs.writeFileSync(filePath, '');

      // Create a stale lock file manually with past expiry
      const staleLockContent = {
        holderId: 'stale-holder',
        holderName: 'Stale Holder',
        acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago (expired)
      };
      fs.writeFileSync(filePath + '.lock', JSON.stringify(staleLockContent), 'utf-8');

      // Should be able to acquire since lock is stale
      const result = acquireLock({ path: filePath, holderName: 'New Holder' });
      expect(result.ok).toBe(true);

      cleanup(filePath);
    });
  });

  describe('releaseLock', () => {
    it('releases lock successfully', () => {
      const filePath = getTestPath('release-lock-test');
      cleanup(filePath);

      fs.writeFileSync(filePath, '');

      const lockResult = acquireLock({ path: filePath });
      expect(lockResult.ok).toBe(true);

      if (lockResult.ok) {
        const releaseResult = releaseLock({ lock: lockResult.value });
        expect(releaseResult.ok).toBe(true);

        // Lock file should be gone
        expect(fs.existsSync(filePath + '.lock')).toBe(false);
      }

      cleanup(filePath);
    });

    it('succeeds even if lock file was already deleted', () => {
      const filePath = getTestPath('release-missing-test');
      cleanup(filePath);

      fs.writeFileSync(filePath, '');

      const lockResult = acquireLock({ path: filePath });
      expect(lockResult.ok).toBe(true);

      if (lockResult.ok) {
        // Delete lock file manually before release
        if (fs.existsSync(filePath + '.lock')) {
          fs.unlinkSync(filePath + '.lock');
        }

        const releaseResult = releaseLock({ lock: lockResult.value });
        expect(releaseResult.ok).toBe(true);
      }

      cleanup(filePath);
    });
  });

  describe('refreshLock', () => {
    it('refreshes lock extending expiry', () => {
      const filePath = getTestPath('refresh-lock-test');
      cleanup(filePath);

      fs.writeFileSync(filePath, '');

      const lockResult = acquireLock({ path: filePath });
      expect(lockResult.ok).toBe(true);

      if (lockResult.ok) {
        const originalExpiry = lockResult.value.expiresAt;
        const originalHolderId = lockResult.value.holderId;

        // Wait a tiny bit
        const refreshResult = refreshLock({ lock: lockResult.value });
        expect(refreshResult.ok).toBe(true);

        if (refreshResult.ok) {
          // Expiry should be extended (new date should be after original)
          expect(refreshResult.value.expiresAt.getTime()).toBeGreaterThan(originalExpiry.getTime());
          // Holder ID should remain the same
          expect(refreshResult.value.holderId).toBe(originalHolderId);
        }
      }

      cleanup(filePath);
    });

    it('fails when lock file does not exist', () => {
      const filePath = getTestPath('refresh-missing-test');
      cleanup(filePath);

      fs.writeFileSync(filePath, '');

      const lockResult = acquireLock({ path: filePath });
      expect(lockResult.ok).toBe(true);

      if (lockResult.ok) {
        // Delete lock file manually
        if (fs.existsSync(filePath + '.lock')) {
          fs.unlinkSync(filePath + '.lock');
        }

        const refreshResult = refreshLock({ lock: lockResult.value });
        expect(refreshResult.ok).toBe(false);
        if (!refreshResult.ok) {
          expect(refreshResult.error.name).toBe('LockNotFoundError');
        }
      }

      cleanup(filePath);
    });
  });

  describe('isLockStale', () => {
    it('returns some(true) for expired timestamp', () => {
      const pastDate = new Date(Date.now() - 1000).toISOString();
      const result = isLockStale(pastDate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(true);
      }
    });

    it('returns some(false) for future timestamp', () => {
      const futureDate = new Date(Date.now() + 60000).toISOString();
      const result = isLockStale(futureDate);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(false);
      }
    });

    it('returns none() for invalid timestamp', () => {
      const result = isLockStale('not-a-date');
      // isLockStale returns none() for invalid timestamps (when Date.getTime() returns NaN)
      expect(result.ok).toBe(false); // none() has ok: false
    });
  });

  describe('checkLockStatus', () => {
    it('returns isLocked false when no lock exists', () => {
      const filePath = getTestPath('no-lock-test');
      cleanup(filePath);
      fs.writeFileSync(filePath, '');

      const result = checkLockStatus(filePath);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isLocked).toBe(false);
        expect(result.value.isStale).toBe(false);
        expect(result.value.holder).toBeUndefined();
      }

      cleanup(filePath);
    });

    it('returns lock info when lock exists', () => {
      const filePath = getTestPath('check-lock-test');
      cleanup(filePath);
      fs.writeFileSync(filePath, '');

      const lockResult = acquireLock({ path: filePath, holderName: 'Check Test' });
      expect(lockResult.ok).toBe(true);

      if (lockResult.ok) {
        const result = checkLockStatus(filePath);
        expect(result.ok).toBe(true);
        if (result.ok) {
          expect(result.value.isLocked).toBe(true);
          expect(result.value.isStale).toBe(false);
          expect(result.value.holder).toBeDefined();
          expect(result.value.holder?.holderName).toBe('Check Test');
        }
      }

      cleanup(filePath);
    });

    it('detects stale lock', () => {
      const filePath = getTestPath('stale-check-test');
      cleanup(filePath);
      fs.writeFileSync(filePath, '');

      // Create a stale lock manually
      const staleLockContent = {
        holderId: 'stale-check-holder',
        holderName: 'Stale Check',
        acquiredAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
      };
      fs.writeFileSync(filePath + '.lock', JSON.stringify(staleLockContent), 'utf-8');

      const result = checkLockStatus(filePath);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.isLocked).toBe(true);
        expect(result.value.isStale).toBe(true);
      }

      cleanup(filePath);
    });
  });
});