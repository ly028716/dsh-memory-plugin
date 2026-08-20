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
dsh plugin add /path/to/dsh-memory-plugin
```

#### 方式 2：直接集成到代码

```javascript
const memoryPlugin = require('./dsh-memory-plugin');

// 创建 DSH context
const ctx = {
  _services: {},
  effect(fn) { /* ... */ },
  registerService(name, service) {
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

### 基本使用

插件加载后会自动开始追踪，你也可以通过 API 主动管理：

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

## ⚙️ 配置选项

```javascript
{
  // 存储文件路径（相对于工作区）
  storagePath: '.dsh-memory.json',
  
  // 最大历史记录数量
  maxHistoryItems: 100,
  
  // 自动保存间隔（毫秒）
  autoSaveInterval: 5000,
  
  // 追踪开关
  trackToolCalls: true,        // 追踪工具调用
  trackPreferences: true,      // 追踪用户偏好
  trackProjectContext: true,   // 追踪项目上下文
  trackSessionHistory: true,   // 追踪会话历史
  
  // 隐私设置
  encryptSensitiveData: false, // 加密敏感数据（预留）
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
- ✅ **可清除** - 一键清除所有记忆数据

## 🛠️ 项目结构

```
dsh-memory-plugin/
├── index.js              # 主入口文件
├── config.js             # 配置验证模块
├── storage.js            # 数据存储引擎
├── memory-manager.js     # 核心记忆管理
├── package.json          # NPM 包配置
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
