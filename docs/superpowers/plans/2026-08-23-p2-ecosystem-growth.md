# P2 生态和增长实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans（当前会话内联执行）。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 为现有 dsh memory 插件加入 `dsh-category-memory` 社区分类材料、可复现 pinned commit 安装示例、隐私安全的推荐效果指标，以及设置页中的自动采集状态可视化。

**架构：** 分类与提交信息放在仓库内的静态 registry entry 和提交说明中，不创建独立包或外部服务。推荐指标保存在 `MemoryManager` 进程内，通过 memory service 和 stats API 暴露；设置卡只读当前六个配置开关并派生展示状态，不扩展设置 schema。

**技术栈：** Node.js CommonJS、Jest、React 可选运行时、DSH settings scope、静态 JSON/Markdown 文档。

---

## 预检查：确认基线与工作区约束

**文件：**
- 读取：`package.json`
- 读取：`memory-manager.js`
- 读取：`client.js`
- 读取：`docs/superpowers/specs/2026-08-23-p2-ecosystem-growth-design.md`

- [x] **步骤 1：确认当前测试基线**

运行：

```powershell
npm test -- --runInBand
npm run check
git diff --check
```

预期：基线测试和语法检查通过；若 `.git` 权限仍然阻止 git 写操作，只记录，不修改或删除锁文件。

## 任务 1：社区分类与目录提交材料

**文件：**
- 创建：`community/registry-entry.json`
- 创建：`COMMUNITY-SUBMISSION.md`
- 修改：`package.json`
- 创建：`test/community-registry.test.js`

- [x] **步骤 1：编写失败的社区契约测试**

在 `test/community-registry.test.js` 中读取 JSON/Markdown，并断言：

```js
const entry = JSON.parse(fs.readFileSync(path.join(root, 'community', 'registry-entry.json'), 'utf8'));

expect(entry.id).toBe('ly028716/dsh-memory-plugin');
expect(entry.category).toBe('memory');
expect(entry.tags).toContain('dsh-category-memory');
expect(entry.install.spec).toContain('#<40-character-commit-sha>');
expect(entry.compatibility.dsh).toBe('>=0.1.1-rc.2 <0.2.0');
expect(entry.verified).toBe(false);
expect(submission).toContain('不构成官方认证');
expect(submission).toContain('dsh-category-memory');
```

- [x] **步骤 2：运行契约测试确认失败**

运行：`npx jest test/community-registry.test.js --runInBand`

预期：FAIL，提示 `community/registry-entry.json` 不存在。

- [x] **步骤 3：新增机器可读 registry entry**

创建 `community/registry-entry.json`，使用稳定仓库 id、`category: "memory"`、`tags` 中的 `dsh-category-memory`，同时声明 npm 和 GitHub pinned commit 安装来源、Windows/macOS/Linux 平台、MIT 许可证、DSH 兼容范围、已有测试证据和 `verified: false`。安装命令中的 commit 必须保留 `<40-character-commit-sha>`，不能伪造当前 commit。

- [x] **步骤 4：新增社区提交说明并补充包关键词**

创建 `COMMUNITY-SUBMISSION.md`，写明：

```text
提交目标：独立社区 DSH 插件目录
分类：memory
检索标签：dsh-category-memory
安装：dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
验证：npm test -- --runInBand；npm run check；npm run test:pinned-commit；npm run test:package
安全边界：目录收录不构成官方认证、安全审计或兼容性保证
```

在 `package.json.keywords` 追加 `dsh-category-memory`，不新增未经 DSH 支持的 manifest 字段。

- [x] **步骤 5：运行契约测试确认通过**

运行：`npx jest test/community-registry.test.js --runInBand`

预期：PASS。

- [x] **步骤 6：检查差异**

运行：`git diff --check`

预期：无空白错误；不执行 `git reset`、`git checkout` 或删除任何现有文件。

## 任务 2：pinned commit 安装文档

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`INSTALL.md`
- 修改：`MANUAL-INSTALL.md`

- [x] **步骤 1：写入中英文一致的安装示例**

在现有 GitHub pinned commit 小节补充以下命令，并保留 npm 安装路径：

```bash
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
```

旁边说明必须替换成完整 40 位 SHA；短 SHA、浮动分支和无 commit fragment 的 GitHub 地址不属于可复现安装示例。

