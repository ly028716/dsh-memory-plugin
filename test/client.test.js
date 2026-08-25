const fs = require('fs');
const path = require('path');
const vm = require('vm');

const packageJson = require('../package.json');

function loadClient() {
  return require('../client');
}

function mockReact() {
  jest.doMock('react', () => ({
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children
    })
  }), { virtual: true });
}

function createContext(overrides = {}) {
  const binding = {
    values: {
      trackToolCalls: false,
      trackPreferences: true,
      trackProjectContext: false,
      trackSessionHistory: true,
      enableRecommendations: true,
      allowClearMemory: false
    },
    update: jest.fn(),
    subscribe: jest.fn(() => jest.fn())
  };
  const settingsScope = {
    bind: jest.fn(() => binding)
  };
  const localeDispose = jest.fn();
  const locale = { register: jest.fn(() => localeDispose) };
  const slots = {
    inject: jest.fn((_name, register) => register()),
    register: jest.fn(() => jest.fn())
  };
  const effects = [];
  return {
    get: jest.fn((name) => ({ slots, settingsScope, locale }[name])),
    slots,
    settingsScope,
    locale,
    localeDispose,
    binding,
    effects,
    effect: jest.fn((factory) => {
      const dispose = factory();
      effects.push(dispose);
      return dispose;
    }),
    ...overrides
  };
}

afterEach(() => {
  jest.resetModules();
});

test('publishes optional DSH client metadata and package export', () => {
  expect(packageJson.exports['./client']).toBe('./client.js');
  expect(packageJson.exports['.']).toBe('./index.js');
  expect(packageJson.dsh.client.platform).toBe('web');
  expect(packageJson.dsh.client.inject).toEqual(expect.arrayContaining([
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-settings-plugins'
  ]));
  expect(packageJson.files).toEqual(expect.arrayContaining(['client.js']));
  expect(packageJson.main).toBe('index.js');
  expect(packageJson.peerDependencies.react).toBe('>=18 <20');
  expect(packageJson.peerDependenciesMeta.react).toEqual({ optional: true });
});

test('client module can be required without optional Web runtime packages', () => {
  jest.isolateModules(() => {
    const client = loadClient();
    expect(typeof client.apply).toBe('function');
    expect(typeof client.MEMORY_NAMESPACE).toBe('string');
  });
});

test('browser script hands a lazy CJS factory to DSH ModuleLoader', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
  let handoff;
  let requireCalls = 0;
  const browserWindow = {
    __ModuleLoader__: {
      load(payload) {
        handoff = payload;
      }
    }
  };

  vm.runInNewContext(source, {
    window: browserWindow,
    require() {
      requireCalls += 1;
      throw new Error('browser script must not require before factory execution');
    },
    console
  });

  expect(requireCalls).toBe(0);
  expect(handoff).toEqual(expect.objectContaining({
    id: '@ly028716/dsh-memory-plugin',
    factory: expect.any(Function)
  }));

  const fakeRequire = jest.fn((id) => {
    if (id === 'react') {
      return {
        createElement: (type, props, ...children) => ({ type, props: props || {}, children })
      };
    }
    throw new Error(`unexpected browser dependency: ${id}`);
  });
  const client = handoff.factory(fakeRequire);
  expect(client.inject).toEqual(['slots', 'locale', 'connection', 'remote', 'settingsScope']);
  expect(typeof client.apply).toBe('function');

  const binding = {
    values: {
      trackToolCalls: false,
      trackPreferences: true,
      trackProjectContext: false,
      trackSessionHistory: true,
      enableRecommendations: true,
      allowClearMemory: false
    },
    update: jest.fn()
  };
  const slots = {
    inject: jest.fn((_name, callback) => callback()),
    register: jest.fn(() => jest.fn())
  };
  const ctx = {
    get: jest.fn((name) => ({
      slots,
      settingsScope: { bind: jest.fn(() => binding) }
    }[name])),
    effect: jest.fn((factory) => factory())
  };

  client.apply(ctx);
  expect(slots.inject).toHaveBeenCalledWith('settings.plugin.item', expect.any(Function));
  expect(slots.register).toHaveBeenCalledWith(expect.objectContaining({
    key: 'dsh-memory',
    locale: 'dsh-memory',
    inject: expect.any(Function)
  }), expect.any(Function));
});

test('apply safely returns when slots capability is missing', () => {
  const { apply } = loadClient();
  const ctx = createContext({ get: jest.fn(() => undefined) });

  expect(() => apply(ctx)).not.toThrow();
  expect(ctx.effect).not.toHaveBeenCalled();
});

test('apply safely returns when settingsScope capability is missing', () => {
  const { apply } = loadClient();
  const ctx = createContext({
    get: jest.fn((name) => name === 'slots' ? ctx.slots : undefined)
  });

  expect(() => apply(ctx)).not.toThrow();
  expect(ctx.slots.register).not.toHaveBeenCalled();
  expect(ctx.effect).not.toHaveBeenCalled();
});

