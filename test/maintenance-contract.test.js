const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');

function readRootFile(name) {
  return fs.readFileSync(path.join(rootDir, name), 'utf8');
}

describe('repository maintenance contracts', () => {
  test('push helper is repository-relative and rerunnable', () => {
    const script = readRootFile('git-push.bat');

    expect(script).toContain('cd /d "%~dp0"');
    expect(script).not.toContain('E:\\IDEWorkplaces\\DeepSeekHarness');
    expect(script).toContain('git diff --cached --quiet');
    expect(script).toContain('git push origin HEAD');
  });

  test('gitignore protects local environment files while allowing an example', () => {
    const gitignore = readRootFile('.gitignore');

    expect(gitignore).toContain('.env');
    expect(gitignore).toContain('.env.*');
    expect(gitignore).toContain('!.env.example');
  });

  test('GitHub checklist does not prescribe a developer-specific path', () => {
    const checklist = readRootFile('GITHUB-CHECKLIST.md');

    expect(checklist).not.toContain('E:\\IDEWorkplaces\\DeepSeekHarness');
    expect(checklist).toContain('git push origin main');
  });

  test('user-facing documentation uses portable path placeholders', () => {
    const files = [
      'FINAL-STATUS.md',
      'INSTALL.md',
      'INSTALLATION-REPORT.md',
      'MANUAL-INSTALL.md',
      'REPORT-GUIDE.md',
      'SUMMARY.md',
      'USAGE.md',
      'WEB-UI-GUIDE.md',
      'viewer-with-data.html'
    ];

    for (const file of files) {
      const content = readRootFile(file);
      expect(content).not.toMatch(/E:[\\/]IDEWorkplaces[\\/]/);
    }
  });
});
