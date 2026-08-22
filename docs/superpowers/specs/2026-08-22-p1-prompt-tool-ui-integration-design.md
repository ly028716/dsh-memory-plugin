# P1-1 DSH Prompt/Tool/UI 集成设计

## 背景

当前插件已经提供 `ctx.memory` 服务、持久化存储、推荐计算和独立 Web 查看器，但这些能力尚未接入 DSH Agent 的请求组装、模型工具面和 DSH Web 设置界面。因此记忆数据不会自动影响 Agent 的下一步行为，用户也无法在 DSH UI 中配置采集策略或管理记忆。

本任务面向 DSH CLI `>=0.1.1-rc.2 <0.2.0`，以本机已验证的 `0.1.1-rc.2` 扩展契约为基准。

## 目标与非目标

### 目标

1. 将可用记忆以动态 prompt context 注入每次 Agent 请求。
2. 暴露一个受限的 `memory` Agent tool，让 Agent 可以查询、保存和删除明确授权的记忆。
3. 提供 DSH Web Plugins 设置页中的 Memory 配置卡片。
4. 在不具备新 DSH capability 的 mock 或旧宿主中安全降级，保持现有 `ctx.memory` API 兼容。
5. 保持默认自动采集关闭、敏感数据脱敏和本地存储边界。

### 非目标

- 不实现独立的会话内记忆面板。
- 不改变现有独立 HTML 查看器的职责。
- 不开启默认自动采集。
- 不把记忆数据上传到云端。
- 不引入与 P1-1 无关的存储格式重构。

## DSH 契约

主插件使用 DSH host capability detection：

- `ctx.systemPrompt.context({ name, order, text })` 注册动态模型上下文；
- `ctx.tools.register(definition)` 注册模型工具；
- Tool 执行通过 `exec.deferContext(userMessage)` 将查询或写入结果加入后续 Agent 上下文；
- `ctx.settings.register(namespace, schema, options)` 注册可配置的用户设置命名空间；
- 包通过 `dsh.client` 元数据和 `./client` export 提供可选 Web half；Web half 在设置 Plugins 页面注册对应 slot。

所有 capability 都是可选的。缺少 capability 时仅跳过对应集成并记录一次诊断，不阻塞 `ctx.memory` 服务和插件清理。

## 架构

### 记忆上下文构建器

新增独立模块负责把 `MemoryManager` 的数据投影为模型可见文本。输入为当前内存快照和可选的调用上下文，输出为：

- 有数据时：带稳定标题、分类和条目上限的文本；
- 无数据时：空字符串；
- 任何字符串字段先经过现有脱敏逻辑，再经过长度限制。

该模块只读，不直接写存储，方便纯单元测试和未来替换渲染格式。

### Agent tool

新增独立 tool 定义模块，工具名固定为 `memory`，参数使用 DSH 支持的 JSON Schema。操作采用单工具 `action` 分派，避免向模型暴露过多持久化细节：

- `search`：关键词和可选类别，返回有限条匹配记忆；
- `remember`：类别、键/内容和值，明确写入偏好、主题、任务或项目信息；
- `forget`：类别和关键词，删除匹配的可清除记忆；若 `allowClearMemory` 为 `false`，返回结构化拒绝结果。

工具只接受 JSON-compatible 数据，执行失败转换为 `isError` 结果而不抛出到 Agent 主循环。成功结果通过 `deferContext` 形成下一步可见的 user-role context；工具本身不会把完整存储文件暴露给模型。

### Settings host 集成

新增一个 DSH settings namespace，命名空间使用插件短名 `dsh-memory`，字段只包含配置项，不包含记忆内容：

- `trackToolCalls`
- `trackPreferences`
- `trackProjectContext`
- `trackSessionHistory`
- `enableRecommendations`
- `allowClearMemory`

Settings 采用 `live` 生效策略。现有 `validateConfig` 仍是配置的最终校验入口；settings watch 负责更新当前运行实例的采集/推荐策略。存储路径和历史数据不通过 Web UI 编辑。

### Web client half

新增 `client.js` 与客户端入口声明，依赖 DSH Web settings/runtime/locale 能力，在 `settings.plugin.item` keyed slot 下注册 Memory 卡片。卡片负责：

- 展示当前 namespace 是否可用及统计摘要；
- 编辑四个采集开关和推荐/清除开关；
- 保存和撤销草稿；
- 调用受支持的 Host API 执行导出或清除，并展示成功/失败状态。

没有 DSH Web bundle 或缺少 slot 运行时注册时，客户端 half 不执行副作用；主包 host half 仍可启动。

## 数据流

```text
本地 memory storage
        │
        ├── Memory context builder ──> systemPrompt.context ──> Agent request
        │
        ├── memory tool search/remember/forget
        │          └── deferContext ──> 下一步 Agent context
        │
        └── memory service ──> settings namespace ──> DSH Web settings card
```

## 隐私与安全

- 默认四个自动采集开关继续为 `false`。
- Prompt 和 tool 输出都经过 `redactSensitiveData`，并限制条目数与文本长度。
- 工具不支持任意路径读写，不返回完整 token、密钥或原始存储文件。
- `forget` 遵守 `allowClearMemory`；清除失败不吞掉用户可见错误。
- UI 只读统计和配置，不直接访问 `.dsh-memory.json`。
- 所有监听器、tool、prompt section/context、settings 注册都绑定 Cordis effect，插件卸载时释放。

## 错误处理与降级

- 缺少 `ctx.systemPrompt`：跳过 prompt 集成。
- 缺少 `ctx.tools`：跳过 tool 注册。
- 缺少 `ctx.settings`：使用启动配置，不注册 settings namespace。
- 记忆初始化失败：既有 `ready` 错误语义保持不变；prompt/tool 请求返回安全的空/错误结果，不让宿主崩溃。
- 单次 prompt provider、tool 执行或 settings watcher 失败不得阻塞 DSH 主循环。
- 版本不满足 `package.json.dsh.compatibility.cli` 时不启用未经验证的 UI API。

## 测试策略

按 TDD 顺序新增测试并先观察失败：

1. context builder：空输入、分类输出、长度上限、敏感字段脱敏。
2. host prompt 集成：注册、动态读取、空段省略、无 capability 降级和清理。
3. memory tool：search/remember/forget、参数校验、权限拒绝、结果脱敏和 `deferContext`。
4. settings：namespace/schema 元数据、配置 watch 和无 settings capability 降级。
5. client：package metadata、client export、slot 注册和不可用 runtime 安全返回。
6. 现有 Jest 全量测试、npm pack/install、pinned commit 测试和真实 DSH clean-profile E2E 回归。

## 验收标准

- DSH Agent 请求组装能够看到非空记忆上下文，并且空记忆不增加空 prompt 段。
- DSH Agent 能调用 `memory` tool 查询和显式写入记忆，结果可影响后续步骤。
- DSH Web Plugins 设置页能显示并保存 Memory 配置卡片；没有 Web client 组合时主插件仍正常运行。
- 默认自动采集、敏感数据保护、清理机制和现有兼容性测试无回归。
- 全量测试、打包测试和真实 DSH E2E 均通过。
