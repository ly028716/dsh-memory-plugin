# Pinned Commit 安装示例实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为社区目录和 CI/审计用户提供使用真实 40 位 commit SHA 的可复制 GitHub pinned commit 安装示例，并让所有相关文档和测试保持一致。

**架构：** 不修改运行时代码或安装器，只更新社区目录元数据和安装文档。测试从一个共享的 pinned SHA 常量出发，检查社区条目、中文/英文安装文档和维护者指南中的命令及模板。

**技术栈：** Markdown、JSON、Node.js、Jest、Git。

---

### 任务 1：为真实 pinned SHA 增加失败测试

**文件：**
- 修改：`test/community-registry.test.js:1-70`

- [ ] **步骤 1：编写失败的测试**

在测试文件顶部增加：

```js
const PINNED_COMMIT = '6fce10ecf9cd796d46a7848aec7af07ff1ff0e18';
const PINNED_SPEC = `github:ly028716/dsh-memory-plugin#${PINNED_COMMIT}`;
```

将现有占位符断言改为验证真实值，并增加以下行为测试：

```js
test('uses one executable 40-character pinned commit across registry documents', () => {
  expect(PINNED_COMMIT).toMatch(/^[0-9a-f]{40}$/);

  const entry = JSON.parse(readProjectFile('community', 'registry-entry.json'));
  expect(entry.install.spec).toBe(PINNED_SPEC);
  expect(entry.install.command).toContain(PINNED_SPEC);

  for (const document of ['README.md', 'README.en.md', 'INSTALL.md', 'MANUAL-INSTALL.md', 'COMMUNITY-SUBMISSION.md']) {
    const content = readProjectFile(document);
    expect(content).toContain(PINNED_SPEC);
  }
});
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm test -- --runInBand test/community-registry.test.js`

预期：FAIL，失败原因是 `community/registry-entry.json` 和安装文档仍使用 `<40-character-commit-sha>` 占位符，而不是 `6fce10ecf9cd796d46a7848aec7af07ff1ff0e18`。

### 任务 2：更新社区条目和安装文档

**文件：**
- 修改：`community/registry-entry.json:33-36`
- 修改：`README.md:84-95`
- 修改：`README.en.md` 中对应的安装命令段落
- 修改：`INSTALL.md` 中对应的安装命令段落
- 修改：`MANUAL-INSTALL.md` 中对应的安装命令段落
- 修改：`COMMUNITY-SUBMISSION.md:39-53`

- [ ] **步骤 1：更新社区目录 spec**

将社区条目更新为：

```json
{
  "spec": "github:ly028716/dsh-memory-plugin#6fce10ecf9cd796d46a7848aec7af07ff1ff0e18",
  "command": "dsh plugin --profile web add github:ly028716/dsh-memory-plugin#6fce10ecf9cd796d46a7848aec7af07ff1ff0e18"
}
```

- [ ] **步骤 2：在每份安装文档中加入可执行示例**

保留 npm 推荐安装，并在 pinned commit 小节使用：

```bash
# GitHub pinned commit（CI/审计场景）
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#6fce10ecf9cd796d46a7848aec7af07ff1ff0e18
```

同时保留通用模板，并说明新提交发布后应替换为新的完整 40 位 SHA：

```bash
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
```

- [ ] **步骤 3：运行目标测试验证通过**

运行：`npm test -- --runInBand test/community-registry.test.js`

预期：该测试文件全部 PASS，且同时保留模板断言和真实 pinned spec 断言。

### 任务 3：执行完整验证并提交

**文件：**
- 验证：`test/community-registry.test.js`
- 验证：`community/registry-entry.json`
- 验证：`README.md`、`README.en.md`、`INSTALL.md`、`MANUAL-INSTALL.md`、`COMMUNITY-SUBMISSION.md`

- [ ] **步骤 1：运行完整验证**

依次运行：

```bash
npm test -- --runInBand
npm run check
npm run test:pinned-commit
npm run test:package
git diff --check
```

预期：每条命令退出码为 0，Jest 无失败测试，文档无空白错误。

- [ ] **步骤 2：检查变更范围**

运行：`git status --short` 和 `git diff --stat`，确认只包含本计划的安装文档、社区条目、测试和计划文件。

- [ ] **步骤 3：提交实现**

```bash
git add test/community-registry.test.js community/registry-entry.json README.md README.en.md INSTALL.md MANUAL-INSTALL.md COMMUNITY-SUBMISSION.md docs/superpowers/plans/2026-08-24-pinned-commit-install-plan.md
git commit -m "docs: add executable pinned commit install examples"
```
