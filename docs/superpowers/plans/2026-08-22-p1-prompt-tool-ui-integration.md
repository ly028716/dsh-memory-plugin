# P1-1 DSH Prompt/Tool/UI 集成实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 让 dsh-memory-plugin 的本地记忆通过真实 DSH prompt context、`memory` tool 和 Web Plugins 设置卡片影响 Agent，同时保持默认不自动采集和旧宿主降级行为。

**架构：** 将模型上下文渲染、Agent tool、host settings wiring 和 Web client card 分成独立模块。主入口只负责 capability detection、注册和 effect 生命周期；所有对 DSH capability 的调用都通过结构检查完成，缺少 capability 时保留现有 `ctx.memory` 服务。

**技术栈：** Node.js CommonJS、Jest、DSH `0.1.1-rc.2` Cordis capability、可选 `@deepseek-ai/schemastery` settings schema、DSH Web client slot/settings contracts。

---

## 文件清单

将创建或修改以下文件：

- 创建 `memory-context.js`：把已初始化的内存快照投影为有限、脱敏的 prompt context。
- 创建 `memory-tool.js`：生成 DSH `ToolDefinition` 形状的 `memory` tool，包含 search/remember/forget。
- 创建 `memory-settings.js`：可选 host settings namespace、schema 和运行时配置同步。
- 创建 `client.js`：DSH Web client half，注册 Memory 配置卡片。
- 创建 `test/memory-context.test.js`：context builder 的纯单元测试。
- 创建 `test/memory-tool.test.js`：tool 参数、执行和 deferContext 测试。
- 创建 `test/dsh-integration.test.js`：host prompt/tool/settings capability wiring 测试。
- 创建 `test/client.test.js`：client metadata、入口导出和缺少 runtime 时的安全行为测试。
- 修改 `index.js`：挂载上述 host 集成并把 disposer 接入 Cordis effect。
- 修改 `config.js`：暴露可由 settings live 更新的配置字段和运行时配置更新校验。
- 修改 `package.json`：声明 `./client` export、`dsh.client`、可选 DSH Web peer metadata 和新增测试脚本/打包文件。
- 修改 `README.md`、`README.en.md`、`USAGE.md`：说明 prompt/tool/UI 行为、默认语义和 DSH 兼容版本。
- 修改 `test-dsh-e2e.js`：增加 Agent-visible prompt/tool smoke probe；不具备 Web client 时跳过 UI probe。

## 任务 1：模型上下文投影器

**文件：**

- 创建：`memory-context.js`
- 创建：`test/memory-context.test.js`

- [ ] **步骤 1：编写失败测试**

```js
const { buildMemoryContext } = require('../memory-context');

test('renders explicit preference and recent topic without secrets', () => {
  const text = buildMemoryContext({
    userPreferences: { defaultModel: 'qwen', apiKey: 'API_KEY=secret' },
    projectContext: { activeProjects: [] },
    sessionHistory: { recentTopics: [{ content: 'ship feature', timestamp: 'now' }] },
    inputHabits: { preferredTools: [] }
  });

  expect(text).toContain('defaultModel: qwen');
  expect(text).toContain('ship feature');
  expect(text).not.toContain('secret');
});

test('returns empty text when no usable memory exists', () => {
  expect(buildMemoryContext({})).toBe('');
});

test('caps rendered context length', () => {
  const text = buildMemoryContext({
    userPreferences: { customSettings: { note: 'x'.repeat(10000) } }
  }, { maxCharacters: 500 });

  expect(text.length).toBeLessThanOrEqual(500);
});
```

- [ ] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/memory-context.test.js --runInBand`

预期：FAIL，报错 `Cannot find module '../memory-context'` 或 `buildMemoryContext is not a function`。

- [ ] **步骤 3：实现最小投影器**

在 `memory-context.js` 导出稳定的纯函数，仅读取 `userPreferences`、`projectContext.activeProjects`、`sessionHistory.recentTopics`、`sessionHistory.frequentTasks`、`inputHabits.preferredTools`，先调用 `redactSensitiveData`，再按条目数和 `maxCharacters` 截断：

```js
function buildMemoryContext(memory, options = {}) {
  const maxCharacters = Number.isSafeInteger(options.maxCharacters) ? options.maxCharacters : 4000;
  const safe = redactSensitiveData(memory && typeof memory === 'object' ? memory : {});
  const lines = [];
  const preference = safe.userPreferences?.defaultModel;
  if (preference) lines.push(`- defaultModel: ${preference}`);
  for (const item of safe.sessionHistory?.recentTopics || []) {
    if (item?.content) lines.push(`- recent topic: ${item.content}`);
  }
  for (const project of safe.projectContext?.activeProjects || []) {
    if (project?.name || project?.path) lines.push(`- project: ${project.name || project.path}`);
  }
  if (lines.length === 0) return '';
  return `Memory context (user-controlled local memory):\\n${lines.join('\\n')}`.slice(0, maxCharacters);
}