test('waits for the standard settings slot before registering the keyed Memory card', () => {
  mockReact();
  const { apply, MEMORY_NAMESPACE, SETTINGS_FIELDS } = loadClient();
  const ctx = createContext();

  apply(ctx);

  expect(ctx.settingsScope.bind).toHaveBeenCalledWith({ namespace: MEMORY_NAMESPACE });
  expect(ctx.settingsScope.bind).toHaveBeenCalledWith({ namespace: 'dsh-memory' });
  expect(ctx.slots.inject).toHaveBeenCalledWith('settings.plugin.item', expect.any(Function));
  expect(ctx.slots.register).toHaveBeenCalledWith(expect.objectContaining({
    name: 'settings.plugin.item',
    key: 'dsh-memory',
    inject: expect.any(Function)
  }), expect.anything());
  expect(SETTINGS_FIELDS).toEqual([
    'trackToolCalls',
    'trackPreferences',
    'trackProjectContext',
    'trackSessionHistory',
    'enableRecommendations',
    'allowClearMemory'
  ]);

  const [definition, card] = ctx.slots.register.mock.calls[0];
  expect(definition.locale).toBeTruthy();
  expect(typeof definition.inject).toBe('function');
  expect(card).toBeTruthy();
  expect(ctx.effect).toHaveBeenCalledTimes(1);
});

test('card uses live SettingsScope snapshot, registers locale, and respects read-only mode', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  ctx.binding.getSnapshot = jest.fn(() => ({
    status: 'ready',
    value: { ...ctx.binding.values, trackToolCalls: true },
    writable: false,
    mode: 'host'
  }));

  apply(ctx);

  expect(ctx.locale.register).toHaveBeenCalledWith('dsh-memory', expect.objectContaining({
    zh: expect.any(Object),
    en: expect.any(Object)
  }));
  const [definition, Card] = ctx.slots.register.mock.calls[0];
  expect(definition.inject().fields.trackToolCalls.value).toBe(true);

  const collect = (node, result = []) => {
    if (Array.isArray(node)) {
      for (const child of node) collect(child, result);
      return result;
    }
    if (!node || typeof node !== 'object') return result;
    if (node.type === 'input' && node.props.type === 'checkbox') result.push(node);
    for (const child of node.children || []) collect(child, result);
    return result;
  };
  const element = Card(definition.inject());
  expect(collect(element)).toHaveLength(6);
  expect(collect(element).every((input) => input.props.disabled)).toBe(true);

  ctx.effects[0]();
  expect(ctx.localeDispose).toHaveBeenCalledTimes(1);
});

test('apply skips the card safely when React is unavailable', () => {
  jest.resetModules();
  jest.doMock('react', () => {
    throw new Error('React is unavailable');
  }, { virtual: true });

  jest.isolateModules(() => {
    const { apply } = require('../client');
    const ctx = createContext();

    expect(() => apply(ctx)).not.toThrow();
    expect(ctx.slots.inject).not.toHaveBeenCalled();
  });
  jest.dontMock('react');
});

test('MemorySettingsCard renders a DSH-style card with six staged checkbox controls', async () => {
  jest.resetModules();
  jest.doMock('react', () => ({
    createElement: (type, props, ...children) => ({
      type,
      props: props || {},
      children
    })
  }), { virtual: true });

  const collect = (node, result = []) => {
    if (Array.isArray(node)) {
      for (const child of node) collect(child, result);
      return result;
    }
    if (!node || typeof node !== 'object') return result;
    if (node.type === 'input' && node.props.type === 'checkbox') result.push(node);
    for (const child of node.children || []) collect(child, result);
    return result;
  };

  jest.isolateModules(() => {
    const { apply } = require('../client');
    const ctx = createContext();
    apply(ctx);

    const [definition, Card] = ctx.slots.register.mock.calls[0];
    const element = Card(definition.inject());
    const checkboxes = collect(element);

    expect(element.type).toBe('li');
    expect(element.props['data-dsh-memory']).toBe('dsh-memory');
    expect(checkboxes).toHaveLength(6);
    expect(checkboxes.every((input) => typeof input.props.checked === 'boolean')).toBe(true);
    expect(checkboxes.every((input) => typeof input.props.onChange === 'function')).toBe(true);
    expect(JSON.stringify(element)).toContain('采集控制');
    expect(JSON.stringify(element)).toContain('数据安全');

    checkboxes[0].props.onChange({ target: { checked: true } });
    expect(ctx.binding.update).not.toHaveBeenCalled();
    const buttons = [];
    const collectButtons = (node) => {
      if (Array.isArray(node)) {
        for (const child of node) collectButtons(child);
        return;
      }
      if (!node || typeof node !== 'object') return;
      if (node.type === 'button') buttons.push(node);
      for (const child of node.children || []) collectButtons(child);
    };
    collectButtons(element);
    const saveButton = buttons.find((button) => button.children.includes('保存'));
    expect(saveButton).toBeTruthy();
    saveButton.props.onClick();
    expect(ctx.binding.update).toHaveBeenCalledWith(expect.objectContaining({ trackToolCalls: true }));
  });
  jest.dontMock('react');
});

