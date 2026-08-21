const vm = require('vm');
const { createImportHtml } = require('../import-data');

describe('browser import HTML generation', () => {
  test('escapes script-sensitive characters before embedding memory data', () => {
    const payload = '</script><script>globalThis.injected = true</script>';
    const data = { version: '1.0.0', userPreferences: { note: payload } };
    const html = createImportHtml(data);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const stored = {};
    const sandbox = {
      localStorage: {
        setItem(key, value) {
          stored[key] = value;
        }
      },
      document: { body: { innerHTML: '' } },
      setTimeout: () => {},
      window: { location: {} }
    };

    expect(html.match(/<script>/g)).toHaveLength(1);
    expect(() => vm.runInNewContext(script, sandbox)).not.toThrow();
    expect(sandbox.injected).toBeUndefined();
    expect(stored['memory-plugin-data']).toBe(JSON.stringify(data));
  });
});