module.exports = { buildMemoryContext };
```

- [ ] **步骤 4：运行测试确认通过**

运行：`npx jest test/memory-context.test.js --runInBand`

预期：3 个测试通过。

- [ ] **步骤 5：提交**

```bash
git add memory-context.js test/memory-context.test.js
git commit -m "feat(P1-1): add redacted memory prompt context"
```

## 任务 2：Agent `memory` tool

**文件：**

- 创建：`memory-tool.js`
- 创建：`test/memory-tool.test.js`

- [ ] **步骤 1：编写失败测试**

```js
const { createMemoryTool } = require('../memory-tool');

function manager() {
  return {
    getRecommendations: jest.fn(() => ({ available: true, suggestions: [] })),
    setPreference: jest.fn(async (key, value) => ({ key, value })),
    recordTopic: jest.fn(async (value) => value),
    recordTask: jest.fn(async (value) => value),
    clearMemory: jest.fn(async () => undefined),
    exportData: jest.fn(() => ({ userPreferences: { defaultModel: 'qwen' } }))
  };
}

test('search returns bounded memory data and defers context', async () => {
  const exec = { deferContext: jest.fn() };
  const tool = createMemoryTool(manager(), { allowClearMemory: true });
  const result = await tool.execute({ action: 'search', query: 'model' }, exec);

  expect(result.ok).toBe(true);
  expect(exec.deferContext).toHaveBeenCalledTimes(1);
});

test('remember writes only supported preference fields', async () => {
  const memory = manager();
  const tool = createMemoryTool(memory, { allowClearMemory: true });
  const result = await tool.execute({ action: 'remember', category: 'preference', key: 'defaultModel', value: 'qwen' }, { deferContext() {} });

  expect(result.ok).toBe(true);
  expect(memory.setPreference).toHaveBeenCalledWith('defaultModel', 'qwen');
});

test('forget is denied when clearing is disabled', async () => {
  const memory = manager();
  const tool = createMemoryTool(memory, { allowClearMemory: false });
  const result = await tool.execute({ action: 'forget' }, { deferContext() {} });

  expect(result.ok).toBe(false);
  expect(result.code).toBe('MEMORY_CLEAR_DISABLED');
  expect(memory.clearMemory).not.toHaveBeenCalled();
});
```

- [ ] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/memory-tool.test.js --runInBand`

预期：FAIL，模块尚不存在。

- [ ] **步骤 3：实现最小 tool definition**

`createMemoryTool(memory, config)` 返回 DSH 所需字段：`name: 'memory'`、`description`、object `parameters`、object `output`、异步 `execute(args, exec)`。`execute` 只允许 `preference`、`topic`、`task` 三类写入；search 只返回 `buildMemoryContext(memory.exportData())` 的有限文本；forget 使用 `clearMemory`，不暴露任意 storage path。成功写入和查询调用：

```js
exec.deferContext({
  role: 'user',
  content: [{ type: 'text', text: `Memory tool result\\n${safeText}` }],
  source: { kind: 'plugin', name: 'dsh-memory-plugin' }
});
```

所有错误转换为 `{ ok: false, code, message }`，成功返回 `{ ok: true, ... }`，并对返回值执行 `redactSensitiveData` 和 `assertDataWithinLimits`。

- [ ] **步骤 4：运行测试确认通过**

运行：`npx jest test/memory-tool.test.js --runInBand`

预期：3 个测试通过。

- [ ] **步骤 5：提交**

```bash
git add memory-tool.js test/memory-tool.test.js
git commit -m "feat(P1-1): expose bounded memory agent tool"
```

## 任务 3：host prompt/tool capability wiring

**文件：**

- 修改：`index.js`
- 创建：`test/dsh-integration.test.js`

- [ ] **步骤 1：扩展 context mock 并编写失败测试**

```js
function createIntegrationContext() {
  return {
    effects: [],
    systemPrompt: { context: jest.fn(() => jest.fn()) },
    tools: { register: jest.fn(() => jest.fn()) },
    provide() {},
    effect(factory) { const dispose = factory(); this.effects.push(dispose); return dispose; }
  };
}

test('registers prompt context and memory tool when DSH capabilities exist', async () => {
  const ctx = createIntegrationContext();
  plugin.apply(ctx, { storagePath: path.join(testDir, 'memory.json') });
  await ctx.services.memory.ready;

  expect(ctx.systemPrompt.context).toHaveBeenCalledWith(expect.objectContaining({ name: 'dsh-memory:context' }));
  expect(ctx.tools.register).toHaveBeenCalledWith(expect.objectContaining({ name: 'memory' }));
});

test('keeps legacy context working without prompt and tool capabilities', async () => {
  const ctx = createLegacyContext();
  expect(() => plugin.apply(ctx, { storagePath: testFile })).not.toThrow();
  await ctx.services.memory.ready;
});
```

