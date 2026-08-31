const fs = require('fs');
const os = require('os');
const path = require('path');

const { listPublishedJavaScriptFiles, checkPublishedSyntax } = require('../check-syntax');

describe('published source syntax checks', () => {
  test('lists every JavaScript entry included in the package', () => {
    const rootDir = path.join(__dirname, '..');

    expect(listPublishedJavaScriptFiles(rootDir)).toEqual(expect.arrayContaining([
      'config.js',
      'profile-doctor.js',
      path.join('bin', 'dsh-memory-plugin.js'),
      'index.js',
      'client.js',
      'memory-context.js',
      'memory-tool.js',
      'memory-settings.js',
      'limits.js',
      'memory-manager.js',
      'privacy.js',
      'storage.js',
      'migrations.js',
      'data-lifecycle.js'
    ]));
  });

  test('fails when a JavaScript file declared for publishing has invalid syntax', () => {
    const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memory-syntax-check-'));
    const binDir = path.join(fixtureDir, 'bin');
    fs.mkdirSync(binDir);
    fs.writeFileSync(path.join(fixtureDir, 'package.json'), JSON.stringify({ files: ['bin'] }));
    fs.writeFileSync(path.join(binDir, 'broken.js'), 'const = invalid;');

    try {
      expect(() => checkPublishedSyntax(fixtureDir)).toThrow(/broken\.js/);
    } finally {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });
});
