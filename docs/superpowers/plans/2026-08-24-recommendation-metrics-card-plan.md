# 推荐效果指标设置卡实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法跟踪进度。

**目标：** 在 DSH Web Memory 设置卡中展示完整的当前进程推荐效果指标，并同步中英文使用文档。

**架构：** 复用 `settingsScope` 提供的 `status.recommendations`，不改变指标计算、API、设置 schema 或持久化行为。`client.js` 只负责将已有数值转换为只读文本；缺失或 `null` 指标继续安全显示空状态或“暂无数据”。

**技术栈：** JavaScript、Jest、React-compatible `createElement`、Markdown。

---

### 任务 1：为完整指标展示增加失败测试

**文件：**
- 修改：`test/client.test.js:314-350`

- [x] **步骤 1：编写失败测试**

将现有设置卡测试的推荐指标扩展为 `requests: 8`、`availableRequests: 7`、`contextualRequests: 6`、`contextMatches: 4`、`fallbackRequests: 2`、`suggestions: 12`、`contextMatchRate: 2 / 3`、`fallbackRate: 1 / 3`，并断言渲染文本包含：

```js
expect(rendered).toContain('推荐请求：8');
expect(rendered).toContain('可用请求：7');
expect(rendered).toContain('上下文请求：6');
expect(rendered).toContain('上下文命中：4');
expect(rendered).toContain('回退请求：2');
expect(rendered).toContain('建议数：12');
expect(rendered).toContain('上下文命中率：67%');
expect(rendered).toContain('回退率：33%');
```

增加空/不完整指标测试，验证 `null` 比率不抛错并显示“暂无数据”：

```js
test('card renders a safe empty state for missing recommendation metrics', () => {
  mockReact();
  const { apply } = loadClient();
  const ctx = createContext();
  ctx.binding.getStatus = jest.fn(() => ({
    recommendations: { requests: 1, contextMatchRate: null, fallbackRate: null }
  }));
  apply(ctx);
  const [definition, Card] = ctx.slots.register.mock.calls[0];
  expect(() => Card(definition.inject())).not.toThrow();
  expect(JSON.stringify(Card(definition.inject()))).toContain('上下文命中率：暂无数据');
});
```

- [x] **步骤 2：运行测试验证失败**

运行：`npm test -- --runInBand test/client.test.js`

预期：FAIL，新增的数字段尚未由 `client.js` 渲染。

### 任务 2：实现完整指标摘要

**文件：**
- 修改：`client.js:179-187`
- 测试：`test/client.test.js:314-380`

- [x] **步骤 1：编写最少实现代码**

在 `data-dsh-memory="recommendation-metrics"` 容器中依次渲染：

```js
`推荐请求：${recommendations.requests ?? 0}`,
`可用请求：${recommendations.availableRequests ?? 0}`,
`上下文请求：${recommendations.contextualRequests ?? 0}`,
`上下文命中：${recommendations.contextMatches ?? 0}`,
`回退请求：${recommendations.fallbackRequests ?? 0}`,
`建议数：${recommendations.suggestions ?? 0}`,
`上下文命中率：${formatRate(recommendations.contextMatchRate)}`,
`回退率：${formatRate(recommendations.fallbackRate)}`
```

保留现有空状态 `当前会话暂无推荐指标`。

- [x] **步骤 2：运行目标测试验证通过**

运行：`npm test -- --runInBand test/client.test.js`

预期：该测试文件全部 PASS，空指标测试不抛异常。

- [x] **步骤 3：运行相关回归测试**

运行：`npm test -- --runInBand test/client.test.js test/index.test.js test/dsh-integration.test.js`

预期：设置卡、Memory service 暴露和默认采集语义相关测试全部 PASS。

### 任务 3：同步使用文档

**文件：**
- 修改：`README.md:204-213`
- 修改：`README.en.md:206-215`
- 修改：`USAGE.md:202`

- [x] **步骤 1：更新中文文档**

将 `getRecommendationMetrics()` 示例扩展为输出 `requests`、`availableRequests`、`contextualRequests`、`contextMatches`、`fallbackRequests`、`suggestions`、`contextMatchRate` 和 `fallbackRate`，并说明这些指标只反映当前进程内覆盖、命中和回退，不代表点击率或采纳率，也不写入记忆文件。

- [x] **步骤 2：同步英文 README 与 USAGE**

使用同一字段集合和隐私边界，保持现有 API 示例兼容。

- [x] **步骤 3：检查文档格式**

运行：`git diff --check`

预期：退出码为 0，无空白错误。

### 任务 4：完整验证与提交

**文件：**
- 验证：`client.js`
- 验证：`test/client.test.js`
- 验证：`README.md`
- 验证：`README.en.md`
- 验证：`USAGE.md`

- [x] **步骤 1：运行完整验证**

依次运行：`npm test -- --runInBand`、`npm run check`、`npm run test:package`、`git diff --check`。预期 19 个测试套件、220 个以上测试全部通过，每条命令退出码为 0。

- [x] **步骤 2：检查变更范围**

运行：`git status --short` 和 `git diff --stat`，确认只包含本计划的设置卡、测试、文档、计划和规格文件。

- [x] **步骤 3：提交实现**

```bash
git add client.js test/client.test.js README.md README.en.md USAGE.md docs/superpowers/plans/2026-08-24-recommendation-metrics-card-plan.md
git commit -m "feat: show complete recommendation metrics"

## 完成记录

- 已在 `6fce10e` 中完成设置卡完整八项推荐指标展示、null-safe 测试和中英文文档同步。
- 验证通过：19 个测试套件、221 个测试，`npm run check`、`npm run test:package` 和 `git diff --check`。
```
