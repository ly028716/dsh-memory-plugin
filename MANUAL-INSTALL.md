# dsh-memory-plugin 手动安装指南

由于 `dsh` 命令不在系统 PATH 中，我们提供以下几种替代安装方法。

## ✅ 测试结果

集成测试已全部通过：
- ✅ 插件模块加载成功
- ✅ DSH bundle 声明正确
- ✅ 插件 apply() 方法正常工作
- ✅ 所有 API 接口可用
- ✅ 服务注册成功

## 🔧 安装方法

### 方法 0：使用 npm 包和 DSH CLI（推荐）

```powershell
dsh plugin --profile <name> add @ly028716/dsh-memory-plugin
cd <DSH_HOME>/profiles/<name>
pnpm exec dsh-memory-plugin doctor --profile <name> --fix
```

doctor 默认只读检查；`--fix` 只把 DSH 共享 `profiles/node_modules` 中的物理冲突目录移动到
带时间戳的备份目录，不删除文件。GitHub pinned commit 仅用于 CI/复现，并且必须使用完整 40 位 SHA。

社区目录标准 pinned commit spec：

```bash
# 将占位符替换为完整 40 位 SHA
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#<40-character-commit-sha>

# 当前已推送的 pinned commit（CI/审计场景）
dsh plugin --profile web add github:ly028716/dsh-memory-plugin#55cef1673aa12d4be6b8aa3a6a1b6f95602f10d2
```

### 方法 1：在 DSH 配置文件中引用（推荐）

在你的项目根目录创建或编辑 `dsh.config.js`：

```javascript
// dsh.config.js
module.exports = {
  plugins: [
    {
      name: 'memory',
      path: '<project-root>',
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

然后启动 DSH 时会自动加载此配置。

### 方法 2：使用完整的 DSH CLI 路径

```powershell
# 使用完整的 Node.js 路径运行 DSH
node <path-to-dsh-cli>/lib/bin.js plugin --profile web add <project-root>
```

注意：需要指定一个已存在的 profile 名称（如 `web`）。

### 方法 3：直接在代码中使用

在你的 JavaScript/TypeScript 代码中：

```javascript
const memoryPlugin = require('<project-root>');

// 创建 DSH context（或复用现有的）
const ctx = { /* your DSH context */ };

// 应用插件
memoryPlugin.apply(ctx, {
  storagePath: '.dsh-memory.json',
  trackToolCalls: true,
  enableRecommendations: true
});

// 现在可以使用记忆功能
if (ctx.memory) {
  await ctx.memory.setPreference('model', 'qwen3.7-plus');
}
```

### 方法 4：添加到全局 PATH（永久解决）

#### Windows PowerShell：

```powershell
# 临时添加（当前会话）
$env:Path += ";<path-to-dsh-cli>\lib"

# 永久添加（需要管理员权限）
[Environment]::SetEnvironmentVariable(
    "Path", 
    $env:Path + ";<path-to-dsh-cli>\lib",
    "User"
)
```

#### 或者创建批处理文件 `dsh.cmd`：

```batch
@echo off
node <path-to-dsh-cli>\lib\bin.js %*
```

将此文件放在 PATH 中的某个目录（如 `C:\Windows` 或用户目录）。

## 📝 验证安装

### 测试 1：快速验证

```bash
cd <project-root>
node test-quick.js
```

期望输出：
```
✅ Loaded: memory
✅ Config valid
✅ All tests passed!
```

### 测试 2：集成测试

```bash
cd <project-root>
node test-integration.js
```

期望输出：
```
✅ Plugin applied successfully
✅ setPreference() works
✅ getRecommendations() works
✨ Integration test completed successfully!
```

### 测试 3：功能演示

```bash
cd <project-root>
node demo.js
```

会展示完整的记忆功能演示。

## 🎯 安装后的使用

### 基本用法

```javascript
// 设置偏好
await ctx.memory.setPreference('defaultModel', 'qwen3.7-plus');
await ctx.memory.setPreference('language', 'zh-CN');

// 获取偏好
const model = ctx.memory.getPreference('defaultModel');

// 记录主题
await ctx.memory.recordTopic('plugin development');

// 获取推荐
const recs = ctx.memory.getRecommendations('coding');

// 查看统计
const stats = ctx.memory.getStats();
```

### 高级用法

```javascript
// 直接访问存储
const tools = ctx.memory.storage.get('inputHabits.preferredTools');

// 添加项目
await ctx.memory.addProject({
  path: '/path/to/project',
  name: 'my-project',
  tags: ['typescript']
});

// 导出数据
const data = ctx.memory.exportData();
await fs.writeFile('backup.json', JSON.stringify(data, null, 2));

// 清除记忆
await ctx.memory.clearMemory();
```

## ⚙️ 配置选项详解

```javascript
{
  // 存储文件路径（相对于工作区）
  storagePath: '.dsh-memory.json',
  
  // 最大历史记录数量
  maxHistoryItems: 100,
  
  // 自动保存间隔（毫秒）
  autoSaveInterval: 5000,
  
  // 追踪开关
  trackToolCalls: true,        // 工具调用
  trackPreferences: true,      // 用户偏好
  trackProjectContext: true,   // 项目上下文
  trackSessionHistory: true,   // 会话历史
  
  // 隐私控制
  encryptSensitiveData: false, // 加密（预留）
  allowClearMemory: true,      // 允许清除
  
  // 智能功能
  enableRecommendations: true, // 启用推荐
  patternRecognitionThreshold: 3 // 模式识别阈值
}
```

## 🔍 故障排除

### 问题 1：找不到插件模块

**错误**：`Cannot find module`

**解决**：
1. 确认路径正确：`<project-root>`
2. 确认 `index.js` 文件存在
3. 使用绝对路径而非相对路径

### 问题 2：DSH bundle 未识别

**错误**：插件加载但功能不工作

**解决**：
1. 检查 `package.json` 中是否有 `dsh.bundle` 声明
2. 确认 `patch` 指向正确的入口文件

### 问题 3：权限错误

**错误**：`EPERM: operation not permitted`

**解决**：
1. 以管理员身份运行 PowerShell
2. 检查文件权限
3. 确保目标目录可写

### 问题 4：记忆数据未保存

**错误**：重启后数据丢失

**解决**：
1. 检查存储路径是否有写入权限
2. 确认 `autoSaveInterval` 配置合理
3. 手动调用 `ctx.memory.storage.save()` 测试

## 📚 相关文档

- [README.md](./README.md) - 完整项目文档
- [USAGE.md](./USAGE.md) - 详细使用示例
- [INSTALL.md](./INSTALL.md) - 标准安装指南
- [INSTALLATION-REPORT.md](./INSTALLATION-REPORT.md) - 安装测试报告

## 🆘 获取帮助

如果遇到问题：

1. 运行测试脚本验证安装：`node test-quick.js`
2. 查看详细文档：阅读 README.md 和 USAGE.md
3. 检查控制台输出：查看错误信息
4. 查看日志：DSH 启动时会输出插件加载信息

---

**版本**: 1.0.0  
**最后更新**: 2026-08-20  
**状态**: ✅ 已测试，可安全使用
