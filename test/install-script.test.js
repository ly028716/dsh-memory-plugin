const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

describe('Windows installer contract', () => {
  test('preserves an explicitly configured DSH_HOME', () => {
    const script = fs.readFileSync(path.join(projectRoot, 'install.bat'), 'utf8').replace(/\r\n/g, '\n');

    expect(script).not.toMatch(/set DSH_HOME=\n\s*if defined DSH_HOME/);
    expect(script).toContain('if defined DSH_HOME');
  });
});
