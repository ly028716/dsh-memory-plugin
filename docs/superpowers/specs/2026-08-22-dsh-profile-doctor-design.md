# DSH profile doctor 设计

**日期：** 2026-08-22  
**状态：** 已确认，待实现  
**范围：** 插件端缓解 DSH Windows profile fallback 目录冲突

## 背景

DSH CLI `0.1.1-rc.2` 在启动 profile 前会检查共享目录
`<DSH_HOME>/profiles/node_modules`。当受管包路径是普通目录而不是 junction/symbolic link
时，DSH 会直接终止启动。该检查发生在插件运行之前，因此插件的 Cordis 代码、bundle patch
和运行时初始化都无法修复它。

真实测试已经确认：

- npm tarball 可以安装插件，且包含 Web 查看器和 `cordis.patch.yml`；
- GitHub pinned commit 可以安装插件；
- npm 安装路径仍可能在 DSH 启动阶段卡住，不能单独作为该问题的修复；
- 直接自动修改 DSH 目录的 `postinstall` 不可靠，且可能被 pnpm 阻止。

因此增加一个由插件提供的、显式执行的 profile doctor，在 DSH 启动前检查并安全隔离冲突目录。

## 目标

1. 为 Windows DSH 用户提供可复现的前置修复命令。
2. 只处理 DSH 共享 fallback 目录，不修改工作区、记忆数据或插件源码。
3. 修复过程可审计、可恢复，不直接删除用户文件。
4. 用真实临时 `DSH_HOME` 覆盖扫描、修复、安装和启动链路。
5. 统一文档中的用户安装命令：npm 为主路径，GitHub pinned commit 仅用于 CI/复现。

## 非目标

- 不修改 DSH CLI 本身，也不伪造 junction。
- 不在 `postinstall`、`prepare` 或插件加载时隐式修改用户目录。
- 不清理或覆盖 `.dsh-memory.json`、profile 配置、插件包或全局 npm 安装。
- 不承诺绕过 DSH 其他版本的未知 profile 管理策略。

## 用户界面

插件发布包新增命令：

```text
dsh-memory-plugin doctor --profile <name>
dsh-memory-plugin doctor --profile <name> --fix
```

可选参数：

```text
--dsh-home <path>   覆盖 DSH_HOME，主要用于 CI 和测试
--json              输出机器可读结果
--help              显示帮助
```

默认模式只检查并报告，不改变文件。`--fix` 模式将冲突的普通目录移动到：

```text
<DSH_HOME>/profiles/.dsh-memory-plugin-repair/<UTC timestamp>/node_modules/...
```

移动成功后由 DSH 在下一次 profile 启动时重新创建 junction。命令会二次扫描；仍有冲突、权限
不足或移动失败时返回非零退出码。

用户主路径：

```text
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin
dsh-memory-plugin doctor --profile <name> --fix
dsh --profile <name>
```

可复现 CI 路径继续使用完整 pinned commit，不使用浮动分支或未锁定 Git URL。

## 设计

### 路径解析

解析优先级为：命令行 `--dsh-home`、环境变量 `DSH_HOME`、Windows 用户目录下的 `.dsh`。
profile 目录固定为 `<dsh-home>/profiles/<profile>`，检查根目录固定为
`<dsh-home>/profiles/node_modules`。

不扫描 profile 私有的 `profiles/<profile>/node_modules`，避免将插件自身的安装布局误判为
DSH fallback 冲突。

### 冲突识别

扫描共享 `node_modules` 的包叶节点：

- 普通包：`node_modules/<package>`；
- scoped 包：`node_modules/@scope/<package>`；
- symbolic link、junction 和不存在的路径视为正常；
- 普通目录和普通文件视为冲突；
- `.pnpm`、`.modules.yaml` 等管理元数据不作为包叶节点处理；
- 目录不存在时报告 profile 尚未初始化，但不执行修复。