- [ ] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/dsh-integration.test.js --runInBand`

预期：带 capability 的用例 FAIL，因为 `index.js` 当前没有注册 prompt/tool。

- [ ] **步骤 3：接入最小 capability registration**

在 `index.js` 初始化 `MemoryManager` 后：

```js
const registerDisposers = [];
if (ctx.systemPrompt?.context) {
  registerDisposers.push(ctx.systemPrompt.context({
    name: 'dsh-memory:context',
    order: 120,
    text: () => buildMemoryContext(memoryManager.exportData())
  }));
}
if (ctx.tools?.register) {
  registerDisposers.push(ctx.tools.register(createMemoryTool(memoryManager, config)));
}
ctx.effect(() => () => registerDisposers.splice(0).forEach((dispose) => dispose?.()));
```

provider 和 tool 回调必须在初始化完成后再读取数据；任何读取错误返回空字符串或结构化错误。原有 `ctx.on('tools/result')` 采集监听保持不变。

- [ ] **步骤 4：运行集成测试和原有入口测试**

运行：`npx jest test/dsh-integration.test.js test/index.test.js --runInBand`

预期：新增集成测试和已有入口测试全部通过，且默认采集用例仍无 listener/file。

- [ ] **步骤 5：提交**

```bash
git add index.js test/dsh-integration.test.js
git commit -m "feat(P1-1): wire memory into DSH prompt and tools"
```

## 任务 4：settings host namespace

**文件：**

- 创建：`memory-settings.js`
- 修改：`index.js`、`config.js`
- 修改：`package.json`
- 修改：`test/dsh-integration.test.js`

- [ ] **步骤 1：编写失败测试**

```js
test('registers dsh-memory settings with live collection flags', () => {
  const settings = { register: jest.fn(() => ({ watch: jest.fn(() => jest.fn()) })) };
  const ctx = createIntegrationContext();
  ctx.settings = settings;
  plugin.apply(ctx, { storagePath: testFile });

  expect(settings.register).toHaveBeenCalledWith(
    'dsh-memory',
    expect.anything(),
    expect.objectContaining({ applies: 'live' })
  );
});
```

- [ ] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/dsh-integration.test.js --runInBand`

预期：FAIL，因为没有 settings registration。

- [ ] **步骤 3：实现可选 settings schema 和同步**

`memory-settings.js` 动态加载 `@deepseek-ai/schemastery`；加载失败时返回 `undefined`，由入口跳过 settings。成功时创建只包含六个 boolean 字段的 schema，并导出：

```js
const SETTINGS_NAMESPACE = 'dsh-memory';
const SETTINGS_FIELDS = [
  'trackToolCalls', 'trackPreferences', 'trackProjectContext',
  'trackSessionHistory', 'enableRecommendations', 'allowClearMemory'
];

function registerMemorySettings(ctx, config, onChange) {
  if (!ctx.settings?.register) return undefined;
  const schema = loadOptionalSchema(SETTINGS_FIELDS);
  if (!schema) return undefined;
  const scope = ctx.settings.register(SETTINGS_NAMESPACE, schema, {
    base: pickSettings(config),
    applies: 'live',
    validate: (value) => validateConfig({ ...config, ...value })
  });
  const dispose = scope.watch((next) => onChange(next));
  return () => dispose?.();
}
```

入口的 `onChange` 更新 `config` 和 `memoryManager.config`，然后按开关变化启动或停止自动保存；不修改存储路径。

- [ ] **步骤 4：运行 settings、配置和全量 Jest**

运行：`npx jest test/dsh-integration.test.js test/config.test.js --runInBand`，再运行：`npm test -- --runInBand`。

预期：新增 settings 测试和全量测试通过。

- [ ] **步骤 5：提交**

```bash
git add memory-settings.js index.js config.js package.json test/dsh-integration.test.js
git commit -m "feat(P1-1): expose live memory settings namespace"
```

## 任务 5：DSH Web Plugins Memory 卡片

**文件：**

- 创建：`client.js`
- 创建：`test/client.test.js`
- 修改：`package.json`

- [ ] **步骤 1：编写失败测试**

```js
test('publishes optional DSH client metadata', () => {
  const pkg = require('../package.json');
  expect(pkg.exports['./client']).toBe('./client.js');
  expect(pkg.dsh.client.platform).toBe('web');
  expect(pkg.dsh.client.inject).toEqual(expect.arrayContaining([
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-settings'
  ]));
});

test('client apply is safe without a slots service', () => {
  const { apply } = require('../client');
  expect(() => apply({ get: () => undefined, effect: (fn) => fn() })).not.toThrow();
});
```

