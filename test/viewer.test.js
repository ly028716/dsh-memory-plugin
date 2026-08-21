const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadViewerScript(document) {
  const source = fs.readFileSync(path.join(__dirname, '..', 'viewer.html'), 'utf8');
  const script = source.match(/<script>([\s\S]*?)<\/script>/)[1];
  const sandbox = {
    window: {},
    document,
    localStorage: {},
    fetch: async () => ({ ok: false }),
    console
  };

  vm.runInNewContext(script, sandbox);
  return sandbox;
}

describe('viewer HTML rendering', () => {
  test('escapes memory values before inserting them into innerHTML', () => {
    const rendered = { innerHTML: '' };
    const document = {
      getElementById: () => rendered
    };
    const viewer = loadViewerScript(document);
    const payload = '<img src=x onerror=alert(1)>';

    viewer.displayData({
      version: payload,
      metadata: { totalSessions: 1 },
      userPreferences: { customValue: payload },
      inputHabits: { commonCommands: [] },
      projectContext: {
        activeProjects: [{ name: payload, path: payload, tags: [payload], lastAccessed: new Date().toISOString() }]
      },
      sessionHistory: {
        recentTopics: [{ content: payload, timestamp: new Date().toISOString() }],
        toolUsageStats: { [payload]: 1 }
      }
    });

    expect(rendered.innerHTML).not.toContain(payload);
    expect(rendered.innerHTML).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('clears viewer cache without pretending to delete the source file', () => {
    const elements = {
      dataContent: { textContent: 'cached data' },
      content: { style: { display: 'block' } },
      loading: { style: { display: 'none' } },
      error: { style: { display: 'none' } },
      errorMessage: { textContent: '' }
    };
    const localStorage = {
      values: { 'memory-plugin-data': 'cached data' },
      removeItem(key) {
        delete this.values[key];
      }
    };
    const alerts = [];
    const document = {
      getElementById: (id) => elements[id]
    };
    const viewer = loadViewerScript(document);
    viewer.localStorage = localStorage;
    viewer.confirm = () => true;
    viewer.alert = (message) => alerts.push(message);
    viewer.location = { reload: () => { throw new Error('reload should not be called'); } };

    viewer.clearViewerCache();

    expect(localStorage.values['memory-plugin-data']).toBeUndefined();
    expect(elements.dataContent.textContent).toBe('');
    expect(elements.content.style.display).toBe('none');
    expect(alerts[0]).toContain('原始记忆文件未修改');
  });
});