扫描结果至少包含相对路径、类型、是否可移动和失败原因，支持文本和 JSON 两种输出。

### 修复与备份

`--fix` 使用同一 profile 的专用备份根目录，保持相对路径结构。每次修复使用新的 UTC 时间戳
目录，并写入 manifest，记录原路径、备份路径、文件类型和时间。

修复规则：

1. 只移动扫描确认的冲突叶节点；
2. 目标备份路径已存在时立即失败，不覆盖已有备份；
3. 使用原子 rename/move，失败则保留原路径并继续报告其他项；
4. 不删除任何文件；
5. 修复后重新扫描，只有零个冲突时才返回成功。

### 安全边界

- 所有待移动路径必须解析后仍位于 `<DSH_HOME>/profiles/node_modules` 内；
- 备份路径必须位于 `<DSH_HOME>/profiles/.dsh-memory-plugin-repair` 内；
- 拒绝路径穿越、根目录本身、scope 根目录和符号链接目标的递归移动；
- 默认不执行修复，必须显式传入 `--fix`；
- 不调用 shell，不执行 pnpm/npm，不修改全局目录。

## 代码结构

新增独立模块，保持纯逻辑与文件操作可测试：

- `profile-doctor.js`：参数解析、路径解析、扫描、备份移动、结果输出；
- `bin/dsh-memory-plugin.js`：仅负责 CLI 入口和退出码；
- `package.json`：增加 `bin` 映射，并确保 bin 文件进入 npm tarball。

现有插件运行入口 `index.js`、存储语义和 bundle patch 不改变。

## 测试方案

### 单元测试

- DSH_HOME/profile 路径优先级；
- 普通包、scoped 包、junction 和元数据识别；
- 路径越界拒绝；
- dry-run 不改文件；
- 备份 manifest 内容；
- 目标冲突、权限错误和二次扫描失败的退出码。

### 集成测试

使用临时目录构造共享 `node_modules`，覆盖：

1. 纯 junction profile：doctor 返回成功；
2. 混合普通目录和 junction：`--fix` 只移动普通目录；
3. 备份可见且原文件未被删除；
4. 重复执行具有幂等性。

### 真实 DSH E2E

`test:dsh-e2e` 增加 doctor 阶段：

1. 创建全新临时 `DSH_HOME`；
2. 通过 npm packed tarball 安装插件；
3. 人工创建一个受管包的普通目录，模拟 Windows fallback 冲突；
4. 执行 `dsh-memory-plugin doctor --profile clean --fix`；
5. 验证普通目录已进入备份且共享路径不再是物理目录；
6. 执行 DSH 配置/启动探测，捕获明确的退出码、超时和 stderr；
7. 清理本次临时目录及残留 DSH 子进程。

GitHub pinned commit 安装测试保留，用于验证源代码安装路径，不作为普通用户推荐命令。

## 发布与文档

- README、INSTALL、英文文档和安装脚本统一 npm 安装命令；
- 明确 doctor 是 Windows DSH profile 冲突的前置步骤；
- 明确兼容 DSH CLI `>=0.1.1-rc.2 <0.2.0`；
- npm tarball 检查必须包含 CLI、查看器、patch 和运行时文件；
- release workflow 增加 npm 发布前的 pack、doctor 集成测试和兼容性检查；
- GitHub release 保留 pinned commit 验证，不把未发布的 npm 版本写入文档。

## 验收标准

以下条件全部满足才视为完成：

1. `npm test`、安装/打包/兼容性测试全部通过；
2. doctor 默认只读，`--fix` 不删除文件并生成 manifest；
3. 临时 DSH profile 的物理目录冲突可被 doctor 安全隔离；
4. npm packed tarball 的 doctor 命令可执行；
5. 真实 DSH E2E 能区分成功、超时和 DSH 自身失败，并且不会留下测试进程；
6. README 和安装命令与实际行为一致；
7. GitHub pinned commit 测试继续通过。