- [x] **步骤 2：加入文档契约断言**

在 `test/community-registry.test.js` 中读取四份文档，断言它们都包含 `dsh plugin --profile web add`、仓库地址和 `<40-character-commit-sha>`。

- [x] **步骤 3：运行文档契约测试**

运行：`npx jest test/community-registry.test.js --runInBand`

预期：PASS。

## 任务 3：推荐效果指标的最小实现

**文件：**
- 修改：`memory-manager.js`
- 修改：`index.js`
- 测试：`test/memory-manager.test.js`
- 测试：`test/index.test.js`
- 测试：`test/dsh-integration.test.js`

- [x] **步骤 1：增加指标失败测试**

在 `test/memory-manager.test.js` 增加测试，先调用两次带上下文请求：一次命中命令/项目，一次没有命中而回退；断言：

```js
expect(manager.getRecommendationMetrics()).toEqual(expect.objectContaining({
  requests: 2,
  availableRequests: 2,
  contextualRequests: 2,
  contextMatches: 1,
  fallbackRequests: 1,
  suggestions: expect.any(Number),
  contextMatchRate: 0.5,
  fallbackRate: 0.5,
  patternRecognitionThreshold: config.patternRecognitionThreshold
}));
```

同时覆盖空上下文的 `null` 比率、禁用推荐不增加 `availableRequests`、返回指标对象被调用方修改后不污染下一次 getter。

- [x] **步骤 2：运行定向测试确认失败**

运行：`npx jest test/memory-manager.test.js --runInBand -t "recommendation metrics"`

预期：FAIL，提示 `getRecommendationMetrics` 不存在或指标字段缺失。

- [x] **步骤 3：实现进程内指标与安全 getter**

在 `MemoryManager` 构造函数初始化私有状态，例如：

```js
this.recommendationMetrics = {
  requests: 0,
  availableRequests: 0,
  contextualRequests: 0,
  contextMatches: 0,
  fallbackRequests: 0,
  suggestions: 0
};
```

在 `getRecommendations(context)` 中：

1. 推荐功能关闭时只返回 `{ available: false }`，不计入可用请求。
2. 开启后增加 `requests` 与 `availableRequests`。
3. 只在规范化上下文 token 非空时增加 `contextualRequests`。
4. 用当前命令和项目候选的实际选择结果判断 `contextMatches`/`fallbackRequests`，不把偏好 Agent/Model 误算成上下文命中。
5. 累加 `suggestions.length`。

增加 `getRecommendationMetrics()`，计算两个有限比率，分母为零返回 `null`，并返回新对象。将阈值从当前 config 读出但不写入 memory 文件。

- [x] **步骤 4：暴露服务 API 并扩展 stats**

在 `index.js` 的 `ctx.provide('memory', ...)` 中增加：

```js
getRecommendationMetrics: () => memoryManager.getRecommendationMetrics()
```

在 `getStats()` 返回值上合并 `recommendations: memoryManager.getRecommendationMetrics()`，保持既有统计字段不变。

- [x] **步骤 5：运行定向测试确认通过**

运行：

```powershell
npx jest test/memory-manager.test.js test/index.test.js test/dsh-integration.test.js --runInBand
```

预期：PASS，且现有默认采集测试仍断言不会因为读取推荐指标创建记忆文件。

## 任务 4：设置页采集状态可视化

**文件：**
- 修改：`client.js`
- 修改：`test/client.test.js`
- 参考：`memory-settings.js`

- [x] **步骤 1：增加客户端派生状态测试**

在 `test/client.test.js` 中断言 `definition.inject()` 仍只有六个 fields，同时新增：

```js
expect(injected.collection).toEqual(expect.objectContaining({
  automaticCollectionEnabled: true,
  enabledCount: 2
}));
expect(injected.collection.fields.trackPreferences).toEqual(expect.objectContaining({
  enabled: true,
  label: expect.stringContaining('开启')
}));
```

并断言 React 卡片包含 `collection-status`、`已开启` 或 `已暂停` 文案；checkbox 数量仍为六个。

- [x] **步骤 2：运行客户端测试确认失败**

运行：`npx jest test/client.test.js --runInBand -t "collection status"`

预期：FAIL，提示 `injected.collection` 或状态标记不存在。

