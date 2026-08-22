const { buildMemoryContext } = require('../memory-context');

describe('buildMemoryContext', () => {
  test('includes explicit preferences and recent topics', () => {
    const result = buildMemoryContext({
      userPreferences: { defaultModel: 'qwen3.7-plus' },
      sessionHistory: {
        recentTopics: [{ content: 'memory plugin development' }]
      }
    });

    expect(result).toContain('Memory context (user-controlled local memory):');
    expect(result).toContain('defaultModel: qwen3.7-plus');
    expect(result).toContain('memory plugin development');
  });

  test('ignores unsafe default model values', () => {
    expect(buildMemoryContext({ userPreferences: { defaultModel: {} } })).toBe('');
    expect(buildMemoryContext({ userPreferences: { defaultModel: 1n } })).toBe('');
  });

  test('renders string, number, and boolean default model values', () => {
    expect(buildMemoryContext({ userPreferences: { defaultModel: 'safe-model' } }))
      .toContain('defaultModel: safe-model');
    expect(buildMemoryContext({ userPreferences: { defaultModel: 42 } }))
      .toContain('defaultModel: 42');
    expect(buildMemoryContext({ userPreferences: { defaultModel: true } }))
      .toContain('defaultModel: true');
  });

  test('returns an empty string when no supported memory entries are available', () => {
    expect(buildMemoryContext({})).toBe('');
    expect(buildMemoryContext(null)).toBe('');
  });

  test('ignores empty memory entries', () => {
    expect(buildMemoryContext({ sessionHistory: { recentTopics: [{}] } })).toBe('');
  });

  test('does not render fields outside the supported object entry whitelist', () => {
    const result = buildMemoryContext({
      sessionHistory: {
        recentTopics: [{ content: 'safe', unknown: 'LEAK_ME' }]
      }
    });

    expect(result).toContain('safe');
    expect(result).not.toContain('LEAK_ME');
    expect(buildMemoryContext({
      sessionHistory: { recentTopics: [{ unknown: 'LEAK_ME' }] }
    })).toBe('');
    expect(buildMemoryContext({ sessionHistory: { recentTopics: [{}] } })).toBe('');
  });

  test('limits each memory field to the first ten entries', () => {
    const result = buildMemoryContext({
      sessionHistory: {
        recentTopics: Array.from({ length: 20 }, (_, index) => ({ content: `topic-${index}` }))
      }
    });

    expect(result).toContain('topic-0');
    expect(result).toContain('topic-9');
    expect(result).not.toContain('topic-10');
  });

  test('ignores scalar values in structured memory arrays', () => {
    expect(buildMemoryContext({
      sessionHistory: { recentTopics: ['raw scalar'] }
    })).toBe('');
  });

  test('keeps scalar preferred tools in the memory context', () => {
    const result = buildMemoryContext({
      inputHabits: { preferredTools: ['read', 'write'] }
    });

    expect(result).toContain('Preferred tools:');
    expect(result).toContain('read');
    expect(result).toContain('write');
  });

  test('ignores non-array shapes for memory collections', () => {
    expect(buildMemoryContext({
      projectContext: { activeProjects: 'RAW' }
    })).toBe('');
    expect(buildMemoryContext({
      sessionHistory: { recentTopics: 'RAW' }
    })).toBe('');
    expect(buildMemoryContext({
      sessionHistory: { frequentTasks: 'RAW' }
    })).toBe('');
    expect(buildMemoryContext({
      inputHabits: { preferredTools: 'RAW' }
    })).toBe('');
  });

  test('continues to allow a safe scalar default model', () => {
    expect(buildMemoryContext({
      userPreferences: { defaultModel: 'safe-model' }
    })).toContain('defaultModel: safe-model');
  });

  test('does not read inherited memory fields through a polluted prototype', () => {
    const input = {};
    Object.defineProperty(input, '__proto__', {
      value: { userPreferences: { defaultModel: 'proto-value' } },
      enumerable: true
    });

    expect(buildMemoryContext(input)).toBe('');
    expect(buildMemoryContext(input)).not.toContain('proto-value');
  });

  test('renders active project name and path fields', () => {
    const result = buildMemoryContext({
      projectContext: { activeProjects: [{ name: 'app', path: '/repo' }] }
    });

    expect(result).toContain('app');
    expect(result).toContain('/repo');
  });

  test('renders frequent task content', () => {
    const result = buildMemoryContext({
      sessionHistory: { frequentTasks: [{ content: 'run tests' }] }
    });

    expect(result).toContain('run tests');
  });

  test('redacts sensitive fields and values before rendering', () => {
    const result = buildMemoryContext({
      userPreferences: {
        defaultModel: 'safe-model',
        apiKey: 'DO_NOT_LEAK'
      },
      sessionHistory: {
        recentTopics: [{ content: 'deploy --token=DO_NOT_LEAK' }]
      }
    });

    expect(result).toContain('safe-model');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('DO_NOT_LEAK');
  });

  test('keeps the rendered context within the configured character limit', () => {
    const result = buildMemoryContext({
      sessionHistory: {
        recentTopics: Array.from({ length: 20 }, (_, index) => ({
          content: `topic-${index}-${'x'.repeat(100)}`
        }))
      }
    }, { maxCharacters: 180 });

    expect(result.length).toBeLessThanOrEqual(180);
    expect(result).toContain('Memory context');
  });

  test('caps requests above the default context limit', () => {
    const memory = {
      sessionHistory: {
        recentTopics: Array.from({ length: 20 }, (_, index) => ({
          content: `topic-${index}-${'x'.repeat(400)}`
        }))
      }
    };

    expect(buildMemoryContext(memory, { maxCharacters: 5001 }).length).toBeLessThanOrEqual(4000);
    expect(buildMemoryContext(memory, { maxCharacters: 180 }).length).toBeLessThanOrEqual(180);
  });

  test('ignores nested objects in supported entry fields', () => {
    const result = buildMemoryContext({
      sessionHistory: {
        recentTopics: [{ name: { unknown: 'LEAK_ME' } }]
      }
    });

    expect(result).toBe('');
    expect(result).not.toContain('LEAK_ME');
  });

  test('handles null options and rejects unsafe character limits', () => {
    expect(() => buildMemoryContext({}, null)).not.toThrow();
    expect(buildMemoryContext({}, null)).toBe('');

    const result = buildMemoryContext({
      sessionHistory: {
        recentTopics: Array.from({ length: 20 }, (_, index) => ({
          content: `topic-${index}-${'x'.repeat(500)}`
        }))
      }
    }, { maxCharacters: Number.MAX_SAFE_INTEGER + 1 });

    expect(result.length).toBeLessThanOrEqual(4000);
  });

  test('ignores non-scalar values in supported entry fields', () => {
    expect(() => buildMemoryContext({
      sessionHistory: {
        recentTopics: [
          { name: { unknown: 'LEAK_ME' } },
          { path: { unknown: 'LEAK_ME' } },
          { content: { unknown: 'LEAK_ME' } },
          { name: 1n }
        ]
      }
    })).not.toThrow();

    expect(buildMemoryContext({
      sessionHistory: { recentTopics: [{ content: 1n }] }
    })).toBe('');
  });

  test('tolerates throwing memory and options getters', () => {
    const hostileMemory = {};
    Object.defineProperty(hostileMemory, 'userPreferences', {
      enumerable: true,
      get() {
        throw new Error('boom');
      }
    });

    expect(() => buildMemoryContext(hostileMemory)).not.toThrow();
    expect(buildMemoryContext(hostileMemory)).toBe('');

    const validMemory = {
      sessionHistory: { recentTopics: [{ content: 'safe' }] }
    };
    const hostileOptions = {};
    Object.defineProperty(hostileOptions, 'maxCharacters', {
      get() {
        throw new Error('boom');
      }
    });

    expect(() => buildMemoryContext(validMemory, hostileOptions)).not.toThrow();
    expect(buildMemoryContext(validMemory, hostileOptions).length).toBeLessThanOrEqual(4000);
  });
});
