const fs = require('fs').promises;
const os = require('os');
const path = require('path');
jest.mock('@deepseek-ai/schemastery', () => ({
  object: jest.fn((fields) => ({ type: 'object', properties: fields })),
  boolean: jest.fn(() => ({ type: 'boolean' }))
}), { virtual: true });

const plugin = require('../index');
const { MemoryManager } = require('../memory-manager');
const { loadOptionalSchema } = require('../memory-settings');

function createIntegrationContext({ prompt = true, tools = true, settings = false, sessions = true } = {}) {
  const promptDispose = jest.fn();
  const toolDispose = jest.fn();
  const settingsWatchDispose = jest.fn();
  const settingsScope = {
    get: jest.fn(() => ({})),
    watch: jest.fn(() => settingsWatchDispose)
  };
  const settingsRegister = jest.fn(() => settingsScope);
  const context = {
    effects: [],
    services: {},
    listeners: [],
    systemPrompt: prompt ? { context: jest.fn(() => promptDispose) } : undefined,
    tools: tools ? { register: jest.fn(() => toolDispose) } : undefined,
    settings: settings ? { register: settingsRegister } : undefined,
    sessions: sessions ? {} : undefined,

    on(event, handler) {
      this.listeners.push({ event, handler });
    },

    effect(factory) {
      const dispose = factory();
      this.effects.push(dispose);
      return dispose;
    },

    provide(name, service) {
      this.services[name] = service;
    }
  };

  context.registrationDisposers = {
    promptDispose,
    toolDispose,
    settingsRegister,
    settingsScope,
    settingsWatchDispose
  };
  return context;
}

async function disposeContext(context) {
  for (const cleanup of context.effects) {
    if (typeof cleanup === 'function') await cleanup();
  }
}

