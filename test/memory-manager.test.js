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
    await manager.dispose();
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

    test('should initialize concurrent callers only once', async () => {
      const concurrentStorage = new MemoryStorage(testFile + '-concurrent');
      const concurrentManager = new MemoryManager(config, concurrentStorage);

      await Promise.all([concurrentManager.initialize(), concurrentManager.initialize()]);

      expect(concurrentStorage.get('metadata.totalSessions')).toBe(1);
      await concurrentManager.dispose();
    });

    test('should recover from the latest valid backup when the primary file is corrupt', async () => {
      const recoveryFile = path.join(testDir, 'recovery-memory.json');
      const recoveryConfig = validateConfig({ ...config, storagePath: recoveryFile });
      const originalStorage = new MemoryStorage(recoveryFile);
      const originalManager = new MemoryManager(recoveryConfig, originalStorage);
      await originalManager.initialize();
      await originalManager.recordPreference('defaultModel', 'recovered-model');
      await originalManager.backup('manual');
      await originalManager.dispose();

      await fs.writeFile(recoveryFile, '{not valid json', 'utf8');

      const recoveringStorage = new MemoryStorage(recoveryFile);
      const recoveringManager = new MemoryManager(recoveryConfig, recoveringStorage);
      await recoveringManager.initialize();

      expect(recoveringStorage.get('userPreferences.defaultModel')).toBe('recovered-model');
      await recoveringManager.dispose();
    });

    test('should wait for initialization before recording data', async () => {
      const pendingStorage = new MemoryStorage(testFile + '-pending');
      const pendingManager = new MemoryManager(config, pendingStorage);
      const pendingWrite = pendingManager.recordPreference('defaultModel', 'pending-model');

      await pendingWrite;

      expect(pendingStorage.get('userPreferences.defaultModel')).toBe('pending-model');
      await pendingManager.dispose();
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

    test('should persist preferred tools after a tool call without a command', async () => {
      await manager.recordToolCall({
        name: 'glob',
        args: {},
        result: []
      });

      const reloaded = new MemoryStorage(testFile);
      await reloaded.initialize();
      expect(reloaded.get('inputHabits.preferredTools')).toEqual(['glob']);
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

    test('should redact sensitive values before storing collected data', async () => {
      await manager.recordToolCall({
        name: 'pwsh',
        args: { command: 'deploy --api-key=SECRET_VALUE' },
        result: 'PASSWORD_VALUE'
      });
      await manager.recordPreference('credentials', {
        password: 'PASSWORD_VALUE',
        region: 'cn'
      });
      await manager.recordSessionItem('task', 'use token SESSION_TOKEN');
      await manager.recordProjectContext({
        path: 'C:\\Users\\Alice\\repo',
        name: 'repo',
        tags: ['team']
      });

      const data = manager.exportData();
      const serialized = JSON.stringify(data);

      expect(serialized).not.toContain('SECRET_VALUE');
      expect(serialized).not.toContain('PASSWORD_VALUE');
      expect(serialized).not.toContain('SESSION_TOKEN');
      expect(serialized).not.toContain('C:\\Users\\Alice');
      expect(data.inputHabits.commonCommands[0].command).toContain('[REDACTED]');
      expect(data.userPreferences.credentials.password).toBe('[REDACTED]');
      expect(data.sessionHistory.frequentTasks[0].content).toContain('[REDACTED]');
      expect(data.projectContext.activeProjects[0].path).toBe('C:\\Users\\[USER]\\repo');
    });

    test('should redact commands regardless of the recording entry point', async () => {
      await manager.recordToolCall({
        name: 'pwsh',
        args: { command: 'curl https://user:RAW_SECRET@example.test/repo.git' },
        result: null
      });
      await manager.analyzeCommand('git clone https://user:DIRECT_SECRET@example.test/repo.git');

      const serialized = JSON.stringify(manager.exportData());
      const persisted = await fs.readFile(testFile, 'utf8');

      expect(serialized).not.toContain('RAW_SECRET');
      expect(serialized).not.toContain('DIRECT_SECRET');
      expect(persisted).not.toContain('RAW_SECRET');
      expect(persisted).not.toContain('DIRECT_SECRET');
    });

    test('should reject commands above the input size limit', async () => {
      await expect(manager.analyzeCommand('x'.repeat(10001)))
        .rejects.toThrow('command must not exceed 10000 characters');
    });

    test('should record explicit preference when automatic tracking is disabled', async () => {
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

    test('should reject oversized preference values', async () => {
      await expect(manager.recordPreference('largeValue', 'x'.repeat(256 * 1024 + 1)))
        .rejects.toThrow('stored value must not exceed');
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
      expect(value).toBe('value');
      
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

    test('should derive a project name from its path when omitted', async () => {
      await manager.recordProjectContext({ path: '/test/project' });

      const projects = storage.get('projectContext.activeProjects');
      expect(projects[0].name).toBe('project');
    });

    test('should reject oversized project metadata', async () => {
      await expect(manager.recordProjectContext({ path: 'x'.repeat(4097) }))
        .rejects.toThrow('projectInfo.path must not exceed 4096 characters');
      await expect(manager.recordProjectContext({ path: '/test', name: 'x'.repeat(201) }))
        .rejects.toThrow('projectInfo.name must not exceed 200 characters');
      await expect(manager.recordProjectContext({ path: '/test', tags: Array.from({ length: 51 }, () => 'tag') }))
        .rejects.toThrow('projectInfo.tags must not contain more than 50 items');
    });

    test('should record explicit project when automatic tracking is disabled', async () => {
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
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Test');
      
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

    test('should reject oversized session content', async () => {
      await expect(manager.recordSessionItem('task', 'x'.repeat(10001)))
        .rejects.toThrow('session item content must not exceed 10000 characters');
    });

    test('should record explicit session item when automatic tracking is disabled', async () => {
      const noTrackConfig = validateConfig({
        storagePath: testFile,
        trackSessionHistory: false
      });
      const noTrackStorage = new MemoryStorage(testFile + '-nosession');
      const noTrackManager = new MemoryManager(noTrackConfig, noTrackStorage);
      await noTrackManager.initialize();
      
      await noTrackManager.recordSessionItem('topic', 'test');
      
      const topics = noTrackStorage.get('sessionHistory.recentTopics');
      expect(topics).toHaveLength(1);
      expect(topics[0].content).toBe('test');
      
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

    test('tracks recommendation metrics for contextual matches and fallbacks', async () => {
      storage.set('inputHabits.commonCommands', [
        { command: 'npm run test', count: 5 },
        { command: 'git push', count: 5 }
      ]);
      storage.set('projectContext.activeProjects', [
        { name: 'Test Project', path: '/test', tags: ['node'] },
        { name: 'Deploy Project', path: '/deploy', tags: ['ops'] }
      ]);
      await storage.save();

      manager.getRecommendations('test');
      manager.getRecommendations('docs');

      expect(manager.getRecommendationMetrics()).toEqual(expect.objectContaining({
        requests: 2,
        availableRequests: 2,
        contextualRequests: 2,
        contextMatches: 1,
        fallbackRequests: 1,
        suggestions: expect.any(Number),
        contextMatchRate: 0.5,
        fallbackRate: 0.5,
        patternRecognitionThreshold: config.patternRecognitionThreshold
      }));
    });

    test('returns null rates without contextual requests and protects metric state', () => {
      manager.getRecommendations();
      const metrics = manager.getRecommendationMetrics();
      metrics.requests = 999;

      expect(metrics.contextMatchRate).toBeNull();
      expect(metrics.fallbackRate).toBeNull();
      expect(manager.getRecommendationMetrics().requests).toBe(1);
    });

    test('should prioritize recommendations matching the requested context', async () => {
      storage.set('inputHabits.commonCommands', [
        { command: 'npm run test', count: 5 },
        { command: 'git push', count: 5 }
      ]);
      storage.set('projectContext.activeProjects', [
        { name: 'Test Project', path: '/test', tags: ['node'] },
        { name: 'Deploy Project', path: '/deploy', tags: ['ops'] }
      ]);
      await storage.save();

      const recs = manager.getRecommendations('test');
      const commandRec = recs.suggestions.find(s => s.type === 'commands');
      const projectRec = recs.suggestions.find(s => s.type === 'projects');

      expect(commandRec.items).toEqual(['npm run test']);
      expect(projectRec.items).toEqual(['Test Project']);
    });

    test('should apply pattern recognition threshold to command recommendations', async () => {
      storage.set('inputHabits.commonCommands', [
        { command: 'frequent command', count: 3 },
        { command: 'one-off command', count: 2 }
      ]);
      await storage.save();

      const recs = manager.getRecommendations();
      const commandRec = recs.suggestions.find(s => s.type === 'commands');

      expect(commandRec.items).toEqual(['frequent command']);
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
      expect(noRecManager.getRecommendationMetrics()).toEqual(expect.objectContaining({
        requests: 1,
        availableRequests: 0,
        suggestions: 0
      }));
      
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

    test('should redact sensitive values during import', async () => {
      await manager.importData({
        version: '1.0.0',
        metadata: { createdAt: new Date().toISOString() },
        inputHabits: {
          commonCommands: [{ command: 'deploy --api-key=IMPORTED_SECRET', count: 1 }]
        }
      });

      const serialized = JSON.stringify(manager.exportData());
      const persisted = await fs.readFile(testFile, 'utf8');

      expect(serialized).not.toContain('IMPORTED_SECRET');
      expect(persisted).not.toContain('IMPORTED_SECRET');
    });

    test('should reject prototype pollution paths', async () => {
      expect(() => storage.set('__proto__.polluted', 'yes')).toThrow('Unsafe storage path');
      expect(() => storage.get('constructor.prototype')).toThrow('Unsafe storage path');
      expect({}).not.toHaveProperty('polluted');
    });

    test('should validate public input boundaries', async () => {
      await expect(manager.recordPreference('__proto__.polluted', 'yes')).rejects.toThrow('Unsafe storage path');
      await expect(manager.recordProjectContext({})).rejects.toThrow('projectInfo.path must be a non-empty string');
      await expect(manager.recordSessionItem('unknown', 'value')).rejects.toThrow('session item type must be topic or task');
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
    test('should not overlap automatic saves', async () => {
      let releaseFirstSave;
      let saveCount = 0;
      const firstSave = new Promise((resolve) => { releaseFirstSave = resolve; });
      const originalSave = storage.save.bind(storage);
      storage.save = jest.fn(() => {
        saveCount += 1;
        return saveCount === 1 ? firstSave : originalSave();
      });

      manager.startAutoSave();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(storage.save).toHaveBeenCalledTimes(1);

      releaseFirstSave();
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(storage.save).toHaveBeenCalledTimes(2);
      manager.stopAutoSave();
    });

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
