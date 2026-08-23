const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const plugin = require('../index');

test('declares the DSH host capabilities required by the plugin', () => {
  expect(plugin.inject).toEqual(['systemPrompt', 'tools', 'settings']);
});

function createContext() {
  return {
    listeners: [],
    effects: [],
    services: {},

    on(event, handler) {
      this.listeners.push({ event, handler });
    },

    effect(effectFactory) {
      const cleanup = effectFactory();
      this.effects.push(cleanup);
    },

    provide(name, service) {
      this.services[name] = service;
    }
  };
}

describe('default collection policy', () => {
  let testDir;
  let testFile;
  let context;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-default-collection-'));
    testFile = path.join(testDir, 'memory.json');
    context = createContext();
  });

  afterEach(async () => {
    for (const cleanup of context.effects) {
      if (typeof cleanup === 'function') await cleanup();
    }
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('does not collect automatic data by default', async () => {
    plugin.apply(context, {
      storagePath: testFile,
      autoSaveInterval: 100
    });

    await new Promise(resolve => setTimeout(resolve, 150));

    expect(context.listeners).toEqual([]);
    await expect(fs.access(testFile)).rejects.toThrow();
    expect(context.services.memory.getStats().totalSessions).toBe(0);
    expect(context.services.memory.getStats().trackedTools).toBe(0);
    expect(context.services.memory.getStats().activeProjects).toBe(0);
    expect(context.services.memory.exportData().sessionHistory.recentTopics).toEqual([]);
    expect(context.services.memory.exportData().projectContext.activeProjects).toEqual([]);
  });

  test('allows explicit memory API writes while automatic collection is disabled', async () => {
    plugin.apply(context, {
      storagePath: testFile,
      autoSaveInterval: 100
    });

    await context.services.memory.ready;
    await context.services.memory.setPreference('defaultModel', 'explicit-model');
    await context.services.memory.recordTopic('explicit topic');
    await context.services.memory.addProject({
      path: path.join(testDir, 'project'),
      name: 'explicit-project'
    });

    expect(context.services.memory.getPreference('defaultModel')).toBe('explicit-model');
    expect(context.services.memory.exportData().sessionHistory.recentTopics).toHaveLength(1);
    expect(context.services.memory.exportData().projectContext.activeProjects).toHaveLength(1);
    expect(await fs.readFile(testFile, 'utf8')).toContain('explicit-model');
  });

  test('keeps the service safe while asynchronous initialization is pending', async () => {
    plugin.apply(context, {
      storagePath: testFile,
      autoSaveInterval: 100,
      trackPreferences: true
    });

    expect(context.services.memory.ready).toBeDefined();
    expect(() => context.services.memory.getStats()).not.toThrow();

    const pendingWrite = context.services.memory.setPreference('defaultModel', 'ready-model');
    await context.services.memory.ready;
    await pendingWrite;

    expect(context.services.memory.getPreference('defaultModel')).toBe('ready-model');
  });

  test('sanitizes explicit storage writes through the public service', async () => {
    plugin.apply(context, {
      storagePath: testFile,
      autoSaveInterval: 100
    });

    await context.services.memory.ready;
    await context.services.memory.storage.set('inputHabits.commonCommands', [
      { command: 'deploy --api-key=PUBLIC_SERVICE_SECRET' }
    ]);

    const serialized = await fs.readFile(testFile, 'utf8');
    expect(serialized).not.toContain('PUBLIC_SERVICE_SECRET');
  });

  test('exposes backup lifecycle operations through the memory service', async () => {
    plugin.apply(context, {
      storagePath: testFile,
      backupOnInitialize: false
    });
    await context.services.memory.ready;

    const backup = await context.services.memory.backup();
    expect(backup.name).toMatch(/-manual\.json$/);
    expect(await context.services.memory.listBackups()).toHaveLength(1);
    expect(await context.services.memory.applyRetention()).toEqual({
      deleted: [],
      remaining: expect.any(Array)
    });
  });
});
