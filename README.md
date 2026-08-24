# dsh-memory-plugin

> Intelligent memory system for DSH - Track user preferences, tool usage, and project context to provide personalized recommendations

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
[![DSH Plugin](https://img.shields.io/badge/DSH-plugin-purple.svg)](https://github.com/deepseek-ai/deepseek-harness)

<div align="center">

**简体中文** | [English](README.en.md)

</div>

---

## 🌟 简介

dsh-memory-plugin 是一个为 DeepSeek Harness (DSH) 设计的智能记忆系统插件。它能够自动学习用户的使用习惯、记住偏好设置、跟踪项目上下文，并基于这些数据提供个性化的智能推荐，显著提升开发效率和工作体验。

社区分类：`dsh-category-memory`。目录提交材料见 [COMMUNITY-SUBMISSION.md](COMMUNITY-SUBMISSION.md)；社区收录不构成官方认证。

## ✨ 核心功能

- **🎯 智能推荐引擎** - 基于历史数据自动推荐最适合的模型、Agent 和工具配置
- **📊 工具使用追踪** - 自动记录常用工具（read、write、edit、glob、grep 等）的使用频率
- **👤 偏好记忆** - 记住常用的 Agent、大模型、语言设置和代码风格
- **📁 项目上下文** - 跟踪活跃项目、访问历史和项目标签
- **💬 会话历史** - 记录讨论主题、完成的任务和工作模式
- **💾 持久化存储** - JSON 格式本地存储，支持自动保存、导入和导出
- **🔒 隐私保护** - 完全本地存储，无云端同步，用户完全掌控数据
- **🎨 Web 查看器** - 精美的可视化界面，直观展示记忆数据

## 🚀 快速开始

### 一键安装（推荐）

**Windows 用户：**

```bash
# 方式 1：双击运行
install.bat

# 方式 2：PowerShell
.\install.ps1
```

脚本会自动：
- 🔍 查找 DSH 配置目录
- 📦 复制或创建符号链接
- ✅ 验证安装结果

### 手动安装

#### 方式 1：作为本地插件

```bash
# 克隆仓库
git clone https://github.com/ly028716/dsh-memory-plugin.git

# 在 DSH profile 目录中添加
cd ~/.dsh/profiles
dsh plugin --profile <name> add /path/to/dsh-memory-plugin
```

#### 方式 2：通过 npm 包安装（推荐）

```bash
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin
cd <DSH_HOME>/profiles/<name>
pnpm exec dsh-memory-plugin doctor --profile <name> --fix
```

`doctor` 默认只读检查 DSH 共享 fallback 目录；请在该 profile 目录中通过 `pnpm exec` 运行。
Windows 上如果 DSH 报告某个受管包不是
junction，请显式执行上面的 `--fix`。它只会把物理目录移动到带时间戳的备份目录，不会删除
数据。GitHub pinned commit 安装仅用于 CI 和可复现验证，普通用户请使用 npm 包路径。

#### DSH CLI 兼容范围

插件兼容 DSH CLI `>=0.1.1-rc.2 <0.2.0`。真实安装测试会使用 npm packed tarball；GitHub
源代码安装测试必须锁定完整 40 位 commit SHA。

发布包安装与可复现的 pinned commit 安装都使用同一个 DSH 命令：

```bash
# npm 发布包（推荐）
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin

# GitHub pinned commit（CI/审计场景；替换为完整 40 位 SHA）
dsh plugin --profile <name> add "git+https://github.com/ly028716/dsh-memory-plugin.git#<commit-sha>"

# DSH 社区目录标准 spec（将占位符替换为完整 40 位 SHA）
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>
```

#### 发布维护者：发布后安装验证

本节只适用于维护者，不改变普通用户通过 npm 安装插件的流程。创建 tag Release 前，请在仓库
Secrets 中配置 `NPM_TOKEN`。发布流水线会先校验 tag 与 package version 一致、产出 tarball，再发布
npm 包，创建或复用草稿 GitHub Release；随后从 npm 与精确的 Release asset 分别进行隔离安装 smoke。
只有两条安装验证都通过，草稿 Release 才会公开。

smoke 会检查插件入口、DSH bundle patch、doctor CLI 和 viewer 资源。`GH_TOKEN` 由 GitHub Actions
提供，仅用于创建、下载和公开 GitHub Release；无需人工配置。

无需网络即可用同一个本地 tarball 模拟两个安装渠道：

```bash
npm pack --pack-destination dist
npm run test:release-install -- --version <package-version> --npm-tarball dist/<package-tarball>.tgz --github-tarball dist/<package-tarball>.tgz
```

#### 方式 3：直接集成到代码

```javascript
const memoryPlugin = require('./dsh-memory-plugin');

// 创建 DSH context
const ctx = {
  _services: {},
  effect(fn) { /* ... */ },
  provide(name, service) {
    this._services[name] = service;
  }
};

// 应用插件
memoryPlugin.apply(ctx, {
  storagePath: '.dsh-memory.json',
  trackToolCalls: true,
  enableRecommendations: true
});
```

插件初始化是异步的。首次读取持久化数据前可等待 `ctx.memory.ready`；写入 API 会自动等待初始化完成：

```javascript
await ctx.memory.ready;
const stats = ctx.memory.getStats();
```

### 基本使用

插件默认不会自动采集数据，也不会因为插件启动而创建记忆文件或增加会话计数。四个 `track*` 开关只控制自动采集；通过 `ctx.memory` 显式调用 API 仍会主动写入并持久化数据：

```javascript
// 获取智能推荐
const recs = ctx.memory.getRecommendations('coding');

// 设置偏好
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');
await ctx.memory.setPreference('preferredAgents', ['coding-assistant']);

// 记录会话
await ctx.memory.recordTopic('implement authentication');
await ctx.memory.addProject({
  path: '/projects/my-app',
  name: 'my-app',
  tags: ['react', 'typescript']
});

// 查看统计
const stats = ctx.memory.getStats();
console.log(stats);
```

### 默认采集语义

- `trackToolCalls`、`trackPreferences`、`trackProjectContext`、`trackSessionHistory` 默认均为 `false`，分别控制对应的自动采集路径。
- 默认启动只使用内存中的空白记忆，不创建 `.dsh-memory.json`，也不会记录 `metadata.totalSessions`。
- `setPreference()`、`recordTopic()`、`recordTask()`、`addProject()`、`storage.set()` 和 `importData()` 属于显式操作，即使自动采集开关关闭也会持久化。
- 只要打开任一自动采集开关，插件启动时就会加载或创建存储文件，并记录一次会话元数据。

### 数据迁移、备份与恢复

记忆文件会在加载时从旧版本自动迁移到当前数据版本。若主文件已存在，插件默认在启动迁移前将原始文件保存到 `.dsh-memory.json.backups/`；备份只保存在本地，并使用原子写入和私有文件权限。

```javascript
// 手动创建快照、查看快照并恢复指定快照
const snapshot = await ctx.memory.backup();
const backups = await ctx.memory.listBackups();
await ctx.memory.restoreBackup(snapshot.name);

// 按保留天数和数量清理过期快照
await ctx.memory.applyRetention();
```

恢复前会自动创建 `restore-safety` 快照，并先校验 JSON、大小限制和数据版本。默认保留最近 30 天且最多 10 份；只有同时超过时间和数量限制的快照才会被删除。

### DSH Agent prompt/tool 集成

在兼容的 DSH profile 中，插件会把本地记忆接入 Agent：

- `prompt context` 是只读、限长且经过脱敏的 `Memory context (user-controlled local memory):` 文本。它会在每次 prompt assembly 时读取最新显式记忆，因此 Agent 可以据此调整模型、工具或工作流建议；记忆内容仍属于用户控制的数据，不是系统指令。
- Agent 工具名为 `memory`，支持 `search`（按关键词/类别查询）、`remember`（写入 `preference`、`topic`、`task` 或 `project`）和 `forget`（清空全部记忆）。`remember` 是显式写入，即使默认自动采集关闭也会持久化。
- `forget` 只有在 `allowClearMemory: true` 时才允许，并且不接受过滤参数；若需要保留其他内容，请使用 `search`/导出后再由用户决定。默认自动采集仍关闭，四个 `track*` 开关不会因 Agent 工具注册而自动打开。

### DSH Web 设置卡

打开 DSH 的 `Settings > Plugins > Memory` 可实时调整六个设置：`trackToolCalls`、`trackPreferences`、`trackProjectContext`、`trackSessionHistory`、`enableRecommendations`、`allowClearMemory`。Web 设置依赖是可选的：安装了 DSH Web client 时显示设置卡；只有 CLI/Host 时，prompt、tool 和 `ctx.memory` API 仍可用。

设置卡会把四个自动采集开关显示为“已开启/已暂停”，并显示自动采集总状态和已开启项目数。若宿主提供当前会话的推荐指标，还会显示推荐请求数、上下文命中率和回退率；这些指标只在进程内聚合，不写入记忆文件。

```javascript
const metrics = ctx.memory.getRecommendationMetrics();
console.log(metrics.contextMatchRate, metrics.fallbackRate);
```

指标表示推荐覆盖和上下文命中情况，不代表用户点击或采纳率；插件不会记录 prompt、项目路径、推荐文本或上传遥测。

## ⚙️ 配置选项

```javascript
{
  // 存储文件路径（相对于工作区）
  storagePath: '.dsh-memory.json',

  // 本地备份目录；null 表示使用 <storagePath>.backups
  backupDir: null,
  backupOnInitialize: true,
  backupRetentionDays: 30,
  backupRetentionCount: 10,
  
  // 最大历史记录数量
  maxHistoryItems: 100,
  
  // 自动保存间隔（毫秒）
  autoSaveInterval: 5000,
  
  // 自动采集开关（默认关闭，需显式设置为 true）
  trackToolCalls: false,       // 追踪工具调用
  trackPreferences: false,     // 追踪用户偏好
  trackProjectContext: false,  // 追踪项目上下文
  trackSessionHistory: false,  // 追踪会话历史
  
  // 隐私设置
  encryptSensitiveData: false, // 兼容旧配置；自动脱敏始终启用
  allowClearMemory: true,      // 允许清除记忆
  
  // 智能功能
  enableRecommendations: true,           // 启用推荐
  patternRecognitionThreshold: 3         // 模式识别阈值
}
```

## 🎨 Web 查看器

插件提供了精美的 Web 界面来可视化记忆数据：

```bash
# 双击运行
open-viewer.cmd

# 或在浏览器中打开
viewer.html

# 需要更完整的可视化布局时
premium-viewer.html
```

查看器功能：
- 📊 数据概览卡片
- 🛠️ 工具使用统计图表
- 📁 项目管理列表
- 💬 会话历史时间线
- 🎯 智能推荐展示

## 📊 数据结构

记忆数据以 JSON 格式存储：

```json
{
  "version": "1.0.0",
  "userPreferences": {
    "defaultModel": "qwen3.7-plus",
    "language": "zh-CN",
    "preferredAgents": ["coding-assistant", "reviewer"]
  },
  "inputHabits": {
    "preferredTools": ["read", "write", "glob"],
    "commonCommands": [
      {"command": "pnpm run dev", "count": 45}
    ]
  },
  "projectContext": {
    "activeProjects": [
      {
        "path": "/projects/my-app",
        "name": "my-app",
        "tags": ["react", "typescript"],
        "lastAccessed": "2026-08-20T10:30:00Z"
      }
    ]
  },
  "sessionHistory": {
    "recentTopics": [
      {"content": "plugin development", "timestamp": "2026-08-20T10:00:00Z"}
    ],
    "toolUsageStats": {
      "read": 156,
      "write": 89,
      "edit": 67
    }
  },
  "metadata": {
    "createdAt": "2026-08-20T00:00:00Z",
    "totalSessions": 25,
    "lastSessionDate": "2026-08-20T10:30:00Z"
  }
}
```

## 🔒 隐私与安全

- ✅ **完全透明** - 所有数据存储在本地 JSON 文件中
- ✅ **用户控制** - 可以禁用任何追踪功能
- ✅ **数据所有权** - 数据完全属于用户，可随时导出或删除
- ✅ **无云端同步** - 所有数据仅存储在本地
- ✅ **可清除** - 可通过 `ctx.memory.clearMemory()` 清除插件记忆数据；查看器按钮仅清除浏览器缓存

## 🛠️ 项目结构

```
dsh-memory-plugin/
├── index.js              # 主入口文件
├── config.js             # 配置验证模块
├── storage.js            # 数据存储引擎
├── migrations.js         # 版本化数据迁移
├── data-lifecycle.js     # 备份、恢复与保留策略
├── memory-manager.js     # 核心记忆管理
├── package.json          # NPM 包配置
├── viewer.html           # 默认 Web 查看器
├── premium-viewer.html   # 专业版 Web 查看器
├── demo-viewer.html      # 演示版查看器
├── open-viewer.cmd       # 一键启动脚本
├── quick-start.js        # 快速生成示例数据
├── test/                 # 测试文件
│   ├── config.test.js
│   ├── storage.test.js
│   └── memory-manager.test.js
├── README.md             # 中文文档
├── README.en.md          # 英文文档
├── LICENSE               # MIT 许可证
└── CONTRIBUTING.md       # 贡献指南
```

## 🧪 测试

```bash
# 运行测试
npm test

# 安装 Chromium（首次运行或浏览器版本更新时执行）
npx playwright install chromium

# 运行真实 Chromium 浏览器 E2E
npm run test:browser-e2e

# 失败时查看 playwright-report/ 和 test-results/ 中的截图、trace 与报告

# 运行真实 DSH clean-profile E2E（未安装 dsh 时安全跳过；已安装但不兼容或 host probe 不可用会失败）
npm run test:dsh-e2e

# Windows 可显式指定本机 DSH；需要验证宿主时建议同时指定安装根目录
$env:DSH_BIN="$env:APPDATA\npm\dsh.cmd"
$env:DSH_PACKAGE_ROOT="$env:APPDATA\npm\node_modules\@deepseek-ai\dsh"
$env:DSH_E2E_REQUIRED="1"
npm run test:dsh-e2e

# 当前支持：DSH CLI >=0.1.1-rc.2 <0.2.0（已验证 0.1.1-rc.2）

# 运行快速演示
node quick-start.js

# 打开 Web 查看器
./open-viewer.cmd
```

## 💡 使用场景

### 场景 1：个性化助手

```javascript
// 根据用户偏好自动配置
const model = ctx.memory.getPreference('defaultModel');
const agents = ctx.memory.getPreference('preferredAgents');
// 自动使用用户喜欢的配置
```

### 场景 2：智能推荐

```javascript
// 编码时获取推荐
const recs = ctx.memory.getRecommendations('coding');
// 返回：推荐的 Agent、模型、项目等
```

### 场景 3：项目切换

```javascript
// 自动识别和记录项目
await ctx.memory.addProject({
  path: process.cwd(),
  name: 'current-project',
  tags: ['typescript', 'api']
});
```

## 🤝 贡献

欢迎贡献代码、报告问题或提出建议！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交改动 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

详见 [CONTRIBUTING.md](CONTRIBUTING.md)

## 📄 许可证

本项目采用 MIT 许可证 - 详见 [LICENSE](LICENSE) 文件

## 🙏 致谢

- [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) - 强大的 AI 开发助手框架

---

<div align="center">

**Made with ❤️ by ly028716**

[⭐ Star this repo](https://github.com/ly028716/dsh-memory-plugin) | [🐛 Report Bug](https://github.com/ly028716/dsh-memory-plugin/issues) | [💡 Request Feature](https://github.com/ly028716/dsh-memory-plugin/issues)

</div>
