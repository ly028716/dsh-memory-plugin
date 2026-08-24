# P2 生态和增长设计

## 目标

为现有 `@ly028716/dsh-memory-plugin` 补齐社区发现、可复现安装、推荐质量可观测性和采集状态可视化能力。`dsh-category-memory` 是现有插件的社区分类/检索标识，不创建第二个插件包。

## 范围

- 新增社区目录提交材料，声明插件身份、`memory` 分类、`dsh-category-memory` tag、来源、安装方式、兼容性和验证证据。
- 在中英文安装文档中提供完整 40 位 commit SHA 的 GitHub pinned commit 安装示例。
- 为推荐 API 增加隐私安全的运行时聚合指标，不记录提示词、项目路径、推荐内容或用户行为原文。
- 扩展现有 DSH Web 设置卡，显示各自动采集开关的可视状态、总采集状态和推荐指标摘要。

不包含：独立 `dsh-category-memory` 包、自动向外部 GitHub 仓库创建 PR、采纳率/点击率埋点、记忆文件格式迁移或新的外部服务。

## 方案

### 社区目录提交包

新增 `community/registry-entry.json` 作为机器可读提交材料，使用社区目录通用字段：稳定 `id`、名称、版本、描述、作者、许可证、`category`、`tags`、DSH 兼容范围、npm/GitHub 安装信息、仓库地址、验证状态和证据链接。`dsh-category-memory` 出现在 `tags` 中，`category` 使用 `memory`，避免把检索标签和插件形态混为一谈。

新增 `COMMUNITY-SUBMISSION.md` 说明提交目标、目录字段映射、审核证据、验证命令和人工提交步骤。提交材料不声明官方认证，不写入动态 star 或未经验证的社区排名。

### pinned commit 安装

`README.md`、`README.en.md`、`INSTALL.md` 和 `MANUAL-INSTALL.md` 增加同一条 DSH 安装命令：

```bash
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
```

文档明确完整 SHA 是可复现安装要求，`<40-character-commit-sha>` 必须替换为实际 commit；仓库已有 `test:pinned-commit` 负责验证安装后入口和 bundle patch。

### 推荐指标

`MemoryManager` 增加进程内指标状态，初始化为：

- `requests`：调用推荐 API 的次数。
- `availableRequests`：推荐功能开启并返回可用结果的次数。
- `contextualRequests`：带非空上下文的请求次数。
- `contextMatches`：至少命中一个上下文相关命令或项目的请求次数。
- `fallbackRequests`：带上下文但没有上下文命中、使用通用候选回退的次数。
- `suggestions`：返回的 suggestion 数量累计值。
- `contextMatchRate`：`contextMatches / contextualRequests`，没有上下文请求时为 `null`。
- `fallbackRate`：`fallbackRequests / contextualRequests`，没有上下文请求时为 `null`。
- `patternRecognitionThreshold`：本次计算使用的命令识别阈值。

指标只在内存中存在，通过 `getRecommendationMetrics()` 和 `getStats().recommendations` 暴露；禁用推荐时请求仍不计入可用请求。由于没有用户采纳事件，不定义或伪造点击率/采纳率。

推荐结果保持现有 `available` 与 `suggestions` 字段兼容。上下文匹配和回退的判定沿用当前命令/项目推荐逻辑，推荐功能关闭或存储未初始化时返回稳定的零值/空值指标。

### 设置页状态

保留 `dsh-memory` settings namespace 的六个可编辑布尔字段，不把只读指标写入设置 schema。`client.js` 在设置卡中根据绑定值派生：

- 每个采集开关的 `enabled` 状态和“已开启/已暂停”文案。
- `automaticCollectionEnabled` 与 `enabledCount`。
- 原有 `writable`、`dirty`、`failed` 状态。
- 可选的推荐指标摘要；没有运行时指标时显示安全的空状态。

这样状态是用户可见的，但不会因打开设置页而触发采集，也不会把运行时数据写回用户设置文档。现有六个 checkbox 的更新行为保持不变。

## 数据流与错误处理

推荐调用 → 统计请求/命中/回退 → 返回兼容推荐结果；指标 getter 返回深拷贝或新对象，调用方不能修改内部状态。所有比率使用有限数值，分母为零返回 `null`。

设置绑定 → 读取布尔值和 host binding 状态 → 派生采集状态 → React 设置卡渲染。绑定读取失败时回退到关闭状态和空指标，不抛出异常；更新仍沿用现有 `update`/`set` 兼容路径。

社区材料是静态 JSON/Markdown；新增契约测试校验必要字段、完整 SHA 占位说明、分类 tag 和安全声明。

## 测试策略

- `memory-manager.test.js`：指标累计、上下文命中、回退、关闭推荐和比率零分母。
- `index.test.js` / `dsh-integration.test.js`：服务暴露 `getRecommendationMetrics()`，统计包含推荐指标且不改变默认采集语义。
- `client.test.js`：设置卡展示六个采集状态、总状态和指标摘要，保持六个 checkbox 与绑定状态兼容。
- 新增社区目录契约测试：验证 JSON 字段、分类 tag、安装命令、验证证据与安全边界。
- 完成后运行 `npm test -- --runInBand`、`npm run check`、`npm run test:pinned-commit`、`npm run test:package`、`git diff --check`。
