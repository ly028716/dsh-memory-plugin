const { buildMemoryContext } = require('../memory-context');

describe('buildMemoryContext', () => {
  test('includes explicit preferences and recent topics', () => {
    const result = buildMemoryContext({
      userPreferences: { defaultModel: 'qwen3.7-plus' },
      sessionHistory: {
        recentTopics: [{ content: 'memory plugin development' }]
      }
    });

    expect(result).toContain('Memory context');
    expect(result).toContain('qwen3.7-plus');
    expect(result).toContain('memory plugin development');
  });

  test('returns an empty string when no supported memory entries are available', () => {
    expect(buildMemoryContext({})).toBe('');
    expect(buildMemoryContext(null)).toBe('');
  });

  test('ignores empty memory entries', () => {
    expect(buildMemoryContext({ sessionHistory: { recentTopics: [{}] } })).toBe('');
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
});
