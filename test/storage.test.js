/**
 * Tests for storage.js
 */

const fs = require('fs').promises;
const path = require('path');
const { MemoryStorage, DEFAULT_MEMORY } = require('../storage');

describe('MemoryStorage', () => {
  let storage;
  let testDir;
  let testFile;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'memory-test-'));
    testFile = path.join(testDir, 'test-memory.json');
    storage = new MemoryStorage(testFile);
  });

  afterEach(async () => {
    // Cleanup
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    test('should create new file with defaults when file does not exist', async () => {
      await storage.initialize();
      
      const content = await fs.readFile(testFile, 'utf-8');
      const data = JSON.parse(content);
      
      expect(data.version).toBe('1.0.0');
      expect(data.metadata.createdAt).toBeDefined();
      expect(data.userPreferences).toBeDefined();
    });

    test('should load existing file', async () => {
      // Create a test file
      const testData = { ...DEFAULT_MEMORY, customField: 'test' };
      await fs.writeFile(testFile, JSON.stringify(testData));
      
      await storage.initialize();
      
      const value = storage.get('customField');
      expect(value).toBe('test');
    });

    test('should initialize concurrent callers only once', async () => {
      await Promise.all([storage.initialize(), storage.initialize()]);

      expect(storage.get('metadata.totalSessions')).toBe(0);
      expect(await fs.readFile(testFile, 'utf-8')).toContain('"version"');
    });

    test('should create parent directories for nested storage paths', async () => {
      const nestedFile = path.join(testDir, 'nested', 'memory', 'test.json');
      const nestedStorage = new MemoryStorage(nestedFile);

      await nestedStorage.initialize();

      expect(await fs.readFile(nestedFile, 'utf-8')).toContain('"version"');
    });

    test('should fill missing fields when loading partial data', async () => {
      await fs.writeFile(testFile, JSON.stringify({
        version: '1.0.0',
        metadata: { createdAt: new Date().toISOString() },
        userPreferences: { imported: true }
      }));

      await storage.initialize();

      expect(storage.get('sessionHistory.toolUsageStats')).toEqual({});
      expect(storage.get('projectContext.activeProjects')).toEqual([]);
    });
  });

  describe('Get and Set', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should get value by dot path', () => {
      storage.set('userPreferences.defaultModel', 'qwen3.7-plus');
      const value = storage.get('userPreferences.defaultModel');
      expect(value).toBe('qwen3.7-plus');
    });

    test('should return undefined for non-existent path', () => {
      const value = storage.get('nonexistent.path');
      expect(value).toBeUndefined();
    });

    test('should set nested values', () => {
      storage.set('userPreferences.customSettings.theme', 'dark');
      const theme = storage.get('userPreferences.customSettings.theme');
      expect(theme).toBe('dark');
    });

    test('should reject prototype pollution paths', () => {
      expect(() => storage.set('__proto__.polluted', 'yes')).toThrow('Unsafe storage path');
      expect(() => storage.get('constructor.prototype')).toThrow('Unsafe storage path');
      expect({}).not.toHaveProperty('polluted');
    });

    test('should mark as dirty when setting values', () => {
      expect(storage.isDirty).toBe(false);
      storage.set('userPreferences.language', 'zh-CN');
      expect(storage.isDirty).toBe(true);
    });
  });

  describe('Save and Load', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should save data to file', async () => {
      storage.set('userPreferences.defaultModel', 'test-model');
      await storage.save();
      
      const content = await fs.readFile(testFile, 'utf-8');
      const data = JSON.parse(content);
      
      expect(data.userPreferences.defaultModel).toBe('test-model');
    });

    test('should not save if not dirty', async () => {
      await storage.save();
      const isDirty = storage.isDirty;
      expect(isDirty).toBe(false);
    });

    test('should update lastUpdated timestamp on save', async () => {
      const before = storage.get('lastUpdated');
      storage.set('userPreferences.test', 'value');
      await storage.save();
      const after = storage.get('lastUpdated');
      
      expect(after).toBeDefined();
      if (before) {
        expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
      }
    });

    test('should serialize concurrent saves without losing the file', async () => {
      storage.set('userPreferences.defaultModel', 'concurrent-model');

      await Promise.all([storage.save(), storage.save(), storage.save()]);

      const reloaded = new MemoryStorage(testFile);
      await reloaded.initialize();
      expect(reloaded.get('userPreferences.defaultModel')).toBe('concurrent-model');
    });

    test('should recover from a stale lock and leave no lock file', async () => {
      const lockPath = `${testFile}.lock`;
      await fs.writeFile(lockPath, 'stale');
      const staleDate = new Date(Date.now() - 60000);
      await fs.utimes(lockPath, staleDate, staleDate);

      storage.set('userPreferences.defaultModel', 'stale-lock-recovered');
      await storage.save();

      expect(await fs.readFile(testFile, 'utf8')).toContain('stale-lock-recovered');
      await expect(fs.access(lockPath)).rejects.toThrow();
    });

    test('should serialize saves from separate storage instances into valid JSON', async () => {
      const first = new MemoryStorage(testFile);
      const second = new MemoryStorage(testFile);
      await Promise.all([first.initialize(), second.initialize()]);

      first.set('userPreferences.first', 'one');
      second.set('userPreferences.second', 'two');
      await Promise.all([first.save(), second.save()]);

      const content = await fs.readFile(testFile, 'utf8');
      expect(() => JSON.parse(content)).not.toThrow();
      const data = JSON.parse(content);
      expect(data.userPreferences.first).toBe('one');
      expect(data.userPreferences.second).toBe('two');
      await expect(fs.access(`${testFile}.lock`)).rejects.toThrow();
    });

    test('should restrict persisted file permissions on supported platforms', async () => {
      if (process.platform === 'win32') return;

      const mode = (await fs.stat(testFile)).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe('Array Operations', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should append to array', async () => {
      await storage.appendToArray('inputHabits.preferredTools', 'read');
      await storage.appendToArray('inputHabits.preferredTools', 'write');
      
      const tools = storage.get('inputHabits.preferredTools');
      expect(tools).toEqual(['write', 'read']);
    });

    test('should respect max length', async () => {
      for (let i = 1; i <= 5; i++) {
        await storage.appendToArray('sessionHistory.recentTopics', `topic-${i}`, 3);
      }
      
      const topics = storage.get('sessionHistory.recentTopics');
      expect(topics.length).toBe(3);
      expect(topics[0]).toBe('topic-5');
    });
  });

  describe('Tool Usage Tracking', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should record tool usage', async () => {
      await storage.recordToolUsage('read');
      await storage.recordToolUsage('read');
      await storage.recordToolUsage('write');
      
      const stats = storage.get('sessionHistory.toolUsageStats');
      expect(stats.read).toBe(2);
      expect(stats.write).toBe(1);
    });
  });

  describe('Project Management', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should add new project', async () => {
      await storage.addProject({
        path: '/test/project',
        name: 'Test Project',
        tags: ['test']
      });
      
      const projects = storage.get('projectContext.activeProjects');
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Test Project');
    });

    test('should update existing project', async () => {
      await storage.addProject({
        path: '/test/project',
        name: 'Test Project'
      });
      
      await storage.addProject({
        path: '/test/project',
        name: 'Updated Project',
        tags: ['updated']
      });
      
      const projects = storage.get('projectContext.activeProjects');
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Updated Project');
      expect(projects[0].tags).toEqual(['updated']);
    });
  });

  describe('Clear and Export', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should clear all data', async () => {
      storage.set('userPreferences.test', 'value');
      await storage.clear();
      
      const prefs = storage.get('userPreferences.test');
      expect(prefs).toBeUndefined();
    });

    test('should persist cleared data and isolate default nested objects', async () => {
      storage.set('userPreferences.preferredAgents', ['agent']);
      await storage.clear();

      const reloaded = new MemoryStorage(testFile);
      await reloaded.initialize();
      expect(reloaded.get('userPreferences.preferredAgents')).toEqual([]);

      reloaded.get('userPreferences.preferredAgents').push('mutated');
      expect(reloaded.get('userPreferences.preferredAgents')).toEqual([]);
    });

    test('should export data', async () => {
      storage.set('userPreferences.test', 'value');
      const data = storage.exportData();
      
      expect(data.userPreferences.test).toBe('value');
      expect(data.version).toBe('1.0.0');
    });

    test('should deep clone exported and imported data', async () => {
      storage.set('userPreferences.customSettings', { nested: { enabled: true } });
      const exported = storage.exportData();
      exported.userPreferences.customSettings.nested.enabled = false;
      expect(storage.get('userPreferences.customSettings.nested.enabled')).toBe(true);

      const imported = {
        version: '1.0.0',
        metadata: { createdAt: new Date().toISOString() },
        userPreferences: { customSettings: { nested: { enabled: true } } }
      };
      await storage.importData(imported);
      imported.userPreferences.customSettings.nested.enabled = false;
      expect(storage.get('userPreferences.customSettings.nested.enabled')).toBe(true);
    });

    test('should import data', async () => {
      const importData = {
        version: '1.0.0',
        metadata: { createdAt: new Date().toISOString() },
        userPreferences: { imported: true }
      };
      
      await storage.importData(importData);
      const value = storage.get('userPreferences.imported');
      expect(value).toBe(true);
    });

    test('should reject invalid import data', async () => {
      const invalidData = { noVersion: true };
      
      await expect(storage.importData(invalidData)).rejects.toThrow('Invalid memory data format');
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await storage.initialize();
    });

    test('should get stats', () => {
      const stats = storage.getStats();
      
      expect(stats.totalSessions).toBe(0);
      expect(stats.trackedTools).toBe(0);
      expect(stats.activeProjects).toBe(0);
    });

    test('should reflect data in stats', async () => {
      await storage.recordToolUsage('read');
      await storage.addProject({ path: '/test', name: 'Test' });
      
      const stats = storage.getStats();
      expect(stats.trackedTools).toBe(1);
      expect(stats.activeProjects).toBe(1);
    });
  });
});
