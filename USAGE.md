# Memory Plugin 使用示例

## 基本用法

### 1. 在 DSH 配置中使用

```javascript
// dsh.config.js
module.exports = {
  plugins: [
    {
      name: 'memory',
      path: './memory-plugin',
      config: {
        storagePath: '.dsh-memory.json',
        trackToolCalls: true,
        trackPreferences: true,
        enableRecommendations: true
      }
    }
  ]
};
```

## 默认采集语义

默认配置下，插件不会自动记录工具调用、偏好、项目或会话内容；启动也不会创建记忆文件或增加会话计数。四个 `track*` 配置项只控制自动采集。

通过 `ctx.memory.setPreference()`、`recordTopic()`、`recordTask()`、`addProject()`、`storage.set()` 或 `importData()` 进行的显式操作会主动持久化，不受对应自动采集开关影响。

### 2. 在其他插件中访问记忆服务

```javascript
// example-plugin/index.js
module.exports = {
  name: 'example',
  apply(ctx) {
    // 检查是否有记忆服务可用
    if (ctx.memory) {
      // 获取用户偏好的模型
      const preferredModel = ctx.memory.getPreference('defaultModel');
      console.log('User prefers model:', preferredModel);
      
      // 获取推荐
      const recommendations = ctx.memory.getRecommendations('coding');
      console.log('Recommendations:', recommendations);
    }
  }
};
```

### 3. 记录自定义数据

```javascript
// 在会话中记录重要信息
async function recordImportantInfo(ctx) {
  if (ctx.memory) {
    // 记录当前讨论的主题
    await ctx.memory.recordTopic('API design patterns');
    
    // 记录完成的任务
    await ctx.memory.recordTask('implement user authentication');
    
    // 设置自定义偏好
    await ctx.memory.setPreference('codeStyle', 'functional');
    await ctx.memory.setPreference('testFramework', 'jest');
  }
}
```

### 4. 项目上下文管理

```javascript
// 当切换到新项目时
async function switchProject(ctx, projectPath) {
  if (ctx.memory) {
    await ctx.memory.addProject({
      path: projectPath,
      name: path.basename(projectPath),
      tags: ['typescript', 'nodejs', 'api']
    });
    
    console.log('Project context updated');
  }
}
```

### 5. 获取智能推荐

```javascript
// 根据当前上下文获取推荐
async function getSmartSuggestions(ctx, context) {
  if (ctx.memory) {
    const recs = ctx.memory.getRecommendations(context);
    
    if (recs.available) {
      recs.suggestions.forEach(suggestion => {
        console.log(`${suggestion.type}:`, suggestion.items);
        console.log(`  Reason: ${suggestion.reason}`);
      });
    }
  }
}

// 使用示例
getSmartSuggestions(ctx, 'debugging');  // 获取调试相关的推荐
getSmartSuggestions(ctx, 'testing');    // 获取测试相关的推荐
```

### 6. 数据统计和导出

```javascript
// 查看使用统计
function showStats(ctx) {
  if (ctx.memory) {
    const stats = ctx.memory.getStats();
    console.log('Memory Statistics:');
    console.log('- Total sessions:', stats.totalSessions);
    console.log('- Tracked tools:', stats.trackedTools);
    console.log('- Active projects:', stats.activeProjects);
  }
}

// 导出数据备份
async function backupMemory(ctx) {
  if (ctx.memory) {
    const data = ctx.memory.exportData();
    const fs = require('fs').promises;
    await fs.writeFile('memory-backup.json', JSON.stringify(data, null, 2));
    console.log('Memory data backed up to memory-backup.json');
  }
}

// 从备份恢复
async function restoreMemory(ctx, backupFile) {
  if (ctx.memory) {
    const fs = require('fs').promises;
    const data = JSON.parse(await fs.readFile(backupFile, 'utf-8'));
    await ctx.memory.importData(data);
    console.log('Memory data restored from backup');
  }
}
```

### 7. 隐私控制

```javascript
// 用户可以选择清除所有记忆
async function clearAllMemory(ctx) {
  if (ctx.memory) {
    // 确认操作
    const confirmed = await askUser('Are you sure you want to clear all memory data?');
    if (confirmed) {
      await ctx.memory.clearMemory();
      console.log('All memory data has been cleared');
    }
  }
}

// 禁用特定追踪功能
module.exports = {
  name: 'memory',
  config: {
    trackToolCalls: false,        // 不追踪工具调用
    trackPreferences: true,       // 但仍追踪偏好
    trackProjectContext: false,   // 不追踪项目
    trackSessionHistory: false    // 不追踪会话历史
  }
};
```

