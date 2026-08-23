const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');

function readProjectFile(...segments) {
  return fs.readFileSync(path.join(projectRoot, ...segments), 'utf8');
}

describe('community governance document contract', () => {
  test('SECURITY.md defines the supported version and private reporting process', () => {
    const content = readProjectFile('SECURITY.md');

    expect(content).toContain('# 安全策略 / Security Policy');
    expect(content).toContain('1.0.x');
    expect(content).toContain('请勿通过公开 Issue 披露漏洞');
    expect(content).toContain('7 个自然日');
  });

  test('CHANGELOG.md provides unreleased and security release sections', () => {
    const content = readProjectFile('CHANGELOG.md');

    expect(content).toContain('# 更新日志 / Changelog');
    expect(content).toContain('## [Unreleased]');
    expect(content).toContain('## [1.0.0]');
    expect(content).toContain('### Security');
  });

  test('issue and pull request templates request the required governance information', () => {
    const bugReport = readProjectFile('.github', 'ISSUE_TEMPLATE', 'bug_report.md');
    const featureRequest = readProjectFile('.github', 'ISSUE_TEMPLATE', 'feature_request.md');
    const pullRequest = readProjectFile('.github', 'pull_request_template.md');

    expect(bugReport).toContain('name: Bug report');
    expect(bugReport).toContain('复现步骤');
    expect(bugReport).toContain('请勿粘贴 Token、私钥或真实个人数据');

    expect(featureRequest).toContain('name: Feature request');
    expect(featureRequest).toContain('问题背景');
    expect(featureRequest).toContain('隐私、兼容性或迁移影响');

    expect(pullRequest).toContain('## 验证 / Verification');
    expect(pullRequest).toContain('数据迁移');
    expect(pullRequest).toContain('安全影响');
  });
});
