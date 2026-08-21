# dsh-memory-plugin 安装指南

## ✅ 测试结果

所有安装测试已通过：
- ✅ 模块加载成功
- ✅ 配置验证正常
- ✅ package.json 正确（含 DSH bundle 声明）
- ✅ 核心功能正常工作
- ✅ API 接口可用

## 📦 安装方法

### 方法 1：使用 DSH CLI（推荐）

```bash
# 进入 DSH profile 目录
cd C:\Users\Administrator\.dsh\profiles

# 添加记忆插件（使用相对路径或绝对路径）
dsh plugin --profile <name> add E:\IDEWorkplaces\DeepSeekHarness\memory-plugin
```

### 方法 2：手动配置

在 DSH 配置文件中添加插件引用：

```javascript
// dsh.config.js
module.exports = {
  plugins: [
    {
      name: 'memory',
      path: 'E:\\IDEWorkplaces\\DeepSeekHarness\\memory-plugin',
      config: {
        storagePath: '.dsh-memory.json',
        maxHistoryItems: 100,
        autoSaveInterval: 5000,
        trackToolCalls: true,
        trackPreferences: true,
        trackProjectContext: true,
        trackSessionHistory: true,
        enableRecommendations: true
      }
    }
  ]
};
```

### 方法 3：作为 npm 包（未来支持）

```bash
# 首先在 memory-plugin 目录中发布
cd E:\IDEWorkplaces\DeepSeekHarness\memory-plugin
npm publish

# 然后在 DSH 中安装
dsh plugin --profile <name> add dsh-memory-plugin
```

## 🔧 安装后验证

### 1. 检查插件是否加载

启动 DSH 后，查看控制台输出：

```
Memory plugin loaded with config: { ... }
Memory system initialized successfully
```

### 2. 测试记忆功能

在 DSH 会话中尝试：

```javascript
// 检查记忆服务是否可用
if (ctx.memory) {
  console.log('✅ Memory plugin is active');
  
  // 设置一个偏好
  await ctx.memory.setPreference('testKey', 'testValue');
  
  // 获取偏好
  const value = ctx.memory.getPreference('testKey');
  console.log('Stored value:', value);
  
  // 获取统计
  const stats = ctx.memory.getStats();
  console.log('Stats:', stats);
}
```

### 3. 检查数据文件

插件默认不会仅因启动而创建记忆数据文件。只有以下情况会创建或更新文件：

- 开启任一自动采集开关后启动插件；
- 显式调用 `setPreference()`、`recordTopic()`、`recordTask()`、`addProject()`、`storage.set()` 或 `importData()`。

文件位置为配置的存储路径：

```bash
# 默认位置（相对于工作区）
.dsh-memory.json

# 或在 DSH home 目录
C:\Users\Administrator\.dsh\.dsh-memory.json
```

## ⚙️ 配置选项

### 基本配置

```javascript
{
  // 存储文件路径（相对于工作区）
  storagePath: '.dsh-memory.json',
  
  // 最大历史记录数量
  maxHistoryItems: 100,
  
  // 自动保存间隔（毫秒）
  autoSaveInterval: 5000
}
```

### 追踪控制

```javascript
{
  // 启用/禁用特定自动采集功能
  trackToolCalls: true,        // 工具调用追踪
  trackPreferences: true,      // 用户偏好追踪
  trackProjectContext: true,   // 项目上下文追踪
  trackSessionHistory: true    // 会话历史追踪
}
```

### 隐私设置

```javascript
{
  encryptSensitiveData: false,  // 加密敏感数据（预留）
  allowClearMemory: true        // 允许清除记忆
}
```

### 智能功能

```javascript
{
  enableRecommendations: true,           // 启用智能推荐
  patternRecognitionThreshold: 3         // 模式识别阈值
}
```

## 🎯 使用示例

### 示例 1：记录用户偏好

```javascript
// 设置常用模型
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');

// 设置语言偏好
await ctx.memory.setPreference('language', 'zh-CN');

// 获取偏好
const model = ctx.memory.getPreference('defaultModel');
console.log('Preferred model:', model);
```

### 示例 2：跟踪项目

```javascript
// 添加当前项目
await ctx.memory.addProject({
  path: process.cwd(),
  name: 'my-project',
  tags: ['typescript', 'nodejs']
});

// 获取最近项目
const projects = ctx.memory.storage.get('projectContext.activeProjects');
console.log('Recent projects:', projects);
```

### 示例 3：获取智能推荐

```javascript
// 根据上下文获取推荐
const recs = ctx.memory.getRecommendations('coding');

if (recs.available) {
  recs.suggestions.forEach(s => {
    console.log(`${s.type}: ${s.items.join(', ')}`);
  });
}
```

### 示例 4：查看统计信息

```javascript
const stats = ctx.memory.getStats();
console.log('Total sessions:', stats.totalSessions);
console.log('Tracked tools:', stats.trackedTools);
console.log('Active projects:', stats.activeProjects);
```

## 🔍 故障排除

### 问题 1：插件未加载

**症状**：启动时没有看到 "Memory plugin loaded" 消息

**解决方案**：
1. 检查插件路径是否正确
2. 确认 package.json 中存在 `dsh.bundle` 声明
3. 查看 DSH 启动日志中的错误信息

### 问题 2：记忆服务不可用

**症状**：`ctx.memory` 为 undefined

**解决方案**：
1. 确认插件已成功加载
2. 检查 DSH 版本是否支持服务注册
3. 尝试重新加载插件

### 问题 3：数据未保存

**症状**：重启后记忆数据丢失

**解决方案**：
1. 检查存储路径是否有写入权限
2. 确认 `autoSaveInterval` 配置合理
3. 手动调用 `ctx.memory.storage.save()` 测试

### 问题 4：性能问题

**症状**：DSH 响应变慢

**解决方案**：
1. 增加 `autoSaveInterval` 值
2. 减少 `maxHistoryItems` 数量
3. 禁用不需要的追踪功能

## 📊 数据管理

### 导出数据（备份）

```javascript
const data = ctx.memory.exportData();
const fs = require('fs').promises;
await fs.writeFile('memory-backup.json', JSON.stringify(data, null, 2));
```

### 导入数据（恢复）

```javascript
const fs = require('fs').promises;
const data = JSON.parse(await fs.readFile('memory-backup.json', 'utf-8'));
await ctx.memory.importData(data);
```

### 清除所有数据

```javascript
// 警告：这将删除所有记忆数据
await ctx.memory.clearMemory();
```

## 🔒 隐私说明

- ✅ 所有数据存储在本地
- ✅ 无网络传输
- ✅ 用户完全控制数据
- ✅ 可随时查看和删除
- ✅ 透明的数据结构（JSON 格式）

## 📚 相关文档

- [README.md](./README.md) - 完整项目文档
- [USAGE.md](./USAGE.md) - 详细使用示例
- [SUMMARY.md](./SUMMARY.md) - 开发总结

## 🆘 获取帮助

如有问题，请：
1. 查看上述故障排除部分
2. 检查 README.md 和 USAGE.md
3. 运行测试脚本验证安装：`node test-quick.js`

---

**版本**: 1.0.0  
**最后更新**: 2026-08-20
