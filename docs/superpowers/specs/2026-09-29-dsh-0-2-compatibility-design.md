# DSH 0.2 兼容设计

## 目标

让 `@ly028716/dsh-memory-plugin` 与本机 DeepSeek Harness `0.2.0-rc.2` 兼容，并保留对已声明 `0.1.1-rc.2` 起始版本的支持。

## 范围

本次迁移调整插件元数据、真实 DSH E2E 的 CLI 调用适配和相关测试、安装文档。不会改变记忆数据格式、自动采集开关或公开 `ctx.memory` API。

## 兼容契约

`package.json` 的 DSH CLI 兼容范围改为 `>=0.1.1-rc.2 <0.3.0`。这是一个明确的主版本上界：`0.1.x` 和 `0.2.x` 在本仓库的 E2E 覆盖范围内，`0.3.0` 及以上必须重新评估后才能声明兼容。

插件继续使用 `tools/result`、`session/event`、`ctx.tools.register()`、`ctx.systemPrompt.context()` 及 `@deepseek-ai/dsh/profile-boot`。这些接口已在 `0.2.0-rc.2` 源码中确认存在。

## CLI 适配

E2E 需要接受三种 CLI 来源：

1. PATH 中的 `dsh` 或 `dsh.cmd`；
2. `DSH_BIN` 指向 `.cmd` 可执行文件；
3. `DSH_BIN` 指向源码或构建产物的 `.js` CLI。

对于 `.js` 入口，E2E 用正在运行测试的 Node.js 作为命令，并将该入口作为第一个参数。其他命令路径保持原逻辑。`DSH_PACKAGE_ROOT` 仍可指定与 CLI 匹配的 `@deepseek-ai/dsh` package 根目录，用于真实 profile boot 探针。

## 验证

新增单元测试覆盖 `.js` CLI 调用包装与 `0.2.0-rc.2` 兼容判断。真实 E2E 使用：

```powershell
$env:DSH_BIN = 'E:\IDEWorkplaces\GitHub\deepseek-harness\apps\cli\lib\bin.js'
$env:DSH_PACKAGE_ROOT = 'E:\IDEWorkplaces\GitHub\deepseek-harness\apps\cli'
npm run test:dsh-e2e
```

验收包括临时 profile 安装、配置导出、Prompt 上下文、memory 工具、profile 启动和清理。另执行 Jest、语法检查及 `.tgz` 安装验证。

## 风险和边界

DSH `0.2.0-rc.2` 仍是预发布版本，后续 `0.3.0` 不会自动纳入兼容范围。若真实 E2E 暴露 profile 配置或 host boot API 变化，应以最小适配调整 E2E 或插件集成代码，并增加针对该变更的回归测试。
