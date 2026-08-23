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
    expect(workflow).toContain(
      'npm publish "dist/${{ needs.verify.outputs.artifact_name }}" --access public --provenance'
    );
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

  test('should isolate release publishing and installation verification with least-privilege jobs', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
    const jobBlock = (name) => {
      const start = workflow.indexOf(`  ${name}:\n`);
      expect(start).toBeGreaterThanOrEqual(0);
      const remainder = workflow.slice(start + 1);
      const next = remainder.search(/\n  [A-Za-z0-9_-]+:\n/);
      return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
    };

    const verify = jobBlock('verify');
    const publishNpm = jobBlock('publish-npm');
    const createDraftRelease = jobBlock('create-draft-release');
    const verifyReleaseInstall = jobBlock('verify-release-install');
    const publishRelease = jobBlock('publish-release');

    expect(verify).toContain('contents: read');
    expect(verify).not.toContain('contents: write');
    expect(verify).not.toContain('id-token: write');
    expect(publishNpm).toContain('needs: verify');
    expect(publishNpm).toContain('contents: read');
    expect(publishNpm).toContain('id-token: write');
    expect(publishNpm).not.toContain('contents: write');
    expect(createDraftRelease).toContain('needs: [verify, publish-npm]');
    expect(createDraftRelease).toContain('contents: write');
    expect(createDraftRelease).not.toContain('id-token: write');
    expect(verifyReleaseInstall).toContain('needs: [verify, create-draft-release]');
    expect(verifyReleaseInstall).toContain('contents: read');
    expect(verifyReleaseInstall).not.toContain('contents: write');
    expect(verifyReleaseInstall).not.toContain('id-token: write');
    expect(publishRelease).toContain('needs: verify-release-install');
    expect(publishRelease).toContain('contents: write');
    expect(publishRelease).not.toContain('id-token: write');

    expect(workflow).toContain('npm pack --json --pack-destination dist > dist/pack-result.json');
    expect(workflow).toContain("const artifactName = result[0].filename;");
    expect(workflow).toContain('echo "artifact_name=$artifact_name" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('artifact_name: ${{ steps.package.outputs.artifact_name }}');
    expect(workflow).toContain('path: dist/${{ steps.package.outputs.artifact_name }}');
    expect(workflow).toContain('name: dsh-memory-plugin-${{ github.ref_name }}');
    expect(workflow).not.toContain("'*.tgz'");
    expect(workflow).not.toContain('find "$RUNNER_TEMP/release-artifact"');

    expect(createDraftRelease).toContain('gh release create "$GITHUB_REF_NAME" "dist/${{ needs.verify.outputs.artifact_name }}" --repo "$GITHUB_REPOSITORY" --draft --generate-notes');
    expect(verifyReleaseInstall).toContain('gh release download "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --pattern "${{ needs.verify.outputs.artifact_name }}" --dir "$RUNNER_TEMP/release-artifact"');
    expect(verifyReleaseInstall).toContain('github_tarball="$RUNNER_TEMP/release-artifact/${{ needs.verify.outputs.artifact_name }}"');
    expect(publishRelease).toContain('gh release edit "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --draft=false');

    expect((workflow.match(/NODE_AUTH_TOKEN:/g) || [])).toHaveLength(1);
    expect((workflow.match(/GH_TOKEN:/g) || [])).toHaveLength(3);
    expect(publishNpm).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}');
    expect(createDraftRelease).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(verifyReleaseInstall).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    expect(publishRelease).toContain('GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}');
    const verificationStep = verifyReleaseInstall.slice(
      verifyReleaseInstall.indexOf('      - name: Verify published npm and GitHub artifact installations')
    );
    expect(verificationStep).not.toContain('env:');
    expect(verificationStep).not.toContain('NODE_AUTH_TOKEN:');
    expect(verificationStep).not.toContain('GH_TOKEN:');
  });

  test('should preflight the release tag, pin actions, and safely resume draft releases', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
    const jobBlock = (name) => {
      const start = workflow.indexOf(`  ${name}:\n`);
      expect(start).toBeGreaterThanOrEqual(0);
      const remainder = workflow.slice(start + 1);
      const next = remainder.search(/\n  [A-Za-z0-9_-]+:\n/);
      return workflow.slice(start, next === -1 ? undefined : start + 1 + next);
    };

    const verify = jobBlock('verify');
    const createDraftRelease = jobBlock('create-draft-release');
    const verifyReleaseInstall = jobBlock('verify-release-install');

    expect(verify).toContain('release_version="${GITHUB_REF_NAME#v}"');
    expect(verify).toContain('const semverPattern =');
    expect(verify).toContain('Invalid release tag version');
    expect(verify).toContain('if (!Array.isArray(result) || result.length !== 1)');
    expect(verify).toContain('if (pack.version !== releaseVersion)');
    expect(verify).toContain('echo "release_version=$release_version" >> "$GITHUB_OUTPUT"');
    expect(workflow).toContain('release_version: ${{ steps.package.outputs.release_version }}');
    expect(verifyReleaseInstall).toContain('release_version="${{ needs.verify.outputs.release_version }}"');
    expect(verifyReleaseInstall).not.toContain('release_version="${GITHUB_REF_NAME#v}"');

    for (const action of [
      'actions/checkout@11d5960a326750d5838078e36cf38b85af677262',
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
      'actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02',
      'actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093'
    ]) {
      expect(workflow).toContain(action);
    }
    expect(workflow).not.toMatch(/uses:\s+[^\n]+@v\d/);

    expect(createDraftRelease).toContain(
      'gh release view "$GITHUB_REF_NAME" --repo "$GITHUB_REPOSITORY" --json isDraft -q .isDraft'
    );
    expect(createDraftRelease).toContain('if [[ "$is_draft" != "true" ]]; then');
    expect(createDraftRelease).toContain('Refusing to overwrite published release');
    expect(createDraftRelease).toContain(
      'gh release upload "$GITHUB_REF_NAME" "dist/${{ needs.verify.outputs.artifact_name }}" --repo "$GITHUB_REPOSITORY" --clobber'
    );
    expect(createDraftRelease).toContain(
      'gh release create "$GITHUB_REF_NAME" "dist/${{ needs.verify.outputs.artifact_name }}" --repo "$GITHUB_REPOSITORY" --draft --generate-notes'
    );
  });

  test('should make npm publication retry-safe for the exact release version', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'release.yml'), 'utf8');
    const start = workflow.indexOf('  publish-npm:\n');
    expect(start).toBeGreaterThanOrEqual(0);
    const end = workflow.indexOf('\n  create-draft-release:\n', start);
    const publishNpm = workflow.slice(start, end);

    expect(publishNpm).toContain(
      'if npm view "@ly028716/dsh-memory-plugin@${{ needs.verify.outputs.release_version }}" version --registry https://registry.npmjs.org > /dev/null 2>&1; then'
    );
    expect(publishNpm).toContain('Skipping npm publish: version ${{ needs.verify.outputs.release_version }} already exists');
    expect(publishNpm).toContain(
      'npm publish "dist/${{ needs.verify.outputs.artifact_name }}" --access public --provenance'
    );
    expect(publishNpm).not.toContain('npm publish "dist/${{ needs.verify.outputs.artifact_name }}" --access public --provenance || true');
  });

  test('should isolate downloaded package smoke checks and redact installer failures', () => {
    const installVerifier = fs.readFileSync(path.join(__dirname, '..', 'test-release-install.js'), 'utf8');

    expect(installVerifier).toContain('function createVerificationEnvironment(');
    expect(installVerifier).toContain('const verificationEnvironmentNames = new Set([');
    expect(installVerifier).toContain('name.toUpperCase()');
    for (const environmentName of [
      'PATH', 'SystemRoot', 'ComSpec', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR',
      'HOME', 'USERPROFILE', 'WINDIR', 'LANG', 'LC_ALL', 'TZ'
    ]) {
      expect(installVerifier).toContain(`'${environmentName}'`);
    }

    expect(installVerifier).toContain('if (parsed.username || parsed.password)');
    expect(installVerifier).toContain('function redactSecrets');
    expect(installVerifier).toContain('redactSecrets(value)');
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
