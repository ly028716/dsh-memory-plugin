const fs = require('fs');
const path = require('path');

describe('release CI configuration', () => {
  test('should define a reproducible package verification script', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    expect(packageJson.name).toBe('@ly028716/dsh-memory-plugin');
    expect(packageJson.publishConfig).toEqual({ access: 'public' });
    expect(packageJson.description).toBe(
      'DSH Memory Plugin - Intelligent memory system for tracking user preferences and habits'
    );
    expect(packageJson.repository).toEqual({
      type: 'git',
      url: 'https://github.com/ly028716/dsh-memory-plugin.git'
    });
    expect(packageJson.homepage).toBe('https://github.com/ly028716/dsh-memory-plugin#readme');
    expect(packageJson.bugs).toEqual({
      url: 'https://github.com/ly028716/dsh-memory-plugin/issues'
    });
    expect(packageJson.author).toBe('ly028716');
    expect(packageJson.keywords).toEqual(expect.arrayContaining([
      'dsh-plugin',
      'deepseek-harness',
      'ai',
      'developer-tools',
      'context-memory'
    ]));
    expect(packageJson.scripts['test:package']).toBe('node test-package.js');
    expect(packageJson.scripts['test:pinned-commit']).toBe('node test-pinned-commit.js');
    expect(packageJson.scripts['test:dsh-e2e']).toBe('node test-dsh-e2e.js');
    expect(packageJson.engines.node).toBe('>=20');
  });

  test('should verify and publish package artifacts on version tags', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

    expect(workflow).toContain('tags:');
    expect(workflow).toContain('npm run test:package');
    expect(workflow).toContain('npm run test:pinned-commit');
    expect(workflow).toContain('npm pack');
    expect(workflow).toContain('upload-artifact');
  });

  test('should use the scoped package in DSH installation guidance', () => {
    const rootDir = path.join(__dirname, '..');
    const installCommand = 'dsh plugin --profile <name> add @ly028716/dsh-memory-plugin';

    expect(fs.readFileSync(path.join(rootDir, 'cordis.patch.yml'), 'utf8'))
      .toContain("name: '@ly028716/dsh-memory-plugin'");
    expect(fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'))
      .toContain(installCommand);
    expect(fs.readFileSync(path.join(rootDir, 'README.en.md'), 'utf8'))
      .toContain(installCommand);
    expect(fs.readFileSync(path.join(rootDir, 'test-install.js'), 'utf8'))
      .toContain(installCommand);
    expect(fs.readFileSync(path.join(rootDir, 'test-integration.js'), 'utf8'))
      .toContain(installCommand);
    expect(fs.readFileSync(path.join(rootDir, 'test-quick.js'), 'utf8'))
      .toContain(installCommand);
  });

  test('should document the real DSH clean-profile E2E command', () => {
    const rootDir = path.join(__dirname, '..');
    const e2eCommand = 'npm run test:dsh-e2e';

    expect(fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'))
      .toContain(e2eCommand);
    expect(fs.readFileSync(path.join(rootDir, 'README.en.md'), 'utf8'))
      .toContain(e2eCommand);
    expect(fs.readFileSync(path.join(rootDir, 'INSTALL.md'), 'utf8'))
      .toContain(e2eCommand);
  });
});
