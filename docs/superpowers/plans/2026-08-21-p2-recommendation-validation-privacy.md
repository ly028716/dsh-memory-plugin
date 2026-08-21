# P2 推荐、校验与脱敏加固实现计划

> **面向 AI 代理的工作者：** 在当前会话内联执行；每项先添加失败回归测试，再实现最小修复并运行相关测试。

**目标：** 让推荐上下文和阈值配置真正生效，统一嵌套路径错误，并消除敏感字段脱敏误杀。

**架构：** 不改变 JSON 存储结构和 Service 返回结构。推荐逻辑在 `MemoryManager` 内完成，路径保护留在 `MemoryStorage`，字段识别集中在 `privacy.js`。

**技术栈：** Node.js CommonJS、Jest 29、JSON 文件存储。

---

### 任务 1：推荐上下文和阈值

**文件：**
- 修改：`memory-manager.js:240-292`
- 测试：`test/memory-manager.test.js`

- [x] 编写失败测试：上下文只优先返回匹配的命令/项目；无匹配时回退通用推荐；低于 `patternRecognitionThreshold` 的命令不进入推荐。
- [x] 运行 `npx jest test/memory-manager.test.js --runInBand`，确认失败原因是当前实现忽略 `context` 和阈值。
- [x] 实现小写 trim 上下文匹配、阈值过滤和无匹配回退，不改变推荐对象字段。
- [x] 运行同一测试确认通过。

### 任务 2：统一嵌套路径错误

**文件：**
- 修改：`storage.js:360-381`
- 测试：`test/storage.test.js`、`test/memory-manager.test.js`

- [x] 编写失败测试：对 `userPreferences.defaultModel.foo` 写入时，断言抛出 `Cannot set nested storage path`，而不是原生 `TypeError`。
- [x] 运行相关测试确认当前实现暴露原生错误。
- [x] 在 `MemoryStorage.set()` 遍历中间节点时检查对象类型，拒绝 `null`、数组和基本类型节点。
- [x] 运行存储和 Manager 回归确认通过。

### 任务 3：收窄字段脱敏匹配

**文件：**
- 修改：`privacy.js:10-56`
- 测试：`test/privacy.test.js`

- [x] 编写失败测试：`author`、`oauthProvider` 保持原值；`auth`、`authToken`、`authorization` 和 `AWS_SECRET_ACCESS_KEY` 继续脱敏。
- [x] 运行隐私测试确认当前宽泛 `auth` 子串规则误脱敏。
- [x] 实现字段分词和完整 token 匹配，保留现有字符串命令脱敏规则。
- [x] 运行隐私全量回归确认通过。

### 任务 4：全量质量门禁

**文件：**
- 检查：`package.json`、`.github/workflows/ci.yml`

- [x] 运行 `npm.cmd test -- --runInBand`。
- [x] 运行 `npm.cmd run check`、`npm.cmd run test:integration`、`npm.cmd run test:install` 和 `npm.cmd run test:quick`。
- [x] 运行 `git diff --check` 并检查工作区只包含本次 P2 变更。
- [x] 更新计划状态并报告测试结果与遗留风险。
