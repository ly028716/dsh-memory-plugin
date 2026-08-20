# dsh-memory-plugin

> Intelligent memory system for DSH - Track user preferences, tool usage, and project context to provide personalized recommendations

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)

一个智能记忆系统插件，用于记录用户的使用习惯、偏好设置和上下文信息，提供个性化推荐和改善开发体验。

## ✨ 功能特性

- **工具使用追踪**：自动记录常用工具和命令
- **偏好记忆**：记住常用的 Agent、大模型和设置
- **项目上下文**：跟踪活跃项目和访问历史
- **会话历史**：记录讨论主题和频繁任务
- **智能推荐**：基于历史数据提供个性化建议
- **持久化存储**：自动保存，支持导入导出
- **隐私控制**：完全可控的数据追踪选项

## 📦 安装

### 作为本地插件安装

```bash
# 在 DSH profile 目录中
dsh plugin add ../memory-plugin
```

### 作为 npm 包安装（未来支持）

```bash
dsh plugin add dsh-memory-plugin
```

## ⚙️ 配置

在 `dsh.config.js` 或插件配置中添加：

```javascript
{
  memory: {
    // 存储文件路径（相对于工作区）
    storagePath: '.dsh-memory.json',
    
    // 最大历史记录数量
    maxHistoryItems: 100,
    
    // 自动保存间隔（毫秒）
    autoSaveInterval: 5000,
    
    // 追踪选项
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
}
```

## 🚀 使用方法

### 基本使用

插件加载后会自动开始追踪，无需额外配置：

```javascript
// 插件会自动记录：
// - 工具调用（如 read, write, edit, glob, grep 等）
// - 常用命令
// - 项目访问历史
// - 会话主题
```

### API 使用

通过 DSH 上下文访问记忆服务：

```javascript
// 获取推荐
const recommendations = ctx.memory.getRecommendations('coding');
console.log(recommendations.suggestions);

// 设置偏好
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');
await ctx.memory.setPreference('preferredAgents', ['coding-assistant', 'reviewer']);

// 获取偏好
const model = ctx.memory.getPreference('defaultModel');

// 记录会话内容
await ctx.memory.recordTopic('plugin development');
await ctx.memory.recordTask('implement memory feature');

// 添加项目
await ctx.memory.addProject({
  path: '/path/to/project',
  name: 'My Project',
  tags: ['typescript', 'nodejs']
});

// 获取统计信息
const stats = ctx.memory.getStats();
console.log(stats);

// 导出数据（备份）
const data = ctx.memory.exportData();

// 导入数据（恢复）
await ctx.memory.importData(data);

// 清除所有记忆
await ctx.memory.clearMemory();
```

### 直接存储访问

```javascript
// 读取任意路径的数据
const preferences = ctx.memory.storage.get('userPreferences');
const tools = ctx.memory.storage.get('inputHabits.preferredTools');

// 设置任意路径的数据
ctx.memory.storage.set('userPreferences.language', 'zh-CN');
```

## 📊 数据结构

记忆数据存储为 JSON 格式：

```json
{
  "version": "1.0.0",
  "lastUpdated": "2024-01-15T10:30:00Z",
  "userPreferences": {
    "preferredAgents": ["coding-assistant", "reviewer"],
    "defaultModel": "qwen3.7-plus",
    "language": "zh-CN",
    "workingDirectory": "/path/to/workspace",
    "customSettings": {}
  },
  "inputHabits": {
    "commonCommands": [
      {
        "command": "pnpm run dev",
        "count": 15,
        "firstUsed": "2024-01-01T00:00:00Z",
        "lastUsed": "2024-01-15T10:00:00Z"
      }
    ],
    "frequentPatterns": [],
    "preferredTools": ["read", "write", "glob", "grep"]
  },
  "projectContext": {
    "activeProjects": [
      {
        "path": "/path/to/project",
        "name": "project-name",
        "tags": ["typescript"],
        "lastAccessed": "2024-01-15T10:30:00Z"
      }
    ]
  },
  "sessionHistory": {
    "recentTopics": [
      {
        "content": "plugin development",
        "timestamp": "2024-01-15T10:30:00Z"
      }
    ],
    "frequentTasks": [],
    "toolUsageStats": {
      "read": 45,
      "write": 23,
      "edit": 12,
      "glob": 8,
      "grep": 15
    }
  },
  "metadata": {
    "createdAt": "2024-01-01T00:00:00Z",
    "totalSessions": 25,
    "lastSessionDate": "2024-01-15T10:30:00Z"
  }
}
```

## 🔒 隐私和安全

- **完全透明**：所有数据存储在本地 JSON 文件中，可随时查看
- **用户控制**：可以禁用任何追踪功能
- **数据所有权**：数据完全属于用户，可随时导出或删除
- **无云端同步**：所有数据仅存储在本地

## 🛠️ 开发

### 项目结构

```
memory-plugin/
├── index.js           # 主入口文件
├── config.js          # 配置验证
├── storage.js         # 数据存储模块
├── memory-manager.js  # 核心记忆管理
├── README.md          # 本文档
└── test/              # 测试文件
    ├── config.test.js
    ├── storage.test.js
    └── memory-manager.test.js
```

### 运行测试

```bash
npm test
```

## 📝 示例场景

### 场景 1：自动推荐常用工具

```javascript
// 用户经常使用 glob 和 grep 搜索文件
// 插件会自动记录并在推荐中提示
const recs = ctx.memory.getRecommendations('search');
// 返回: { suggestions: [{ type: 'commands', items: ['glob **/*.ts', 'grep pattern'] }] }
```

### 场景 2：记住偏好的模型

```javascript
// 首次设置
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');

// 后续会话自动使用
const model = ctx.memory.getPreference('defaultModel');
// 返回: 'qwen3.7-plus'
```

### 场景 3：项目切换辅助

```javascript
// 访问不同项目时
await ctx.memory.addProject({
  path: '/projects/dsh',
  name: 'deepseek-harness',
  tags: ['framework', 'typescript']
});

// 获取最近项目列表
const projects = ctx.memory.storage.get('projectContext.activeProjects');
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License
