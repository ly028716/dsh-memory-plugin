const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const plugin = require('../index');

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
    expect(context.services.memory.getStats().trackedTools).toBe(0);
    expect(context.services.memory.getStats().activeProjects).toBe(0);
    expect(context.services.memory.exportData().sessionHistory.recentTopics).toEqual([]);
    expect(context.services.memory.exportData().projectContext.activeProjects).toEqual([]);
  });
});
