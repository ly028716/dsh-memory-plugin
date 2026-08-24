const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const PINNED_COMMIT = 'fbaa0216e51c15d111d1e859e2cb4af50c033e0b';
const PINNED_SPEC = `github:ly028716/dsh-memory-plugin#${PINNED_COMMIT}`;

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(projectRoot, ...segments), 'utf8');
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
      'npm run test:pinned-commit',
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
    const documents = ['README.md', 'README.en.md', 'INSTALL.md', 'MANUAL-INSTALL.md'];
    const expected = `dsh plugin --profile web add ${PINNED_SPEC}`;

    for (const document of documents) {
      const content = readProjectFile(document);
      expect(content).toContain('dsh plugin --profile web add');
      expect(content).toContain(PINNED_SPEC);
      expect(content).toContain(expected);
    }
  });

  test('keeps the pinned commit synchronized across registry and submission documents', () => {
    expect(PINNED_COMMIT).toMatch(/^[0-9a-f]{40}$/);

    const entry = JSON.parse(readProjectFile('community', 'registry-entry.json'));
    expect(entry.install.spec).toBe(PINNED_SPEC);
    expect(entry.install.command).toBe(`dsh plugin --profile web add ${PINNED_SPEC}`);
    expect(readProjectFile('COMMUNITY-SUBMISSION.md')).toContain(PINNED_SPEC);
  });
});
