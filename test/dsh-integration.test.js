const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const plugin = require('../index');

function createIntegrationContext({ prompt = true, tools = true } = {}) {
  const promptDispose = jest.fn();
  const toolDispose = jest.fn();
  const context = {
    effects: [],
    services: {},
    listeners: [],
    systemPrompt: prompt ? { context: jest.fn(() => promptDispose) } : undefined,
    tools: tools ? { register: jest.fn(() => toolDispose) } : undefined,

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

  context.registrationDisposers = { promptDispose, toolDispose };
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
    const storage = context.services.memory.storage;
    const originalDescriptor = Object.getOwnPropertyDescriptor(storage, 'memory');
    Object.defineProperty(storage, 'memory', {
      configurable: true,
      get() {
        throw new Error('simulated export failure');
      }
    });

    expect(promptDefinition.text()).toBe('');

    Object.defineProperty(storage, 'memory', originalDescriptor);
    await disposeContext(context);
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
    const context = createIntegrationContext({ prompt: false, tools: false });

    expect(() => plugin.apply(context, { storagePath: testFile })).not.toThrow();
    await context.services.memory.ready;

    expect(context.services.memory).toBeDefined();
    expect(context.listeners).toEqual([]);

    await disposeContext(context);
  });
});
