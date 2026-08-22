const { createMemoryTool } = require('../memory-tool');

function createMemory(overrides = {}) {
  return {
    exportData: jest.fn(() => ({
      userPreferences: { defaultModel: 'qwen', secret: 'DO_NOT_LEAK' },
      sessionHistory: { recentTopics: [{ content: 'safe topic', token: 'DO_NOT_LEAK' }] },
      unknownField: 'DO_NOT_LEAK'
    })),
    setPreference: jest.fn(async () => undefined),
    recordTopic: jest.fn(async () => undefined),
    recordTask: jest.fn(async () => undefined),
    addProject: jest.fn(async () => undefined),
    clearMemory: jest.fn(async () => undefined),
    ...overrides
  };
}

const exec = () => ({ deferContext: jest.fn() });

describe('memory agent tool', () => {
  test('exposes the DSH tool definition and required action schema', () => {
    const tool = createMemoryTool(createMemory());

    expect(tool).toEqual(expect.objectContaining({
      name: 'memory',
      description: expect.any(String),
      parameters: expect.objectContaining({ type: 'object' }),
      output: expect.objectContaining({
        schema: expect.objectContaining({ type: 'object' }),
        render: expect.any(Function)
      }),
      execute: expect.any(Function)
    }));
    expect(tool.parameters.required).toEqual(['action']);
    expect(tool.parameters.properties.action.enum).toEqual(['search', 'remember', 'forget']);
    expect(tool.parameters.properties.category.enum).toEqual(['preference', 'topic', 'task', 'project']);
    expect(tool.output.schema.properties.ok).toEqual({ type: 'boolean' });
  });

  test('search returns bounded safe data and defers user context', async () => {
    const memory = createMemory();
    const contextExec = exec();
    const result = await createMemoryTool(memory).execute({ action: 'search', query: 'topic' }, contextExec);

    expect(result.ok).toBe(true);
    expect(result).not.toHaveProperty('raw');
    expect(JSON.stringify(result)).not.toContain('DO_NOT_LEAK');
    expect(contextExec.deferContext).toHaveBeenCalledWith(expect.objectContaining({
      role: 'user',
      content: [{ type: 'text', text: expect.any(String) }],
      source: { kind: 'plugin', name: 'dsh-memory-plugin' }
    }));
  });

  test.each([
    ['preference', 'defaultModel: qwen', ['project-app', 'topic-one', 'task-one']],
    ['topic', 'topic-one', ['defaultModel: qwen', 'project-app', 'task-one']],
    ['task', 'task-one', ['defaultModel: qwen', 'project-app', 'topic-one']],
    ['project', 'project-app', ['defaultModel: qwen', 'topic-one', 'task-one']]
  ])('search category %s passes only the matching memory section to the context builder', async (category, included, excluded) => {
    const memory = createMemory({
      exportData: jest.fn(() => ({
        userPreferences: { defaultModel: 'qwen' },
        projectContext: { activeProjects: [{ name: 'project-app', path: '/repo' }] },
        sessionHistory: {
          recentTopics: [{ content: 'topic-one' }],
          frequentTasks: [{ content: 'task-one' }]
        }
      }))
    });

    const result = await createMemoryTool(memory).execute({ action: 'search', category }, exec());

    expect(result.ok).toBe(true);
    expect(result.text).toContain(included);
    for (const value of excluded) expect(result.text).not.toContain(value);
  });

  test('search rejects invalid query and category values', async () => {
    const tool = createMemoryTool(createMemory());

    await expect(tool.execute({ action: 'search', query: { secret: true } }, exec()))
      .resolves.toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    await expect(tool.execute({ action: 'search', category: 'storage' }, exec()))
      .resolves.toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
  });

  test.each([
    ['preference', { key: 'defaultModel', value: 'qwen' }, 'setPreference', ['defaultModel', 'qwen']],
    ['topic', { value: 'plugin development' }, 'recordTopic', ['plugin development']],
    ['task', { value: 'run tests' }, 'recordTask', ['run tests']],
    ['project', { path: '/repo', name: 'app', tags: ['js'], ignored: 'secret' }, 'addProject', [{ path: '/repo', name: 'app', tags: ['js'] }]]
  ])('remember dispatches safe %s data', async (category, fields, method, expectedArgs) => {
    const memory = createMemory();
    const result = await createMemoryTool(memory).execute({ action: 'remember', category, ...fields }, exec());

    expect(result.ok).toBe(true);
    expect(memory[method]).toHaveBeenCalledWith(...expectedArgs);
  });

  test('forget is denied when clearing is disabled and allowed otherwise', async () => {
    const deniedMemory = createMemory();
    const denied = await createMemoryTool(deniedMemory, { allowClearMemory: false }).execute({ action: 'forget' }, exec());
    expect(denied).toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_CLEAR_DISABLED' }));
    expect(deniedMemory.clearMemory).not.toHaveBeenCalled();

    const allowedMemory = createMemory();
    const allowed = await createMemoryTool(allowedMemory, { allowClearMemory: true }).execute({ action: 'forget' }, exec());
    expect(allowed.ok).toBe(true);
    expect(allowedMemory.clearMemory).toHaveBeenCalledTimes(1);
  });

  test('returns structured errors for unknown action and invalid category without throwing', async () => {
    const tool = createMemoryTool(createMemory());
    await expect(tool.execute({}, exec())).resolves.toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    await expect(tool.execute({ action: 'unknown' }, exec())).resolves.toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    await expect(tool.execute({ action: 'remember', category: 'storage', path: 'secret' }, exec())).resolves.toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
  });

  test('converts memory failures to safe errors', async () => {
    const memory = createMemory({ exportData: jest.fn(() => { throw new Error('SECRET_STACK_VALUE'); }) });
    const result = await createMemoryTool(memory).execute({ action: 'search' }, exec());

    expect(result).toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    expect(JSON.stringify(result)).not.toContain('SECRET_STACK_VALUE');
  });

  test('converts write and forget failures to structured errors', async () => {
    const writeMemory = createMemory({
      setPreference: jest.fn(async () => { throw new Error('WRITE_SECRET'); })
    });
    const writeResult = await createMemoryTool(writeMemory).execute({
      action: 'remember', category: 'preference', key: 'model', value: 'qwen'
    }, exec());
    expect(writeResult).toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    expect(JSON.stringify(writeResult)).not.toContain('WRITE_SECRET');

    const forgetMemory = createMemory({
      clearMemory: jest.fn(async () => { throw new Error('FORGET_SECRET'); })
    });
    const forgetResult = await createMemoryTool(forgetMemory, { allowClearMemory: true })
      .execute({ action: 'forget' }, exec());
    expect(forgetResult).toEqual(expect.objectContaining({ ok: false, code: 'MEMORY_TOOL_ERROR' }));
    expect(JSON.stringify(forgetResult)).not.toContain('FORGET_SECRET');
  });

  test('handles absent exportData safely and renders one text content block', async () => {
    const tool = createMemoryTool({});
    const result = await tool.execute({ action: 'search' }, exec());

    expect(result.ok).toBe(true);
    expect(tool.output.render({}, result)).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(() => tool.output.render({}, { ok: false, code: 'X', message: 'nope' })).not.toThrow();
  });

  test('output.render is total-safe for hostile and oversized values', () => {
    const tool = createMemoryTool(createMemory());
    const hostile = {};
    Object.defineProperty(hostile, 'secret', { enumerable: true, get() { throw new Error('HOSTILE'); } });
    const oversized = { text: 'x'.repeat(100000) };

    expect(() => tool.output.render({}, hostile)).not.toThrow();
    expect(() => tool.output.render({}, oversized)).not.toThrow();
    expect(tool.output.render({}, hostile)).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(tool.output.render({}, oversized)).toEqual([{ type: 'text', text: expect.any(String) }]);
  });
});