test('card injection exposes only boolean settings and binding status', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  apply(ctx);

  const [definition] = ctx.slots.register.mock.calls[0];
  const injected = definition.inject();

  expect(Object.keys(injected.fields).sort()).toEqual([
    'allowClearMemory',
    'enableRecommendations',
    'trackPreferences',
    'trackProjectContext',
    'trackSessionHistory',
    'trackToolCalls'
  ]);
  expect(Object.values(injected.fields).every((field) => field.type === 'boolean')).toBe(true);
  expect(injected.status).toEqual(expect.objectContaining({
    writable: expect.any(Boolean),
    dirty: expect.any(Boolean),
    failed: expect.any(Boolean)
  }));
  expect(Object.keys(injected).join(' ')).not.toMatch(/clear|export/i);
});

test('card injection exposes automatic collection status', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  apply(ctx);

  const [definition] = ctx.slots.register.mock.calls[0];
  const injected = definition.inject();

  expect(injected.collection).toEqual(expect.objectContaining({
    automaticCollectionEnabled: true,
    enabledCount: 2
  }));
  expect(injected.collection.fields.trackPreferences).toEqual(expect.objectContaining({
    enabled: true,
    label: expect.stringContaining('开启')
  }));
  expect(injected.collection.fields.trackToolCalls).toEqual(expect.objectContaining({
    enabled: false,
    label: expect.stringContaining('暂停')
  }));
});

test('card renders collection status and optional recommendation metrics', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  ctx.binding.getStatus = jest.fn(() => ({
    recommendations: {
      requests: 8,
      availableRequests: 7,
      contextualRequests: 6,
      contextMatches: 4,
      fallbackRequests: 2,
      suggestions: 12,
      contextMatchRate: 2 / 3,
      fallbackRate: 1 / 3
    }
  }));
  apply(ctx);

  const [definition, Card] = ctx.slots.register.mock.calls[0];
  const element = Card(definition.inject());
  const collectionStatus = [];
  const recommendationMetrics = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.props?.['data-dsh-memory'] === 'collection-status') collectionStatus.push(node);
    if (node.props?.['data-dsh-memory'] === 'recommendation-metrics') recommendationMetrics.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(element);

  expect(collectionStatus).toHaveLength(1);
  expect(JSON.stringify(collectionStatus[0])).toContain('自动采集：已开启');
  expect(recommendationMetrics).toHaveLength(1);
  const metricsText = JSON.stringify(recommendationMetrics[0]);
  expect(metricsText).toContain('"data-dsh-memory-metric":"requests"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"availableRequests"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"contextualRequests"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"contextMatches"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"fallbackRequests"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"suggestions"');
  expect(metricsText).toContain('67%');
  expect(metricsText).toContain('33%');
});

test('card renders a safe empty state for missing recommendation metrics', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  ctx.binding.getStatus = jest.fn(() => ({
    recommendations: { requests: 1, contextMatchRate: null, fallbackRate: null }
  }));
  apply(ctx);

  const [definition, Card] = ctx.slots.register.mock.calls[0];
  let element;
  expect(() => {
    element = Card(definition.inject());
  }).not.toThrow();

  const recommendationMetrics = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.props?.['data-dsh-memory'] === 'recommendation-metrics') recommendationMetrics.push(node);
    for (const child of node.children || []) visit(child);
  };
  visit(element);

  expect(recommendationMetrics).toHaveLength(1);
  const metricsText = JSON.stringify(recommendationMetrics[0]);
  expect(metricsText).toContain('"data-dsh-memory-metric":"contextMatchRate"');
  expect(metricsText).toContain('"data-dsh-memory-metric":"fallbackRate"');
  expect(metricsText).toContain('暂无数据');
});

test('registered disposer is safe to invoke', () => {
  mockReact();
  const { apply } = loadClient();
  const slotDispose = jest.fn();
  const ctx = createContext();
  ctx.slots.register.mockReturnValue(slotDispose);

  apply(ctx);
  expect(() => ctx.effects[0]()).not.toThrow();
  expect(slotDispose).toHaveBeenCalledTimes(1);
});

test('package verification installs with peers omitted', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'test-package.js'), 'utf8');
  expect(source).toMatch(/runNpm\(\['install',[^\]]*'--omit=peer'/);
  expect(source).toMatch(/runNpm\(\['install',[^\]]*'--offline'/);
  expect(source).toMatch(/__ModuleLoader__\.load/);
  expect(source).toContain('@ly028716/dsh-memory-plugin');
});
