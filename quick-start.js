/**
 * 快速生成测试数据并打开查看器
 */

const plugin = require('./index.js');
const fs = require('fs').promises;
const { exec } = require('child_process');

console.log('\n🧠 dsh-memory-plugin - 快速开始\n');
console.log('='.repeat(60));

// 创建 DSH Context
const ctx = {
  _effects: [],
  _services: {},
  effect(cleanupFn) { this._effects.push(cleanupFn); },
  registerService(name, service) { 
    this._services[name] = service; 
  }
};

// 初始化插件
plugin.apply(ctx, {
  storagePath: '.dsh-memory.json',
  autoSaveInterval: 100,
  trackToolCalls: true,
  trackPreferences: true,
  enableRecommendations: true
});

setTimeout(async () => {
  const memory = ctx._services.memory;
  
  console.log('📝 正在生成示例数据...\n');
  
  // 设置用户偏好
  await memory.setPreference('defaultModel', 'qwen3.7-plus');
  await memory.setPreference('language', 'zh-CN');
  await memory.setPreference('preferredAgents', ['coding-assistant', 'code-reviewer']);
  
  console.log('✅ 已设置用户偏好');
  
  // 模拟工具使用
  const toolStats = {
    read: 45,
    write: 28,
    edit: 19,
    glob: 15,
    grep: 12
  };
  memory.storage.set('sessionHistory.toolUsageStats', toolStats);
  
  console.log('✅ 已记录工具使用统计');
  
  // 添加项目
  await memory.addProject({
    path: 'E:\\Projects\\my-app',
    name: 'my-web-app',
    tags: ['react', 'typescript']
  });
  
  console.log('✅ 已添加项目');
  
  // 记录主题
  await memory.recordTopic('implement user authentication');
  await memory.recordTopic('fix database issue');
  
  console.log('✅ 已记录会话主题');
  
  // 保存数据（通过导出触发保存）
  const data = memory.exportData();
  await fs.writeFile('.dsh-memory.json', JSON.stringify(data, null, 2), 'utf-8');
  
  console.log('\n✨ 示例数据生成完成！\n');
  console.log('📁 数据文件: .dsh-memory.json\n');
  
  // 清理
  for (const cleanup of ctx._effects) {
    if (typeof cleanup === 'function') {
      try { await cleanup(); } catch(e) {}
    }
  }
  
  console.log('🌐 请手动打开查看器:\n');
  console.log('   方式1: 双击 open-viewer.cmd');
  console.log('   方式2: 在浏览器中打开 viewer.html\n');
  console.log('💡 提示:');
  console.log('   • 点击"刷新"按钮查看最新数据');
  console.log('   • 点击"导出"按钮备份数据');
  console.log('   • 数据文件: .dsh-memory.json\n');
  
}, 500);
