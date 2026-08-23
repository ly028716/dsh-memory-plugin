# 社区治理文档实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（\`- [ ]\`）语法来跟踪进度。

**目标：** 为项目提供安全漏洞报告策略、用户可见变更日志以及结构化的 GitHub Issue 和 Pull Request 模板。

**架构：** 根目录文档承载项目级安全与版本沟通；\`.github\` 下的 Markdown 模板在 GitHub 创建协作项时自动呈现。一个 Jest 契约测试读取这些静态文件，防止必填字段与安全提示在后续修改中丢失。

**技术栈：** Markdown、GitHub Issue/PR 模板 front matter、Node.js \`fs\`/ \`path\`、Jest。

---

## 文件结构

- 创建：\`SECURITY.md\` — 中文主导的漏洞报告与支持版本策略。
- 创建：\`CHANGELOG.md\` — Keep a Changelog 格式的用户变更记录。
- 创建：\`.github/ISSUE_TEMPLATE/bug_report.md\` — Bug 报告字段与敏感信息提示。
- 创建：\`.github/ISSUE_TEMPLATE/feature_request.md\` — 功能请求问题定义与影响评估字段。
- 创建：\`.github/pull_request_template.md\` — PR 摘要、测试、文档及安全检查清单。
- 创建：\`test/community-governance.test.js\` — 静态文档契约测试。

### 任务 1：锁定治理文档契约

**文件：**
- 创建：\`test/community-governance.test.js\`

- [ ] **步骤 1：编写失败的测试**

~~~js
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const read = (...segments) => fs.readFileSync(path.join(rootDir, ...segments), 'utf8');

describe('community governance documents', () => {
  test('defines a private security reporting policy and supported version', () => {
    const security = read('SECURITY.md');

    expect(security).toContain('# 安全策略 / Security Policy');
    expect(security).toContain('1.0.x');
    expect(security).toContain('请勿通过公开 Issue 披露漏洞');
    expect(security).toContain('7 个自然日');
  });

  test('maintains an unreleased user-facing changelog', () => {
    const changelog = read('CHANGELOG.md');

    expect(changelog).toContain('# 更新日志 / Changelog');
    expect(changelog).toContain('## [Unreleased]');
    expect(changelog).toContain('## [1.0.0]');
    expect(changelog).toContain('### Security');
  });

  test('collects actionable issue and pull request information without secrets', () => {
    const bugReport = read('.github', 'ISSUE_TEMPLATE', 'bug_report.md');
    const featureRequest = read('.github', 'ISSUE_TEMPLATE', 'feature_request.md');
    const pullRequest = read('.github', 'pull_request_template.md');

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
~~~

- [ ] **步骤 2：运行测试验证失败**

运行：\`npm test -- --runInBand test/community-governance.test.js\`

预期：FAIL，错误为 \`ENOENT\`，因为 \`SECURITY.md\`、\`CHANGELOG.md\` 和模板文件尚不存在。

### 任务 2：创建安全、变更日志与协作模板

**文件：**
- 创建：\`SECURITY.md\`
- 创建：\`CHANGELOG.md\`
- 创建：\`.github/ISSUE_TEMPLATE/bug_report.md\`
- 创建：\`.github/ISSUE_TEMPLATE/feature_request.md\`
- 创建：\`.github/pull_request_template.md\`

- [ ] **步骤 1：创建 \`SECURITY.md\`**

~~~markdown
# 安全策略 / Security Policy

## 支持的版本 / Supported Versions

| 版本 | 是否支持 |
|------|----------|
| 1.0.x | 是 |
| 早于 1.0.0 的版本 | 否 |

## 报告漏洞 / Reporting a Vulnerability

请勿通过公开 Issue 披露漏洞。请通过 GitHub 账户 \`ly028716\` 的私密联系渠道报告，并说明受影响版本、影响范围、复现步骤和建议修复方向。

请勿在报告中包含 Token、私钥、访问凭据或真实个人数据。

维护者会在 7 个自然日内确认收悉；修复与披露时间将根据影响范围与报告者协商确定。
~~~

- [ ] **步骤 2：创建 \`CHANGELOG.md\`**

~~~markdown
# 更新日志 / Changelog

本文件遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 格式，并使用语义化版本。

## [Unreleased]

### Added

- 尚无已发布的用户可见变更。

## [1.0.0]

### Added

- DSH Memory Plugin 的偏好、主题、项目与会话记忆能力。
- 数据迁移、备份、恢复与保留策略。
- npm 包与 GitHub Release artifact 的发布后安装验证。

### Security

- 发布工作流使用 npm provenance，并在发布前验证构建产物。
~~~

- [ ] **步骤 3：创建 Issue 和 PR 模板**

~~~markdown
---
name: Bug report
about: 报告可复现的问题 / Report a reproducible problem
title: '[Bug] '
labels: bug
assignees: ''
---

## 问题说明 / Description

## 复现步骤 / Steps to reproduce

## 预期结果 / Expected behavior

## 实际结果 / Actual behavior

## 环境 / Environment

请勿粘贴 Token、私钥或真实个人数据。
~~~

~~~markdown
---
name: Feature request
about: 提出改进建议 / Suggest an improvement
title: '[Feature] '
labels: enhancement
assignees: ''
---

## 问题背景 / Problem statement

## 期望行为 / Desired behavior

## 替代方案 / Alternatives

## 隐私、兼容性或迁移影响 / Privacy, compatibility, or migration impact
~~~

~~~markdown
## 变更摘要 / Summary

## 验证 / Verification

- [ ] 已运行相关测试，并在此说明命令和结果。
- [ ] 已更新需要同步的文档或明确说明无需更新。
- [ ] 已评估破坏性变更和数据迁移；如不涉及，请说明原因。
- [ ] 已评估安全影响；未引入 Token、私钥或敏感数据。

## 数据迁移 / Data migration

## 安全影响 / Security impact
~~~

- [ ] **步骤 4：运行契约测试验证通过**

运行：\`npm test -- --runInBand test/community-governance.test.js\`

预期：PASS，3 个测试全部通过。

- [ ] **步骤 5：提交文档与测试**

~~~bash
git add SECURITY.md CHANGELOG.md .github/ISSUE_TEMPLATE/bug_report.md .github/ISSUE_TEMPLATE/feature_request.md .github/pull_request_template.md test/community-governance.test.js
git commit -m "docs: add community governance templates"
~~~

### 任务 3：全量验证

**文件：**
- 验证：全部新增文件和 \`test/community-governance.test.js\`

- [ ] **步骤 1：运行静态检查**

运行：\`npm run check\`

预期：退出码 0。

- [ ] **步骤 2：运行完整单元测试**

运行：\`npm test -- --runInBand\`

预期：全部 Jest 测试通过，包含 \`community-governance.test.js\`。

- [ ] **步骤 3：检查补丁格式与仓库状态**

运行：\`git diff --check\` 和 \`git status -sb\`

预期：无空白错误；工作区干净，或仅包含本计划预期的未提交改动。

