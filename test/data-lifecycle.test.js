const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const { MemoryStorage } = require('../storage');
const { DataLifecycleManager } = require('../data-lifecycle');

describe('DataLifecycleManager', () => {
  let testDir;
  let testFile;
  let backupDir;
  let storage;
  let lifecycle;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'memory-lifecycle-'));
    testFile = path.join(testDir, 'memory.json');
    backupDir = path.join(testDir, 'backups');
    storage = new MemoryStorage(testFile);
    await storage.initialize();
    storage.set('userPreferences.defaultModel', 'original');
    await storage.save();
    lifecycle = new DataLifecycleManager(storage, {
      backupDir,
      backupRetentionDays: 30,
      backupRetentionCount: 10
    });
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('creates and lists a private backup snapshot', async () => {
    const result = await lifecycle.backup('manual');
    expect(result.name).toMatch(/^memory-.*-manual\.json$/);
    expect((await lifecycle.listBackups()).map((item) => item.name)).toContain(result.name);
    expect(JSON.parse(await fs.readFile(result.path, 'utf8'))).toEqual(storage.exportData());
  });

  test('uses the storage atomic replacement retry for backup snapshots', async () => {
    const replaceSpy = jest.spyOn(storage, 'replaceFileAtomically');

    const result = await lifecycle.backup('manual');

    expect(replaceSpy).toHaveBeenCalledWith(expect.stringContaining(`${result.path}.`), result.path);
  });

  test('applies retention after each backup', async () => {
    lifecycle = new DataLifecycleManager(storage, {
      backupDir,
      backupRetentionDays: 1,
      backupRetentionCount: 1
    });

    const first = await lifecycle.backup('manual');
    const old = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await fs.utimes(first.path, old, old);

    const second = await lifecycle.backup('manual');

    await expect(fs.access(first.path)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await lifecycle.listBackups()).map((item) => item.name)).toEqual([second.name]);
  });

  test('rejects restore paths outside the backup directory', async () => {
    await expect(lifecycle.restoreBackup('../memory.json')).rejects.toThrow('Invalid backup name');
  });

  test('rejects oversized backup files before parsing or restoring', async () => {
    await fs.mkdir(backupDir, { recursive: true });
    const oversized = JSON.stringify('x'.repeat(5 * 1024 * 1024));
    await fs.writeFile(path.join(backupDir, 'memory-large-manual.json'), oversized);

    await expect(lifecycle.restoreBackup('memory-large-manual.json'))
      .rejects.toThrow('backup file must not exceed');
  });

  test('creates a safety backup before restoring a valid snapshot', async () => {
    const backup = await lifecycle.backup('manual');
    storage.set('userPreferences.defaultModel', 'changed');
    await storage.save();

    const result = await lifecycle.restoreBackup(backup.name);

    expect(result.safetyBackup.name).toContain('-restore-safety.json');
    expect(storage.get('userPreferences.defaultModel')).toBe('original');
    expect((await lifecycle.listBackups()).length).toBe(2);
  });

  test('recovers the latest valid backup and quarantines a corrupt primary file', async () => {
    const backup = await lifecycle.backup('manual');
    await fs.writeFile(testFile, '{not valid json', 'utf8');

    const recoveringStorage = new MemoryStorage(testFile);
    const recoveringLifecycle = new DataLifecycleManager(recoveringStorage, {
      backupDir,
      backupRetentionDays: 30,
      backupRetentionCount: 10
    });
    const recovery = await recoveringLifecycle.recoverFromLatestBackup();

    expect(recovery.restored).toBe(backup.name);
    expect(recoveringStorage.get('userPreferences.defaultModel')).toBe('original');
    await expect(fs.access(recovery.quarantined)).resolves.toBeUndefined();
    expect(JSON.parse(await fs.readFile(testFile, 'utf8')).userPreferences.defaultModel).toBe('original');
  });

  test('retains recent snapshots by age and count without deleting unrelated files', async () => {
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(path.join(backupDir, 'memory-old-manual.json'), '{}');
    await fs.writeFile(path.join(backupDir, 'memory-recent-1-manual.json'), '{}');
    await fs.writeFile(path.join(backupDir, 'memory-recent-2-manual.json'), '{}');
    await fs.writeFile(path.join(backupDir, 'keep.txt'), 'keep');

    const old = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    await fs.utimes(path.join(backupDir, 'memory-old-manual.json'), old, old);

    lifecycle = new DataLifecycleManager(storage, {
      backupDir,
      backupRetentionDays: 30,
      backupRetentionCount: 2
    });
    const result = await lifecycle.applyRetention();

    expect(result.deleted).toEqual(['memory-old-manual.json']);
    await expect(fs.access(path.join(backupDir, 'keep.txt'))).resolves.toBeUndefined();
  });

  test('tolerates concurrent retention runs deleting the same stale snapshot', async () => {
    await fs.mkdir(backupDir, { recursive: true });
    const retainedPath = path.join(backupDir, 'memory-retained-manual.json');
    const stalePath = path.join(backupDir, 'memory-stale-manual.json');
    await fs.writeFile(retainedPath, '{}');
    await fs.writeFile(stalePath, '{}');
    const retainedTime = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const staleTime = new Date(Date.now() - 32 * 24 * 60 * 60 * 1000);
    await fs.utimes(retainedPath, retainedTime, retainedTime);
    await fs.utimes(stalePath, staleTime, staleTime);
    lifecycle = new DataLifecycleManager(storage, {
      backupDir,
      backupRetentionDays: 30,
      backupRetentionCount: 1
    });

    const originalUnlink = fs.unlink;
    const unlinkSpy = jest.spyOn(fs, 'unlink').mockImplementationOnce(async (filePath) => {
      await originalUnlink(filePath);
      const error = new Error('snapshot already removed by another retention run');
      error.code = 'ENOENT';
      throw error;
    });

    try {
      const result = await lifecycle.applyRetention();
      expect(result.deleted).toEqual([]);
    } finally {
      unlinkSpy.mockRestore();
    }

    await expect(fs.access(stalePath)).rejects.toMatchObject({ code: 'ENOENT' });
  });
});
