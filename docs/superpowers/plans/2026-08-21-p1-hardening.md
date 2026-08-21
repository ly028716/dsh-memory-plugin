# P1 安全与可靠性加固实现计划

> **面向 AI 代理的工作者：** 使用本计划逐项实现；每项先添加失败回归测试，再实现最小修复并运行相关测试。

**目标：** 按 P1 顺序加固 DSH Memory Plugin 的生命周期、存储、隐私、并发和发布链路。

**技术栈：** Node.js CommonJS、Jest 29、GitHub Actions、JSON 文件存储。

---

### 任务 1：修复 Service 初始化竞态

**文件：**
- 修改：`index.js`
- 修改：`memory-manager.js`
- 测试：`test/index.test.js`、`test/memory-manager.test.js`

- [x] 添加测试：插件初始化未完成时调用 `getStats`、写入 API 不抛出未初始化错误；`memory.ready` 完成后能读取真实数据。
- [x] 运行相关测试，确认当前实现失败。
- [x] 增加统一初始化 Promise；写入操作等待初始化；同步读取返回安全空状态；Service 暴露 `ready`。
- [x] 运行相关测试并确认通过。

### 任务 2：修复原型污染和输入边界

**文件：**
- 修改：`storage.js`
- 修改：`config.js`
- 修改：`memory-manager.js`
- 测试：`test/storage.test.js`、`test/config.test.js`、`test/memory-manager.test.js`

- [x] 添加危险路径、非法配置和非法项目/偏好输入测试。
- [x] 运行测试确认当前实现失败。
- [x] 拒绝危险路径段；校验有限整数、最大值和用户输入对象。
- [x] 运行存储与配置回归。

### 任务 3：封闭显式数据管理的隐私绕过

**文件：**
- 修改：`index.js`
- 修改：`memory-manager.js`
- 测试：`test/memory-manager.test.js`

- [x] 添加 `importData` 和公开 `storage.set` 的原文不落盘测试。
- [x] 运行测试确认当前实现失败。
- [x] 在 Manager 导入边界和 Service 存储写入边界统一脱敏。
- [x] 运行隐私与持久化回归。

### 任务 4：补全敏感数据脱敏规则

**文件：**
- 修改：`privacy.js`
- 测试：`test/privacy.test.js`、`test/memory-manager.test.js`

- [x] 添加 curl basic auth、npm auth token、AWS access key ID 和 auth 字段测试。
- [x] 运行测试确认当前实现失败。
- [x] 扩展规则并确保命令结构保留、原文消失。
- [x] 运行全量隐私回归。

### 任务 5：增强文件权限和跨进程保存

**文件：**
- 修改：`storage.js`
- 测试：`test/storage.test.js`

- [x] 添加临时文件权限、锁超时恢复、并发保存和 JSON 完整性测试。
- [x] 运行测试确认当前实现缺少保护。
- [x] 增加最小权限、排他锁、锁超时恢复、`sync` 和原子替换。
- [x] 运行存储全量回归。

### 任务 6：增加锁文件和 CI 发布验证

**文件：**
- 创建：`package-lock.json`
- 创建：`.github/workflows/ci.yml`
- 修改：`package.json`
- 修改：`README.md`、`README.en.md`

- [x] 生成锁文件并确认 `npm ci` 可用。
- [x] 添加 CI 命令覆盖 Jest、语法、DSH 集成、安装和快速测试。
- [x] 更新发布说明和本地验证命令。
- [x] 运行与 CI 等价的本地检查。

### 任务 7：最终质量门禁

- [x] 运行全量 Jest 和覆盖率。
- [x] 运行 DSH 集成、安装、快速测试。
- [x] 运行语法、`git diff --check`、秘密模式和依赖检查。
- [x] 复核 diff、更新计划状态并报告遗留风险。