describe('DSH prompt and tool integration', () => {
  let testDir;
  let testFile;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dsh-integration-'));
    testFile = path.join(testDir, 'memory.json');
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  test('declares the DSH sessions capability used by automatic session tracking', () => {
    expect(plugin.inject).toEqual(expect.arrayContaining(['sessions']));
  });

  test('registers prompt context and memory tool when DSH capabilities exist', async () => {
    const context = createIntegrationContext();

    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;

    expect(context.systemPrompt.context).toHaveBeenCalledWith(expect.objectContaining({
      name: 'dsh-memory:context',
      order: 120,
      text: expect.any(Function)
    }));
    expect(context.tools.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory' }));

    await disposeContext(context);
  });

  test('registered memory tool executes remember, search, and forget through the memory API', async () => {
    const context = createIntegrationContext();
    plugin.apply(context, { storagePath: testFile, allowClearMemory: true });
    await context.services.memory.ready;

    const tool = context.tools.register.mock.calls[0][0];
    const exec = { deferContext: jest.fn() };

    try {
      await expect(tool.execute({
        action: 'remember',
        category: 'preference',
        key: 'defaultModel',
        value: 'qwen3.7-plus'
      }, exec)).resolves.toMatchObject({ ok: true, category: 'preference' });
      await expect(tool.execute({
        action: 'remember',
        category: 'topic',
        value: 'prompt wiring'
      }, exec)).resolves.toMatchObject({ ok: true, category: 'topic' });
      await expect(tool.execute({
        action: 'remember',
        category: 'task',
        value: 'verify DSH integration'
      }, exec)).resolves.toMatchObject({ ok: true, category: 'task' });
      await expect(tool.execute({
        action: 'remember',
        category: 'project',
        path: path.join(testDir, 'project'),
        name: 'memory-plugin'
      }, exec)).resolves.toMatchObject({ ok: true, category: 'project' });

      const exported = context.services.memory.exportData();
      expect(exported.userPreferences.defaultModel).toBe('qwen3.7-plus');
      expect(exported.sessionHistory.recentTopics[0].content).toBe('prompt wiring');
      expect(exported.sessionHistory.frequentTasks[0].content).toBe('verify DSH integration');
      expect(exported.projectContext.activeProjects[0].name).toBe('memory-plugin');
      expect(tool.storage).toBeUndefined();

      await expect(tool.execute({ action: 'search', query: 'prompt wiring' }, exec))
        .resolves.toMatchObject({ ok: true, action: 'search' });
      await expect(tool.execute({ action: 'forget' }, exec))
        .resolves.toMatchObject({ ok: true, action: 'forget' });
      expect(context.services.memory.exportData().sessionHistory.recentTopics).toEqual([]);
    } finally {
      await disposeContext(context);
    }
  });

  test('prompt text reads current memory and omits raw secret fields', async () => {
    const context = createIntegrationContext();
    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;

    const promptDefinition = context.systemPrompt.context.mock.calls[0][0];
    await context.services.memory.setPreference('defaultModel', 'latest-model');
    await context.services.memory.setPreference('apiKey', 'sk-live-prompt-secret');

    const text = promptDefinition.text();

    expect(text).toContain('latest-model');
    expect(text).not.toContain('sk-live-prompt-secret');
    expect(text).not.toContain('userPreferences');

    await disposeContext(context);
  });

  test('prompt export failures return an empty prompt segment', async () => {
    const context = createIntegrationContext();
    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;

    const promptDefinition = context.systemPrompt.context.mock.calls[0][0];
    const originalExportData = MemoryManager.prototype.exportData;
    MemoryManager.prototype.exportData = () => {
      throw new Error('simulated export failure');
    };

    try {
      expect(promptDefinition.text()).toBe('');
    } finally {
      MemoryManager.prototype.exportData = originalExportData;
      await disposeContext(context);
    }
  });

  test('unloading the plugin disposes prompt and tool registrations', async () => {
    const context = createIntegrationContext();
    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;

    await disposeContext(context);

    expect(context.registrationDisposers.promptDispose).toHaveBeenCalledTimes(1);
    expect(context.registrationDisposers.toolDispose).toHaveBeenCalledTimes(1);
  });

  test('keeps legacy contexts working without prompt and tool capabilities', async () => {
    const context = createIntegrationContext({ prompt: false, tools: false, sessions: false });

    expect(() => plugin.apply(context, { storagePath: testFile })).not.toThrow();
    await context.services.memory.ready;

    expect(context.services.memory).toBeDefined();
    expect(context.listeners).toEqual([]);

    await disposeContext(context);
  });

  test('registers dsh-memory settings with exactly six live boolean fields', async () => {
    const context = createIntegrationContext({ settings: true });

    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;

    expect(context.registrationDisposers.settingsRegister).toHaveBeenCalledWith(
      'dsh-memory',
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          trackToolCalls: { type: 'boolean' },
          trackPreferences: { type: 'boolean' },
          trackProjectContext: { type: 'boolean' },
          trackSessionHistory: { type: 'boolean' },
          enableRecommendations: { type: 'boolean' },
          allowClearMemory: { type: 'boolean' }
        })
      }),
      expect.objectContaining({
        applies: 'live',
        expose: 'web',
        base: expect.objectContaining({
          trackToolCalls: false,
          trackPreferences: false,
          trackProjectContext: false,
          trackSessionHistory: false,
          enableRecommendations: true,
          allowClearMemory: true
        }),
        validate: expect.any(Function)
      })
    );

    const [, schema] = context.registrationDisposers.settingsRegister.mock.calls[0];
    expect(Object.keys(schema.properties).sort()).toEqual([
      'allowClearMemory',
      'enableRecommendations',
      'trackPreferences',
      'trackProjectContext',
      'trackSessionHistory',
      'trackToolCalls'
    ]);

    await disposeContext(context);
  });

  test('live settings update runtime flags and autosave without rebuilding storage', async () => {
    const context = createIntegrationContext({ settings: true });
    const startAutoSave = jest.spyOn(MemoryManager.prototype, 'startAutoSave');
    const stopAutoSave = jest.spyOn(MemoryManager.prototype, 'stopAutoSave');

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const options = context.registrationDisposers.settingsRegister.mock.calls[0][2];
      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      const originalStorage = context.services.memory.storage;

      expect(options.validate({ trackToolCalls: true })).toEqual(expect.objectContaining({
        trackToolCalls: true
      }));
      watch({
        trackToolCalls: true,
        enableRecommendations: false,
        allowClearMemory: false
      });

      expect(startAutoSave).toHaveBeenCalled();
      expect(context.services.memory.storage).toBe(originalStorage);
      expect(context.services.memory.getRecommendations()).toEqual({ available: false });
      await expect(context.services.memory.clearMemory()).rejects.toThrow('disabled');

      watch({ trackToolCalls: false, enableRecommendations: true, allowClearMemory: true });
      expect(stopAutoSave).toHaveBeenCalled();
      expect(context.services.memory.getRecommendations()).toEqual(expect.objectContaining({ available: true }));
      expect(context.services.memory.getRecommendationMetrics()).toEqual(expect.objectContaining({
        requests: expect.any(Number),
        patternRecognitionThreshold: expect.any(Number)
      }));
    } finally {
      startAutoSave.mockRestore();
      stopAutoSave.mockRestore();
      await disposeContext(context);
    }
  });

  test('live enabling tool tracking starts collecting subsequent tool results', async () => {
    const context = createIntegrationContext({ settings: true });

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      const toolListener = context.listeners.find(listener => listener.event === 'tools/result');
      expect(toolListener).toBeDefined();

      await toolListener.handler(
        { name: 'read', arguments: { command: 'before-enable' } },
        { ok: true }
      );
      expect(context.services.memory.exportData().sessionHistory.toolUsageStats).toEqual({});

      await watch({ trackToolCalls: true, trackPreferences: true });
      await toolListener.handler(
        { name: 'read', arguments: { command: 'after-enable' } },
        { ok: true }
      );

      const exported = context.services.memory.exportData();
      expect(exported.sessionHistory.toolUsageStats).toEqual({ read: 1 });
      expect(exported.inputHabits.preferredTools).toContain('read');
    } finally {
      await disposeContext(context);
    }
  });

  test('loads persisted settings before the first automatic collection', async () => {
    const context = createIntegrationContext({ settings: true });
    context.registrationDisposers.settingsScope.get.mockReturnValue({
      trackToolCalls: true,
      trackPreferences: true,
      trackProjectContext: true,
      trackSessionHistory: true,
      enableRecommendations: true,
      allowClearMemory: true
    });

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const toolListener = context.listeners.find(listener => listener.event === 'tools/result');
      await toolListener.handler(
        { name: 'read', arguments: { command: 'after-restart' } },
        { ok: true }
      );

      const exported = context.services.memory.exportData();
      expect(exported.projectContext.activeProjects).toEqual([
        expect.objectContaining({ tags: ['current-workspace'] })
      ]);
      expect(exported.sessionHistory.toolUsageStats).toEqual({ read: 1 });
      expect(exported.inputHabits.preferredTools).toContain('read');
    } finally {
      await disposeContext(context);
    }
  });

  test('live enabling project tracking records the current workspace', async () => {
    const context = createIntegrationContext({ settings: true });

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;
      expect(context.services.memory.exportData().projectContext.activeProjects).toEqual([]);

      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      await watch({ trackProjectContext: true });

      expect(context.services.memory.exportData().projectContext.activeProjects).toEqual([
        expect.objectContaining({ tags: ['current-workspace'] })
      ]);
    } finally {
      await disposeContext(context);
    }
  });

  test('live enabling session history records subsequent user messages', async () => {
    const context = createIntegrationContext({ settings: true });

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      const sessionListener = context.listeners.find(listener => listener.event === 'session/event');
      expect(sessionListener).toBeDefined();

      await watch({ trackSessionHistory: true });
      await sessionListener.handler({}, {
        type: 'user/message',
        data: {
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'verify memory collection' }]
        }
      });

      expect(context.services.memory.exportData().sessionHistory.recentTopics).toEqual([
        expect.objectContaining({ content: 'verify memory collection' })
      ]);
    } finally {
      await disposeContext(context);
    }
  });

  test('contains session history write failures inside the event listener', async () => {
    const context = createIntegrationContext({ settings: true });
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      await watch({ trackSessionHistory: true });
      const sessionListener = context.listeners.find(listener => listener.event === 'session/event');

      await expect(sessionListener.handler({}, {
        type: 'user/message',
        data: {
          source: { kind: 'user' },
          content: [{ type: 'text', text: 'x'.repeat(10001) }]
        }
      })).resolves.toBeUndefined();
    } finally {
      errorSpy.mockRestore();
      await disposeContext(context);
    }
  });

  test('invalid live settings are rejected without changing runtime state', async () => {
    const context = createIntegrationContext({ settings: true });
    const startAutoSave = jest.spyOn(MemoryManager.prototype, 'startAutoSave');

    try {
      plugin.apply(context, { storagePath: testFile });
      await context.services.memory.ready;

      const options = context.registrationDisposers.settingsRegister.mock.calls[0][2];
      expect(() => options.validate({ trackToolCalls: 'yes' })).toThrow('trackToolCalls');

      const watch = context.registrationDisposers.settingsScope.watch.mock.calls[0][0];
      expect(() => watch({ trackToolCalls: 'yes' })).not.toThrow();
      expect(startAutoSave).not.toHaveBeenCalled();
      expect(context.services.memory.getRecommendations()).toEqual(expect.objectContaining({ available: true }));
    } finally {
      startAutoSave.mockRestore();
      await disposeContext(context);
    }
  });

  test('settings watcher is disposed with the plugin and legacy settings are optional', async () => {
    const context = createIntegrationContext({ settings: true });

    plugin.apply(context, { storagePath: testFile });
    await context.services.memory.ready;
    await disposeContext(context);

    expect(context.registrationDisposers.settingsWatchDispose).toHaveBeenCalledTimes(1);

    const legacyContext = createIntegrationContext({ settings: false });
    expect(() => plugin.apply(legacyContext, { storagePath: testFile })).not.toThrow();
    await legacyContext.services.memory.ready;
    expect(legacyContext.services.memory).toBeDefined();
    await disposeContext(legacyContext);
  });

  test('optional schemastery failure safely skips schema loading', () => {
    expect(loadOptionalSchema(() => {
      throw new Error('schemastery is not installed');
    })).toBeUndefined();
  });

  test('declares schemastery as a runtime dependency for linked profile installs', () => {
    const packageJson = require('../package.json');
    expect(packageJson.dependencies?.['@deepseek-ai/schemastery']).toBeTruthy();
  });
});
