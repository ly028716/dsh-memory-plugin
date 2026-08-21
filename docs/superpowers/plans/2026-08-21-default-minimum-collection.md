# 默认最小采集实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（当前会话采用内联执行）逐任务实现此计划。步骤使用复选框语法来跟踪进度。

**目标：** 将四项自动采集能力改为默认关闭，仅在用户显式配置为 `true` 时启用。

**架构：** 只调整 `DEFAULT_CONFIG` 和面向用户的配置文档；保留现有配置门控、事件注册和脱敏逻辑。显式开启的集成测试继续覆盖原有采集模式。

**技术栈：** Node.js CommonJS、Jest、现有 DSH 模拟集成测试。

---

### 任务 1：为默认策略添加失败测试

**文件：**
- 修改：`test/config.test.js`

- [x] **步骤 1：添加默认最小采集断言**

```js
test('should disable all automatic collection by default', () => {
  const config = validateConfig();

  expect(config.trackToolCalls).toBe(false);
  expect(config.trackPreferences).toBe(false);
  expect(config.trackProjectContext).toBe(false);
  expect(config.trackSessionHistory).toBe(false);
});
```

- [x] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/config.test.js --runInBand`

预期：新增测试失败，因为当前四项默认值仍为 `true`。

### 任务 2：切换默认配置并更新文档

**文件：**
- 修改：`config.js:12-16`
- 修改：`README.md:124-131`
- 修改：`README.en.md:124-131`

- [x] **步骤 1：修改默认值**

```js
// Automatic collection is opt-in.
trackToolCalls: false,
trackPreferences: false,
trackProjectContext: false,
trackSessionHistory: false,
```

- [x] **步骤 2：更新中英文说明**

配置示例将四项开关展示为 `false`，并写明需要显式设置为 `true` 才会采集对应数据；显式配置示例保持开启以展示 API 用法。

- [x] **步骤 3：运行配置测试确认通过**

运行：`npx jest test/config.test.js --runInBand`

预期：配置测试全部通过。

### 任务 3：验证 opt-in 与默认隔离行为

**文件：**
- 修改：`test-integration.js`（仅在缺少 bundle 文件断言时补充 bundle 校验）
- 测试：`test/config.test.js`、`test/memory-manager.test.js`

- [x] **步骤 1：运行显式开启的集成测试**

运行：`node test-integration.js`

预期：显式 `track* = true` 的集成场景继续通过，工具事件仍注册、Service API 仍可用。

- [x] **步骤 2：运行完整回归**

运行：

```powershell
npx jest --runInBand
node test-integration.js
node test-install.js
node test-quick.js
node --check config.js
git diff --check
```

预期：所有命令退出码为 0；默认配置测试确认四项采集均关闭，显式开启测试继续通过。

- [x] **步骤 3：检查变更范围**

运行：`git status --short --branch; git diff --stat`

预期：仅包含默认配置、文档、测试和设计计划相关变更。
