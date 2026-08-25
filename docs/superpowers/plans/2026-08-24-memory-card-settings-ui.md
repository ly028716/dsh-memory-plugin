# Memory 设置卡片 UI 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将现有 Memory 设置从散乱的文本和复选框改造成与 DeepSeek Harness 原生插件一致的可折叠卡片，并让设置可以编辑、放弃和保存。

**架构：** 保留插件现有 `settings.plugin.item` 注入点，在 `client.js` 内实现轻量卡片壳和本地 staged draft，避免修改 DSH 主仓库或依赖未导出的 UI 运行时组件。卡片通过 `settingsScope` 的 `getSnapshot/subscribe/set/unset` 读取和持久化六个布尔设置；推荐指标和采集状态只读展示，不写入设置 schema。

**技术栈：** CommonJS/UMD browser client、React 18 hooks、DSH SettingsScope、React element inline styles、Jest。

---

### 任务 1：锁定 Memory 卡片的数据模型和行为

**文件：**
- 修改：`client.js`
- 测试：`test/client.test.js`

- [ ] **步骤 1：编写失败的测试**

在 `test/client.test.js` 增加断言：卡片根节点为 `li`，包含可折叠 header、三个分组、六个 checkbox、推荐指标网格、`放弃修改` 和 `保存` 按钮；切换 checkbox 只改变 staged draft，点击保存后才调用 binding 的写入方法；点击放弃恢复原值。

```js
expect(element.type).toBe('li');
expect(findByRole(element, 'button', '保存')).toBeTruthy();
expect(findByData(element, 'dsh-memory-section', 'collection')).toBeTruthy();
expect(findByData(element, 'dsh-memory-section', 'recommendations')).toBeTruthy();
expect(findByData(element, 'dsh-memory-section', 'privacy')).toBeTruthy();
checkboxes[0].props.onChange({ target: { checked: true } });
expect(ctx.binding.set).not.toHaveBeenCalled();
findByRole(element, 'button', '保存').props.onClick();
await Promise.resolve();
expect(ctx.binding.set).toHaveBeenCalledWith('trackToolCalls', true);
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx jest test/client.test.js --runInBand`

预期：FAIL，因为当前组件返回普通 `section`，没有卡片分组、保存按钮和 staged draft。

- [ ] **步骤 3：实现最少卡片模型**

在 `client.js` 中增加：

```js
const FIELD_GROUPS = Object.freeze({
  collection: ['trackToolCalls', 'trackPreferences', 'trackProjectContext', 'trackSessionHistory'],
  recommendations: ['enableRecommendations'],
  privacy: ['allowClearMemory']
});

function readValues(binding) {
  const snapshot = typeof binding.getSnapshot === 'function' ? binding.getSnapshot() : undefined;
  if (snapshot?.value && typeof snapshot.value === 'object') return snapshot.value;
  if (typeof binding.getValues === 'function') return binding.getValues();
  if (binding.values && typeof binding.values === 'object') return binding.values;
  return {};
}
```

渲染 `li > header > body > footer`，header 使用 `aria-expanded`，body 内按 `collection/recommendations/privacy` 分组；每个设置行包含中文标题、说明、checkbox 和 `data-dsh-memory-field`。保存时调用当前 SettingsScope 的 `set(field, value)`，兼容旧宿主的 `update(values)`；放弃时只重置本地 draft。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx jest test/client.test.js --runInBand`

预期：PASS，且原有插件注入、缺少 React、缺少 settingsScope 等兼容测试继续通过。

- [ ] **步骤 5：Commit**

```bash
git add client.js test/client.test.js docs/superpowers/plans/2026-08-24-memory-card-settings-ui.md
git commit -m "feat: redesign memory settings as editable card"
```

### 任务 2：接入状态订阅、指标和本地化

**文件：**
- 修改：`client.js`
- 测试：`test/client.test.js`

- [ ] **步骤 1：编写失败的测试**

增加 SettingsScope snapshot fixture，断言 `writable: false` 时控件和保存按钮禁用；断言 snapshot 的 `value` 优先于旧的 `binding.values`；断言采集状态显示已开启数量，推荐区域显示请求数、命中率、建议数和回退率；断言 `ctx.locale.register` 注册中英文文案且释放时调用 disposer。

```js
ctx.binding.getSnapshot = () => ({
  status: 'ready',
  value: { ...ctx.binding.values, trackToolCalls: true },
  writable: false,
  mode: 'host'
});
expect(checkboxes.every((node) => node.props.disabled)).toBe(true);
expect(JSON.stringify(element)).toContain('已开启 3/4 项');
expect(JSON.stringify(element)).toContain('上下文命中率：67%');
expect(ctx.locale.register).toHaveBeenCalledWith('dsh-memory', expect.objectContaining({ zh: expect.any(Object), en: expect.any(Object) }));
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npx jest test/client.test.js --runInBand`

预期：FAIL，因为当前实现不读取 `getSnapshot().value`，也未注册插件 locale。

- [ ] **步骤 3：实现状态和文案**

在 `readStatus` 中优先读取 snapshot 的 `writable`，通过一个缓存 model 将 `binding.subscribe` 转换成 React 的刷新通知；保存状态显示“保存中”和失败提示。注册：

```js
locale.register('dsh-memory', {
  zh: { title: 'Memory', description: '管理记忆采集和推荐行为', save: '保存', discard: '放弃修改' },
  en: { title: 'Memory', description: 'Manage memory collection and recommendations', save: 'Save', discard: 'Discard' }
});
```

推荐指标使用现有 `status.recommendations`，缺失值显示“暂无数据”，不改变指标计算或持久化格式。

- [ ] **步骤 4：运行测试验证通过**

运行：`npx jest test/client.test.js --runInBand`

预期：PASS，包含只读、空指标、locale disposer 和 legacy binding 回归覆盖。

- [ ] **步骤 5：Commit**

```bash
git add client.js test/client.test.js
git commit -m "feat: expose memory status and recommendation metrics"
```

### 任务 3：全量验证和本地 Harness 检查

**文件：**
- 修改：无；若验证发现文档中的旧 UI 描述，再修改 `README.md` 和 `README.en.md`
- 测试：`test/client.test.js`、全量 Jest、`npm run check`

- [ ] **步骤 1：运行插件测试和静态检查**

运行：`npm test -- --runInBand`、`npm run check`、`git diff --check`

预期：所有测试通过，Node 语法检查通过，差异检查无错误。

- [ ] **步骤 2：构建本地包并启动 Harness web profile**

在 `D:\IDEWorkplaces\GitHub\deepseek-harness` 执行：`pnpm exec dsh web --no-open --port 3081`，打开设置页的 Plugins > Plugin configuration，确认 Memory 初始为卡片、点击 header 展开、开关变更后出现未保存状态、保存后状态回写。

- [ ] **步骤 3：检查运行时设置结果**

调用：`Invoke-RestMethod -Method Post -Uri http://localhost:3081/api/settings.describe -ContentType 'application/json' -Body '{}'`，确认 `dsh-memory` 仍只有六个布尔设置；确认推荐指标和采集状态仅在卡片中展示。

- [ ] **步骤 4：Commit**

```bash
git add client.js test/client.test.js README.md README.en.md
git commit -m "test: verify memory settings card in local dsh"
```