- [ ] **步骤 2：运行测试确认正确失败**

运行：`npx jest test/client.test.js --runInBand`

预期：FAIL，因为 `package.json` 没有 client export，`client.js` 不存在。

- [ ] **步骤 3：实现 client half 和 keyed slot**

`client.js` 必须在模块顶层不读取 DOM 或 DSH service；`apply(ctx)` 做 capability detection。完整 DSH runtime 存在时，使用 `ctx.settingsScope.bind({ namespace: 'dsh-memory' })`、`CardForm` 和 `ctx.slots.register`：

```js
const MEMORY_NS = 'dsh-memory';

function apply(ctx) {
  const slots = ctx?.get?.('slots');
  const settingsScope = ctx?.get?.('settingsScope');
  if (!slots || !settingsScope) return;
  const scope = settingsScope.bind({ namespace: MEMORY_NS });
  const form = new CardForm(scope, BOOLEAN_FIELDS.map(textBooleanField));
  ctx.effect(() => ctx.slots.register({
    name: 'settings.plugin.item',
    key: MEMORY_NS,
    locale: MEMORY_LOCALE_NAMESPACE,
    inject: () => ({ ...form.bind(() => project(form)), ...form.actions() })
  }, MemoryCard));
}
```

卡片只编辑 settings namespace 中的六个开关并展示 `writable/dirty/failed` 状态；不直接读取 `.dsh-memory.json`。导出和清理在本任务中通过现有 host UI 能力可用时再显示，否则不渲染危险操作。

- [ ] **步骤 4：运行 client metadata/package 测试**

运行：`npx jest test/client.test.js --runInBand`，再运行：`npm run test:package`。

预期：client tests 和 package tarball 内容检查通过；没有 client host 时现有 CommonJS require 仍能加载。

- [ ] **步骤 5：提交**

```bash
git add client.js test/client.test.js package.json
git commit -m "feat(P1-1): add DSH Web memory settings card"
```

## 任务 6：文档与真实 DSH E2E

**文件：**

- 修改：`README.md`、`README.en.md`、`USAGE.md`
- 修改：`test-dsh-e2e.js`
- 修改：`package.json`

- [ ] **步骤 1：先添加 E2E 断言并运行红灯**

在 clean profile 安装完成后，用 profile 中的 DSH runtime/mock probe 检查 bundle 已暴露 `memory` tool 和 prompt context；在没有支持 Web bundle 时将 UI 检查标记为 skipped，而不是失败。

运行：`npm run test:dsh-e2e`

预期：在尚未集成 prompt/tool 的代码上，E2E 的 Agent-visible probe FAIL；未安装 DSH 时保持现有安全 skip。

- [ ] **步骤 2：补全文档**

文档必须明确：

- 默认自动采集仍关闭；只有显式 API/tool `remember` 会写入；
- prompt context 是当前本地记忆的有限只读投影；
- `memory` tool 的三个 action 和 `allowClearMemory` 行为；
- DSH CLI `>=0.1.1-rc.2 <0.2.0`；
- Web UI 入口位于 DSH Settings → Plugins → Memory；
- 无 Web half 时，CLI/host 记忆服务仍可用。

- [ ] **步骤 3：运行完整验证**

运行：

```bash
npm run check
npm test -- --runInBand
npm run test:package
npm run test:pinned-commit
npm run test:dsh-e2e
npm audit --registry=https://registry.npmjs.org --audit-level=high
```

预期：语法检查、Jest、打包、pinned commit、真实 clean-profile E2E 均通过；高危 audit 为 0。

- [ ] **步骤 4：提交**

```bash
git add README.md README.en.md USAGE.md test-dsh-e2e.js package.json
git commit -m "docs(P1-1): document DSH memory integrations"
```

## 任务 7：质量门禁与交付检查

**文件：**

- 检查：全部变更文件和 Git 状态

- [ ] **步骤 1：运行差异和语法检查**

运行：`git diff HEAD~6 --check`、`npm run check`、`node --check memory-context.js`、`node --check memory-tool.js`、`node --check memory-settings.js`、`node --check client.js`。

- [ ] **步骤 2：审查需求映射**

逐项确认：prompt context、memory tool、deferContext、settings live watch、Web Plugins card、capability fallback、默认不采集、脱敏、pinned commit 和真实 DSH E2E 都有测试或明确安全 skip。

- [ ] **步骤 3：检查工作区**

运行：`git status --short --branch`。

预期：除明确未推送的本地提交外无未跟踪或未提交文件；所有验证命令的退出码为 0。

- [ ] **步骤 4：提交质量门禁结果**

```bash
git add docs/superpowers/plans/2026-08-22-p1-prompt-tool-ui-integration.md
git commit -m "docs(P1-1): add prompt tool UI implementation plan"
```

