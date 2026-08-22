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
      output: expect.objectContaining({ type: 'object', render: expect.any(Function) }),
      execute: expect.any(Function)
    }));
    expect(tool.parameters.required).toEqual(['action']);
    expect(tool.parameters.properties.action.enum).toEqual(['search', 'remember', 'forget']);
    expect(tool.parameters.properties.category.enum).toEqual(['preference', 'topic', 'task', 'project']);
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

  test('handles absent exportData safely and renders one text content block', async () => {
    const tool = createMemoryTool({});
    const result = await tool.execute({ action: 'search' }, exec());

    expect(result.ok).toBe(true);
    expect(tool.output.render({}, result)).toEqual([{ type: 'text', text: expect.any(String) }]);
    expect(() => tool.output.render({}, { ok: false, code: 'X', message: 'nope' })).not.toThrow();
  });
});