## 实际应用场景

### 场景 1：自动推荐常用命令

```javascript
// 当用户开始新会话时
async function startSession(ctx) {
  if (ctx.memory) {
    const commands = ctx.memory.storage.get('inputHabits.commonCommands');
    if (commands && commands.length > 0) {
      console.log('💡 Frequently used commands:');
      commands.slice(0, 5).forEach(cmd => {
        console.log(`   - ${cmd.command} (used ${cmd.count} times)`);
      });
    }
  }
}
```

### 场景 2：项目切换辅助

```javascript
// 检测工作目录变化
async function onWorkspaceChange(ctx, newWorkspace) {
  if (ctx.memory) {
    const projects = ctx.memory.storage.get('projectContext.activeProjects');
    const project = projects.find(p => p.path === newWorkspace);
    
    if (project) {
      console.log(`📁 Welcome back to ${project.name}`);
      console.log(`   Last accessed: ${new Date(project.lastAccessed).toLocaleDateString()}`);
      console.log(`   Tags: ${project.tags.join(', ')}`);
    } else {
      console.log(`🆕 New workspace detected: ${newWorkspace}`);
      await ctx.memory.addProject({
        path: newWorkspace,
        name: path.basename(newWorkspace),
        tags: []
      });
    }
  }
}
```

### 场景 3：个性化助手行为

```javascript
// 根据用户偏好调整助手行为
async function customizeAssistant(ctx) {
  if (ctx.memory) {
    const preferences = {
      model: ctx.memory.getPreference('defaultModel'),
      language: ctx.memory.getPreference('language'),
      codeStyle: ctx.memory.getPreference('codeStyle'),
      testFramework: ctx.memory.getPreference('testFramework')
    };
    
    console.log('🎯 Assistant configured with your preferences:');
    Object.entries(preferences).forEach(([key, value]) => {
      if (value) {
        console.log(`   ${key}: ${value}`);
      }
    });
    
    return preferences;
  }
}
```

## 高级用法

### 直接访问存储

```javascript
// 读取任意路径的数据
const allPreferences = ctx.memory.storage.get('userPreferences');
const toolStats = ctx.memory.storage.get('sessionHistory.toolUsageStats');

// 设置任意路径的数据
await ctx.memory.storage.set('userPreferences.customSetting', 'value');
await ctx.memory.storage.set('metadata.customField', { nested: 'data' });
```

高级存储写入同样会经过敏感数据脱敏和路径安全校验；首次使用前建议等待 `await ctx.memory.ready`。

### 批量操作

```javascript
// 批量设置偏好
async function setMultiplePreferences(ctx, prefs) {
  if (ctx.memory) {
    for (const [key, value] of Object.entries(prefs)) {
      await ctx.memory.setPreference(key, value);
    }
    console.log('✅ All preferences updated');
  }
}

// 使用
setMultiplePreferences(ctx, {
  defaultModel: 'qwen3.7-plus',
  language: 'zh-CN',
  theme: 'dark',
  fontSize: 14
});
```

## 故障排除

### 问题：记忆数据没有保存

```javascript
// 检查配置
console.log('Config:', config);

// 手动触发保存
await ctx.memory.storage.save();

// 检查文件是否存在
const fs = require('fs');
console.log('File exists:', fs.existsSync('.dsh-memory.json'));
```

### 问题：推荐功能不工作

```javascript
// 检查是否启用推荐
console.log('Recommendations enabled:', config.enableRecommendations);

// 检查是否有足够的数据
const stats = ctx.memory.getStats();
console.log('Stats:', stats);

// 手动添加一些数据
await ctx.memory.recordPreference('defaultModel', 'test-model');
const recs = ctx.memory.getRecommendations('test');
console.log('Recommendations:', recs);
```

### 问题：性能问题

```javascript
// 调整自动保存间隔
const config = {
  autoSaveInterval: 10000,  // 增加到 10 秒
  maxHistoryItems: 50       // 减少历史记录数量
};

// 禁用不必要的追踪
const config = {
  trackToolCalls: false,
  trackSessionHistory: false
};
```

## 最佳实践

1. **定期备份**：使用 `exportData()` 定期备份记忆数据
2. **隐私优先**：只启用需要的追踪功能
3. **清理旧数据**：定期使用 `clearMemory()` 清理不再需要的数据
4. **合理配置**：根据实际需求调整 `maxHistoryItems` 和 `autoSaveInterval`
5. **错误处理**：始终包装记忆操作的错误处理

```javascript
try {
  await ctx.memory.recordPreference('key', 'value');
} catch (error) {
  console.error('Failed to record preference:', error.message);
}
```
