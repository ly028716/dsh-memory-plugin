const fs = require('fs');
const path = require('path');
const { assertDependencyLock } = require('../check-dependencies');

describe('dependency lock quality gate', () => {
  test('matches the package manifest and resolves every direct runtime dependency', () => {
    const rootDir = path.join(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    const packageLock = JSON.parse(fs.readFileSync(path.join(rootDir, 'package-lock.json'), 'utf8'));

    expect(() => assertDependencyLock(packageJson, packageLock)).not.toThrow();
  });

  test('rejects a stale direct dependency declaration', () => {
    const packageJson = { dependencies: { example: '^1.0.0' } };
    const packageLock = { packages: { '': { dependencies: {} } } };

    expect(() => assertDependencyLock(packageJson, packageLock)).toThrow(/example/);
  });
});
