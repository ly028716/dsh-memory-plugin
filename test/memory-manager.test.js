/**
 * Tests for memory-manager.js
 */

const fs = require('fs').promises;
const path = require('path');
const { MemoryManager } = require('../memory-manager');
const { MemoryStorage } = require('../storage');
const { validateConfig } = require('../config');

describe('MemoryManager', () => {
  let manager;
  let storage;
  let testDir;
  let testFile;
  let config;

  beforeEach(async () => {
    // Create temporary directory for tests
    testDir = await fs.mkdtemp(path.join(require('os').tmpdir(), 'memory-manager-test-'));
    testFile = path.join(testDir, 'test-memory.json');
    
    config = validateConfig({
      storagePath: testFile,
      autoSaveInterval: 100, // Fast for testing
      trackToolCalls: true,
      trackPreferences: true,
      trackProjectContext: true,
      trackSessionHistory: true,
      enableRecommendations: true
    });
    
    storage = new MemoryStorage(testFile);
    manager = new MemoryManager(config, storage);
    
    await manager.initialize();
  });

  afterEach(async () => {
    // Cleanup
    manager.stopAutoSave();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('Initialization', () => {
    test('should initialize storage and metadata', async () => {
      const totalSessions = storage.get('metadata.totalSessions');
      expect(totalSessions).toBe(1);
      
      const lastSessionDate = storage.get('metadata.lastSessionDate');
      expect(lastSessionDate).toBeDefined();
    });

    test('should start auto-save timer', () => {
      expect(manager.autoSaveTimer).toBeDefined();
    });
  });

  describe('Tool Call Recording', () => {
    test('should record tool call', async () => {
      await manager.recordToolCall({
        name: 'read',
        args: { file_path: 'test.txt' },
        result: 'success'
      });
      
      const stats = storage.get('sessionHistory.toolUsageStats');
      expect(stats.read).toBe(1);
    });

    test('should track preferred tools', async () => {
      await manager.recordToolCall({
        name: 'glob',
        args: {},
        result: []
      });
      
      const tools = storage.get('inputHabits.preferredTools');
      expect(tools).toContain('glob');
    });

    test('should analyze commands', async () => {
      await manager.recordToolCall({
        name: 'pwsh',
        args: { command: 'pnpm run dev' },
        result: null
      });
      
      const commands = storage.get('inputHabits.commonCommands');
      expect(commands.length).toBe(1);
      expect(commands[0].command).toBe('pnpm run dev');
      expect(commands[0].count).toBe(1);
    });

    test('should not record when tracking is disabled', async () => {
      const noTrackConfig = validateConfig({
        storagePath: testFile,
        trackToolCalls: false
      });
      const noTrackStorage = new MemoryStorage(testFile + '-notrack');
      const noTrackManager = new MemoryManager(noTrackConfig, noTrackStorage);
      await noTrackManager.initialize();
      
      await noTrackManager.recordToolCall({
        name: 'read',
        args: {},
        result: null
      });
      
      const stats = noTrackStorage.get('sessionHistory.toolUsageStats');
      expect(stats).toEqual({});
      
      noTrackManager.stopAutoSave();
      await fs.rm(testFile + '-notrack', { force: true });
    });
  });

  describe('Preference Recording', () => {
    test('should record preference', async () => {
      await manager.recordPreference('defaultModel', 'qwen3.7-plus');
      
      const model = storage.get('userPreferences.defaultModel');
      expect(model).toBe('qwen3.7-plus');
    });

    test('should not record when tracking is disabled', async () => {
      const noTrackConfig = validateConfig({
        storagePath: testFile,
        trackPreferences: false
      });
      const noTrackStorage = new MemoryStorage(testFile + '-nopref');
      const noTrackManager = new MemoryManager(noTrackConfig, noTrackStorage);
      await noTrackManager.initialize();
      
      await noTrackManager.recordPreference('test', 'value');
      
      const value = noTrackStorage.get('userPreferences.test');
      expect(value).toBeUndefined();
      
      noTrackManager.stopAutoSave();
      await fs.rm(testFile + '-nopref', { force: true });
    });
  });

  describe('Project Context', () => {
    test('should record project context', async () => {
      await manager.recordProjectContext({
        path: '/test/project',
        name: 'Test Project',
        tags: ['test']
      });
      
      const projects = storage.get('projectContext.activeProjects');
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe('Test Project');
    });

    test('should not record when tracking is disabled', async () => {
      const noTrackConfig = validateConfig({
        storagePath: testFile,
        trackProjectContext: false
      });
      const noTrackStorage = new MemoryStorage(testFile + '-noproj');
      const noTrackManager = new MemoryManager(noTrackConfig, noTrackStorage);
      await noTrackManager.initialize();
      
      await noTrackManager.recordProjectContext({
        path: '/test',
        name: 'Test'
      });
      
      const projects = noTrackStorage.get('projectContext.activeProjects');
      expect(projects).toEqual([]);
      
      noTrackManager.stopAutoSave();
      await fs.rm(testFile + '-noproj', { force: true });
    });
  });

  describe('Session History', () => {
    test('should record topic', async () => {
      await manager.recordSessionItem('topic', 'plugin development');
      
      const topics = storage.get('sessionHistory.recentTopics');
      expect(topics.length).toBe(1);
      expect(topics[0].content).toBe('plugin development');
    });

    test('should record task', async () => {
      await manager.recordSessionItem('task', 'implement feature');
      
      const tasks = storage.get('sessionHistory.frequentTasks');
      expect(tasks.length).toBe(1);
      expect(tasks[0].content).toBe('implement feature');
    });

    test('should not record when tracking is disabled', async () => {
      const noTrackConfig = validateConfig({
        storagePath: testFile,
        trackSessionHistory: false
      });
      const noTrackStorage = new MemoryStorage(testFile + '-nosession');
      const noTrackManager = new MemoryManager(noTrackConfig, noTrackStorage);
      await noTrackManager.initialize();
      
      await noTrackManager.recordSessionItem('topic', 'test');
      
      const topics = noTrackStorage.get('sessionHistory.recentTopics');
      expect(topics).toEqual([]);
      
      noTrackManager.stopAutoSave();
      await fs.rm(testFile + '-nosession', { force: true });
    });
  });

  describe('Recommendations', () => {
    beforeEach(async () => {
      // Setup some data for recommendations
      storage.set('userPreferences.preferredAgents', ['agent1', 'agent2']);
      storage.set('userPreferences.defaultModel', 'test-model');
      await storage.appendToArray('inputHabits.commonCommands', { command: 'cmd1', count: 5 });
      await storage.addProject({ path: '/test', name: 'Test Project' });
      await storage.save();
    });

    test('should get recommendations', () => {
      const recs = manager.getRecommendations('coding');
      
      expect(recs.available).toBe(true);
      expect(recs.suggestions.length).toBeGreaterThan(0);
    });

    test('should include agent recommendations', () => {
      const recs = manager.getRecommendations('coding');
      
      const agentRec = recs.suggestions.find(s => s.type === 'agent');
      expect(agentRec).toBeDefined();
      expect(agentRec.items).toContain('agent1');
    });

    test('should include model recommendations', () => {
      const recs = manager.getRecommendations('coding');
      
      const modelRec = recs.suggestions.find(s => s.type === 'model');
      expect(modelRec).toBeDefined();
      expect(modelRec.items).toContain('test-model');
    });

    test('should return unavailable when disabled', () => {
      const noRecConfig = validateConfig({
        storagePath: testFile,
        enableRecommendations: false
      });
      const noRecStorage = new MemoryStorage(testFile + '-norec');
      const noRecManager = new MemoryManager(noRecConfig, noRecStorage);
      
      const recs = noRecManager.getRecommendations('coding');
      expect(recs.available).toBe(false);
      
      noRecManager.stopAutoSave();
    });
  });

  describe('Statistics', () => {
    test('should get statistics', () => {
      const stats = manager.getStats();
      
      expect(stats.totalSessions).toBe(1);
      expect(stats.lastUpdated).toBeDefined();
    });
  });

  describe('Data Management', () => {
    test('should export data', () => {
      storage.set('userPreferences.test', 'value');
      const data = manager.exportData();
      
      expect(data.userPreferences.test).toBe('value');
    });

    test('should import data', async () => {
      const importData = {
        version: '1.0.0',
        metadata: { createdAt: new Date().toISOString() },
        userPreferences: { imported: true }
      };
      
      await manager.importData(importData);
      const value = storage.get('userPreferences.imported');
      expect(value).toBe(true);
    });

    test('should clear memory when allowed', async () => {
      storage.set('userPreferences.test', 'value');
      await manager.clearMemory();
      
      const value = storage.get('userPreferences.test');
      expect(value).toBeUndefined();
    });

    test('should throw error when clearing is disabled', async () => {
      const noClearConfig = validateConfig({
        storagePath: testFile,
        allowClearMemory: false
      });
      const noClearStorage = new MemoryStorage(testFile + '-noclear');
      const noClearManager = new MemoryManager(noClearConfig, noClearStorage);
      await noClearManager.initialize();
      
      await expect(noClearManager.clearMemory()).rejects.toThrow('Memory clearing is disabled');
      
      noClearManager.stopAutoSave();
      await fs.rm(testFile + '-noclear', { force: true });
    });
  });

  describe('Cleanup', () => {
    test('should dispose properly', async () => {
      storage.set('userPreferences.test', 'value');
      await manager.dispose();
      
      // Timer should be cleared
      expect(manager.autoSaveTimer).toBeNull();
      
      // Data should be saved
      const loaded = new MemoryStorage(testFile);
      await loaded.initialize();
      const value = loaded.get('userPreferences.test');
      expect(value).toBe('value');
    });
  });
});