- [x] **步骤 3：实现派生采集状态**

在 `client.js` 增加字段标签和 `readCollectionStatus(values)`：

```js
function readCollectionStatus(values) {
  const fields = SETTINGS_FIELDS.reduce((result, field) => {
    const enabled = values[field] === true;
    result[field] = {
      enabled,
      label: enabled ? '已开启' : '已暂停'
    };
    return result;
  }, {});
  const collectionFields = SETTINGS_FIELDS.filter((field) => field.startsWith('track'));
  const enabledCount = collectionFields.filter((field) => fields[field].enabled).length;
  return {
    fields,
    enabledCount,
    automaticCollectionEnabled: enabledCount > 0
  };
}
```

`createCardProps` 返回 `collection`；React 组件在 checkbox 上方渲染一个 `data-dsh-memory="collection-status"` 区域，显示总状态、启用数量和每个采集字段的标签。保留 writable/dirty/failed 文案与现有控件更新行为。

- [x] **步骤 4：增加可选指标摘要读取**

让 `readStatus(binding)` 安全读取 `status.recommendations`，只保留数值/`null`字段；`createCardProps` 将它作为 `recommendations` 返回。没有 host 指标时返回 `null`，不通过设置 schema 伪造数据。

在 React 卡片中有指标时显示请求数、上下文命中率和回退率；没有指标时显示“当前会话暂无推荐指标”。

- [x] **步骤 5：运行客户端测试确认通过**

运行：`npx jest test/client.test.js --runInBand`

预期：PASS，所有原有六控件、绑定更新和 disposal 测试继续通过。

## 任务 5：文档化指标和隐私边界

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`USAGE.md`

- [x] **步骤 1：增加 API 示例**

加入：

```js
const metrics = ctx.memory.getRecommendationMetrics();
console.log(metrics.contextMatchRate, metrics.fallbackRate);
```

说明指标是当前进程聚合值，不持久化、不上传、不包含 prompt、路径、推荐文本或用户采纳率。

- [x] **步骤 2：加入社区分类说明**

在功能/安装章节标出 `dsh-category-memory`，并链接 `COMMUNITY-SUBMISSION.md`，说明社区目录收录不等于官方认证。

- [x] **步骤 3：运行文档和 Markdown 检查**

运行：`git diff --check; npx jest test/community-registry.test.js --runInBand`

预期：PASS。

## 任务 6：完整验证与交接

**文件：**
- 读取：全部改动文件
- 不删除：任何现有用户记忆文件或测试产物

- [x] **步骤 1：运行完整 Jest**

运行：`npm test -- --runInBand`

预期：PASS。

- [x] **步骤 2：运行语法、安装和 pinned commit 验证**

运行：

```powershell
npm run check
npm run test:package
npm run test:pinned-commit
```

预期：全部 PASS；pinned commit 测试使用临时目录，完成后由测试自身清理。

- [x] **步骤 3：检查差异与敏感文件**

运行：`git diff --check; git status --short`

预期：只出现本计划列出的文档、代码和测试文件；`.dsh-memory.json`、`node_modules`、`coverage` 和测试报告不进入改动。

- [x] **步骤 4：尝试提交并记录权限结果**

运行：

```powershell
git add community/registry-entry.json COMMUNITY-SUBMISSION.md package.json README.md README.en.md INSTALL.md MANUAL-INSTALL.md USAGE.md memory-manager.js index.js client.js test docs/superpowers/plans/2026-08-23-p2-ecosystem-growth.md
git commit -m "feat: add P2 ecosystem and growth support"
```

预期：若 `.git` 仍只读，命令会报告 `index.lock: Permission denied`；保留工作区改动并在最终答复中明确未提交，不尝试删除 lock 或重置用户改动。

## 完成记录

- 计划内容已实现并合并到 `main`，功能提交为 `6fce10e`，pinned commit 文档同步提交为 `074ccbd`。
- `dsh-category-memory`、社区目录材料、设置页采集状态、推荐效果指标和 pinned commit 安装示例均已落地。
- 验证通过：19 个测试套件、221 个测试，另有 `npm run check`、`npm run test:pinned-commit`、`npm run test:package` 和 `git diff --check`。
- 社区目录已索引该插件；运行时兼容性验证仍由目录侧维护。
