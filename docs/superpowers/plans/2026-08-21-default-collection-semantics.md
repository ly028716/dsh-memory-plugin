# 默认采集语义实现计划

> **面向 AI 代理的工作者：** 本计划在当前会话内联执行；按 TDD 先写失败测试，再实现最小变更。

**目标：** 让默认配置不因插件启动而落盘或增加会话计数，同时允许显式记忆 API 持久化。

**架构：** `MemoryStorage.initialize()` 增加可选的非持久化初始化模式；`MemoryManager.initialize()` 仅在自动采集开启时记录会话元数据。显式 API 去除不必要的自动采集开关短路，但工具事件监听继续受 `trackToolCalls` 控制。

**技术栈：** Node.js CommonJS、Jest 29、JSON 文件存储、DSH Cordis 插件接口。

---

### 任务 1：测试默认启动与显式写入语义

**文件：**
- 修改：`test/index.test.js`
- 修改：`test/memory-manager.test.js`
- 修改：`test/storage.test.js`

- [x] 增加测试：默认插件 ready 后目标文件不存在、会话统计为零、工具监听器为空。
- [x] 增加测试：默认配置下 `setPreference`、`recordTopic`、`addProject` 可以写入并在新实例中读回。
- [x] 增加测试：`MemoryStorage.initialize({ persistIfMissing: false })` 初始化内存默认值但不创建文件。
- [x] 运行相关 Jest 测试并确认它们因当前实现不满足语义而失败。

### 任务 2：实现初始化和 API 语义

**文件：**
- 修改：`storage.js`
- 修改：`memory-manager.js`

- [x] 为存储初始化增加 `persistIfMissing` 选项，非持久化模式加载默认数据但不标记 dirty、不保存。
- [x] 让管理器根据四个自动采集开关决定启动是否持久化和记录会话元数据。
- [x] 保留 `recordToolCall` 的自动采集开关保护。
- [x] 让显式偏好、主题/任务和项目 API 在默认配置下执行持久化。

### 任务 3：同步文档和示例

**文件：**
- 修改：`README.md`
- 修改：`README.en.md`
- 修改：`USAGE.md`
- 修改：`INSTALL.md`

- [x] 说明默认启动不创建记忆文件、不记录会话计数。
- [x] 说明四个 `track*` 开关只控制自动采集。
- [x] 说明显式 API 会主动持久化，并补充默认配置下的示例。

### 任务 4：验证

**文件：**
- 无新增文件

- [x] 运行 `npm test -- --runInBand`。
- [x] 运行 `npm run check`、`npm run test:integration`、`npm run test:install`、`npm run test:package`。
- [x] 使用隔离 `codex-memory-e2e` profile 执行 `--dump-config` 和启动/退出回归。
- [x] 确认 `git status` 只包含本次预期修改。
