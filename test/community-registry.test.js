const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const PINNED_COMMIT = '6fce10ecf9cd796d46a7848aec7af07ff1ff0e18';
const PINNED_SPEC = `github:ly028716/dsh-memory-plugin#${PINNED_COMMIT}`;
const PINNED_VERIFY_BASH = `DSH_PINNED_COMMIT=${PINNED_COMMIT} npm run test:pinned-commit`;
const PINNED_VERIFY_POWERSHELL = `$env:DSH_PINNED_COMMIT = '${PINNED_COMMIT}'\nnpm run test:pinned-commit\nRemove-Item Env:DSH_PINNED_COMMIT`;
const COMMIT_TEMPLATE = '<40-character-commit-sha>';

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(projectRoot, ...segments), 'utf8').replace(/\r\n/g, '\n');
}

describe('community registry submission contract', () => {
  test('declares the memory category and reproducible install evidence', () => {
    const entry = JSON.parse(readProjectFile('community', 'registry-entry.json'));

    expect(entry).toEqual(expect.objectContaining({
      id: 'ly028716/dsh-memory-plugin',
      category: 'memory',
      verified: false,
      repository: 'https://github.com/ly028716/dsh-memory-plugin'
    }));
    expect(entry.tags).toContain('dsh-category-memory');
    expect(entry.topics).toEqual(expect.arrayContaining([
      'dsh-plugin',
      'dsh-category-memory',
      'deepseek-harness',
      'memory'
    ]));
    expect(entry.compatibility.dsh).toBe('>=0.1.1-rc.2 <0.2.0');
    expect(entry.install).toEqual(expect.objectContaining({
      target: 'github',
      spec: PINNED_SPEC
    }));
    expect(entry.alternateInstall.spec).toBe('@ly028716/dsh-memory-plugin');
    expect(entry.evidence.validation).toEqual(expect.arrayContaining([
      'npm test -- --runInBand',
      'npm run check',
      PINNED_VERIFY_BASH,
      PINNED_VERIFY_POWERSHELL,
      'npm run test:package'
    ]));
  });

  test('documents the submission boundary and pinned commit workflow', () => {
    const submission = readProjectFile('COMMUNITY-SUBMISSION.md');

    expect(submission).toContain('dsh-category-memory');
    expect(submission).toContain('不构成官方认证');
    expect(submission).toContain('完整 40 位 SHA');
    expect(submission).toContain(`dsh plugin --profile web add ${PINNED_SPEC}`);
  });

  test('keeps the category searchable from npm metadata', () => {
    const packageJson = JSON.parse(readProjectFile('package.json'));

    expect(packageJson.keywords).toContain('dsh-category-memory');
  });

  test('includes the same pinned commit example in install documents', () => {
    const documents = [
      'README.md',
      'README.en.md',
      'INSTALL.md',
      'MANUAL-INSTALL.md',
      'COMMUNITY-SUBMISSION.md'
    ];
    const expected = `dsh plugin --profile web add ${PINNED_SPEC}`;

    for (const document of documents) {
      const content = readProjectFile(document);
      expect(content).toContain(COMMIT_TEMPLATE);
      expect(content).toContain(PINNED_SPEC);
      expect(content).toContain(expected);
    }
  });

  test('keeps the pinned commit synchronized across registry and submission documents', () => {
    expect(PINNED_COMMIT).toMatch(/^[0-9a-f]{40}$/);

    const entry = JSON.parse(readProjectFile('community', 'registry-entry.json'));
    const submission = readProjectFile('COMMUNITY-SUBMISSION.md');

    expect(entry.install.command).toBe(`dsh plugin --profile web add ${PINNED_SPEC}`);
    expect(submission).toContain(PINNED_SPEC);
    expect(submission).toContain(PINNED_VERIFY_BASH);
    expect(submission).toContain(PINNED_VERIFY_POWERSHELL);
    expect(entry.evidence.validation).toContain(PINNED_VERIFY_BASH);
    expect(entry.evidence.validation).toContain(PINNED_VERIFY_POWERSHELL);
  });
});
