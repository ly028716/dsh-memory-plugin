const fs = require('fs');
const path = require('path');

describe('release CI configuration', () => {
  test('should define a reproducible package verification script', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    expect(packageJson.scripts['test:package']).toBe('node test-package.js');
    expect(packageJson.engines.node).toBe('>=20');
  });

  test('should verify and publish package artifacts on version tags', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

    expect(workflow).toContain('tags:');
    expect(workflow).toContain('npm run test:package');
    expect(workflow).toContain('npm pack');
    expect(workflow).toContain('upload-artifact');
  });
});
