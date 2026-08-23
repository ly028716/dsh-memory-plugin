const fs = require('fs');
const path = require('path');

describe('release CI configuration', () => {
  test('should define a reproducible package verification script', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    expect(packageJson.name).toBe('@ly028716/dsh-memory-plugin');
    expect(packageJson.publishConfig).toEqual({ access: 'public' });
    expect(packageJson.dsh.compatibility).toEqual({
      cli: '>=0.1.1-rc.2 <0.2.0'
    });
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

  test('declares the real browser E2E command and Playwright config', () => {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));

    expect(packageJson.scripts['test:browser-e2e'])
      .toBe('playwright test --config=playwright.config.js');
    expect(packageJson.devDependencies['@playwright/test']).toBeDefined();
    expect(fs.existsSync(path.join(__dirname, '..', 'playwright.config.js'))).toBe(true);
  });

  test('should verify npm registry and GitHub Release tarball installations after publishing', () => {
    const rootDir = path.join(__dirname, '..');
    const packageJson = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

    expect(packageJson.scripts['test:release-install']).toBe('node test-release-install.js');

    const installVerifier = fs.readFileSync(path.join(rootDir, 'test-release-install.js'), 'utf8');
    const workflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'release.yml'), 'utf8');

    expect(installVerifier).toContain('--github-tarball');
    expect(installVerifier).toContain('npm_config_registry');
    expect(installVerifier).toContain('doctor');
    expect(installVerifier).toContain('const plugin = require(installedRoot)');
    expect(installVerifier).toContain("plugin.name !== 'memory'");
    expect(installVerifier).toContain("typeof plugin.apply !== 'function'");
    expect(installVerifier).toContain('installedPackage.version !== version');
    expect(installVerifier).toContain('installedPackage.dsh.bundle.patch');
    expect(installVerifier).toContain("'dsh-memory-plugin.js'");
    expect(installVerifier).toContain("'profile-doctor.js'");
    expect(installVerifier).toContain("'doctor', '--help'");
    expect(installVerifier).toContain("'dsh-memory-plugin doctor'");
    expect(installVerifier).toContain("'viewer.html'");
    expect(installVerifier).toContain("'premium-viewer.html'");
    expect(installVerifier).toContain("'open-viewer.cmd'");
    expect(installVerifier).toContain('installFromNpm');
    expect(installVerifier).toContain('installFromTarball');
    expect(workflow).toContain('npm publish dist/*.tgz --access public --provenance');
    expect(workflow).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(workflow).toContain('gh release download');
    expect(workflow).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(workflow).toContain('release_version="${GITHUB_REF_NAME#v}"');
    expect(workflow).toContain(
      'npm run test:release-install -- --version "$release_version" --github-tarball "$github_tarball"'
    );
    expect(workflow).toContain('--version "$release_version"');
    expect(workflow).toContain('--github-tarball "$github_tarball"');
    expect(workflow).toContain('test -n "$github_tarball"');
  });

  test('should isolate downloaded package smoke checks and redact installer failures', () => {
    const installVerifier = fs.readFileSync(path.join(__dirname, '..', 'test-release-install.js'), 'utf8');

    expect(installVerifier).toContain('function createVerificationEnvironment()');
    expect(installVerifier).toContain('const verificationEnvironmentNames = new Set([');
    expect(installVerifier).toContain('name.toUpperCase()');
    for (const environmentName of [
      'PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR',
      'HOME', 'USERPROFILE', 'WINDIR', 'LANG', 'LC_ALL', 'TZ'
    ]) {
      expect(installVerifier).toContain(`'${environmentName}'`);
    }

    expect(installVerifier).toContain('if (parsed.username || parsed.password)');
    expect(installVerifier).toContain('function redactSensitiveText');
    expect(installVerifier).toContain('redactSensitiveText(value)');
    expect(installVerifier).toContain('[REDACTED]');
    expect((installVerifier.match(/cwd: consumerDir/g) || [])).toHaveLength(2);
    expect((installVerifier.match(/env: verificationEnv/g) || [])).toHaveLength(2);
  });

  test('should verify and publish package artifacts on version tags', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');

    expect(workflow).toContain('tags:');
    expect(workflow).toContain('npm run test:package');
    expect(workflow).toContain('npm run test:pinned-commit');
    expect(workflow).toContain('npm pack');
    expect(workflow).toContain('upload-artifact');
  });

  test('should install Chromium and run real browser E2E in CI and release workflows', () => {
    const rootDir = path.join(__dirname, '..');
    const ciWorkflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'ci.yml'), 'utf8');
    const releaseWorkflow = fs.readFileSync(path.join(rootDir, '.github', 'workflows', 'release.yml'), 'utf8');

    for (const workflow of [ciWorkflow, releaseWorkflow]) {
      expect(workflow).toContain('npx playwright install --with-deps chromium');
      expect(workflow).toContain('npm run test:browser-e2e');
      expect(workflow).toContain('playwright-report/');
      expect(workflow).toContain('test-results/');
    }
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
    const compatibilityRange = '>=0.1.1-rc.2 <0.2.0';

    expect(fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'))
      .toContain(e2eCommand);
    expect(fs.readFileSync(path.join(rootDir, 'README.md'), 'utf8'))
      .toContain(compatibilityRange);
    expect(fs.readFileSync(path.join(rootDir, 'README.en.md'), 'utf8'))
      .toContain(e2eCommand);
    expect(fs.readFileSync(path.join(rootDir, 'README.en.md'), 'utf8'))
      .toContain(compatibilityRange);
    expect(fs.readFileSync(path.join(rootDir, 'INSTALL.md'), 'utf8'))
      .toContain(e2eCommand);
    expect(fs.readFileSync(path.join(rootDir, 'INSTALL.md'), 'utf8'))
      .toContain(compatibilityRange);
  });
});
