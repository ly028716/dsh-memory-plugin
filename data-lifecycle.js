/**
 * Local backup, restore, and retention operations for memory data.
 */

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const { migrateData } = require('./migrations');
const { INPUT_LIMITS, assertDataWithinLimits } = require('./limits');

const BACKUP_NAME_PATTERN = /^memory-[A-Za-z0-9_-]+\.json$/;
const REASON_PATTERN = /^[A-Za-z0-9_-]+$/;

function assertSerializedSize(content, label) {
  const bytes = Buffer.byteLength(content, 'utf8');
  if (bytes > INPUT_LIMITS.maxMemoryFileBytes) {
    throw new Error(`${label} must not exceed ${INPUT_LIMITS.maxMemoryFileBytes} bytes`);
  }
}

class DataLifecycleManager {
  constructor(storage, options = {}) {
    if (!storage || typeof storage.exportData !== 'function' || typeof storage.importData !== 'function') {
      throw new Error('storage must support exportData and importData');
    }

    this.storage = storage;
    this.backupDir = path.resolve(options.backupDir || `${storage.storagePath}.backups`);
    this.backupRetentionDays = options.backupRetentionDays || 30;
    this.backupRetentionCount = options.backupRetentionCount || 10;
  }

  async ensureBackupDir() {
    await fs.mkdir(this.backupDir, { recursive: true });
  }

  normalizeReason(reason) {
    if (typeof reason !== 'string' || !REASON_PATTERN.test(reason)) {
      throw new Error('Backup reason must contain only letters, numbers, hyphens, or underscores');
    }
    return reason;
  }

  safeBackupPath(name) {
    if (typeof name !== 'string' || path.basename(name) !== name || !BACKUP_NAME_PATTERN.test(name)) {
      throw new Error('Invalid backup name');
    }

    const resolved = path.resolve(this.backupDir, name);
    const directoryPrefix = `${this.backupDir}${path.sep}`;
    if (!resolved.startsWith(directoryPrefix)) throw new Error('Invalid backup name');
    return resolved;
  }

  async setPrivateFileMode(filePath) {
    if (typeof this.storage.setPrivateFileMode === 'function') {
      await this.storage.setPrivateFileMode(filePath);
      return;
    }
    try {
      await fs.chmod(filePath, 0o600);
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'ENOSYS'].includes(error.code)) throw error;
    }
  }

  async replaceFileAtomically(temporary, destination) {
    if (typeof this.storage.replaceFileAtomically === 'function') {
      await this.storage.replaceFileAtomically(temporary, destination);
      return;
    }
    await fs.rename(temporary, destination);
  }

  async writeSnapshot(data, reason, raw = false) {
    await this.ensureBackupDir();
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
    const token = crypto.randomBytes(4).toString('hex');
    const name = `memory-${timestamp}-${token}-${reason}.json`;
    const destination = this.safeBackupPath(name);
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    const content = raw ? data : JSON.stringify(data, null, 2);
    if (raw) {
      assertSerializedSize(content, 'backup file');
    } else {
      assertDataWithinLimits(data, 'backup data', INPUT_LIMITS.maxMemoryFileBytes);
      assertSerializedSize(content, 'backup file');
    }

    try {
      const handle = await fs.open(temporary, 'w', 0o600);
      try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
      await this.setPrivateFileMode(temporary);
      await this.replaceFileAtomically(temporary, destination);
      await this.setPrivateFileMode(destination);
      const stat = await fs.stat(destination);
      return {
        name,
        path: destination,
        size: stat.size,
        createdAt: stat.mtime.toISOString(),
        reason
      };
    } finally {
      try {
        await fs.unlink(temporary);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }

  async backup(reason = 'manual') {
    const normalizedReason = this.normalizeReason(reason);
    return this.writeSnapshot(this.storage.exportData(), normalizedReason);
  }

  async backupFile(reason = 'startup') {
    const normalizedReason = this.normalizeReason(reason);
    const content = await fs.readFile(this.storage.storagePath, 'utf8');
    return this.writeSnapshot(content, normalizedReason, true);
  }

  parseReason(name) {
    const withoutPrefix = name.replace(/^memory-/, '').replace(/\.json$/, '');
    const segments = withoutPrefix.split('-');
    return segments.length >= 3 ? segments.slice(2).join('-') : 'unknown';
  }

  async listBackups() {
    try {
      const entries = await fs.readdir(this.backupDir, { withFileTypes: true });
      const backups = [];
      for (const entry of entries) {
        if (!BACKUP_NAME_PATTERN.test(entry.name) || entry.isSymbolicLink() || !entry.isFile()) continue;
        const filePath = this.safeBackupPath(entry.name);
        const stat = await fs.stat(filePath);
        backups.push({
          name: entry.name,
          path: filePath,
          size: stat.size,
          createdAt: stat.mtime.toISOString(),
          reason: this.parseReason(entry.name)
        });
      }
      return backups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
  }

  async readBackup(name) {
    const filePath = this.safeBackupPath(name);
    let stat;
    try {
      stat = await fs.lstat(filePath);
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error(`Backup not found: ${name}`);
      throw error;
    }
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Invalid backup file');

    const content = await fs.readFile(filePath, 'utf8');
    assertSerializedSize(content, 'backup file');
    let data;
    try {
      data = JSON.parse(content);
    } catch (_error) {
      throw new Error('Invalid backup JSON');
    }
    return { filePath, data: migrateData(data) };
  }

  async restoreBackup(name) {
    const { data } = await this.readBackup(name);
    const safetyBackup = await this.backup('restore-safety');
    await this.storage.importData(data);
    const retention = await this.applyRetention();
    return { restored: name, safetyBackup, retention };
  }

  async quarantinePrimaryFile() {
    const source = this.storage.storagePath;
    const timestamp = new Date().toISOString().replace(/[-:.]/g, '').replace('Z', 'Z');
    const token = crypto.randomBytes(4).toString('hex');
    const destination = `${source}.corrupt-${timestamp}-${token}`;

    try {
      await fs.rename(source, destination);
      await this.setPrivateFileMode(destination);
      return destination;
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async recoverFromLatestBackup() {
    if (typeof this.storage.replaceData !== 'function') {
      throw new Error('storage must support replaceData for recovery');
    }

    const backups = await this.listBackups();
    const skipped = [];
    for (const backup of backups) {
      try {
        const { data } = await this.readBackup(backup.name);
        const quarantined = await this.quarantinePrimaryFile();
        await this.storage.replaceData(data);
        return { restored: backup.name, quarantined, skipped };
      } catch (error) {
        skipped.push({ name: backup.name, reason: error.message });
      }
    }

    throw new Error('No valid memory backup is available for recovery');
  }

  async applyRetention() {
    const backups = await this.listBackups();
    const cutoff = Date.now() - this.backupRetentionDays * 24 * 60 * 60 * 1000;
    const deleted = [];

    for (let index = 0; index < backups.length; index += 1) {
      const backup = backups[index];
      const isRecent = new Date(backup.createdAt).getTime() >= cutoff;
      const isWithinCount = index < this.backupRetentionCount;
      if (isRecent || isWithinCount) continue;
      await fs.unlink(backup.path);
      deleted.push(backup.name);
    }

    const remaining = await this.listBackups();
    return { deleted, remaining };
  }
}

module.exports = { DataLifecycleManager };
