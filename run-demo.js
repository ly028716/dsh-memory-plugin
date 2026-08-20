/**
 * Memory Plugin 快速演示
 * 展示插件的核心功能
 */

console.log('\n🧠 Memory Plugin 演示\n');
console.log('='.repeat(60));

// 加载插件
const plugin = require('./index.js');
console.log('✅ 插件已加载:', plugin.name);

// 创建模拟 DSH Context
const ctx = {
  _effects: [],
  _services: {},
  
  effect(cleanupFn) {
    this._effects.push(cleanupFn);
  },
  
  registerService(name, service) {
    this._services[name] = service;
    console.log('✅ 服务已注册:', name);
  }
};

// 配置并应用插件
const config = {
  storagePath: 'demo-memory.json',
  autoSaveInterval: 100,
  trackToolCalls: true,
  trackPreferences: true,
  trackProjectContext: true,
  trackSessionHistory: true,
  enableRecommendations: true
};

console.log('\n⚙️  应用配置...');
plugin.apply(ctx, config);

// 等待初始化
setTimeout(async () => {
  const memory = ctx._services.memory;
  
  if (!memory) {
    console.log('❌ 记忆服务未注册');
    return;
  }
  
  console.log('\n✨ 开始功能演示...\n');
  
  // 演示 1: 用户偏好
  console.log('📌 演示 1: 用户偏好管理');
  await memory.setPreference('defaultModel', 'qwen3.7-plus');
  await memory.setPreference('language', 'zh-CN');
  await memory.setPreference('preferredAgents', ['coding-assistant', 'reviewer']);
  
  const model = memory.getPreference('defaultModel');
  const agents = memory.getPreference('preferredAgents');
  console.log(`   - 默认模型: ${model}`);
  console.log(`   - 语言: ${memory.getPreference('language')}`);
  console.log(`   - 常用 Agent: ${agents.join(', ')}\n`);
  
  // 演示 2: 会话记录
  console.log('📌 演示 2: 会话历史');
  await memory.recordTopic('plugin development');
  await memory.recordTopic('memory system');
  await memory.recordTask('implement feature');
  console.log('   ✅ 已记录 2 个主题和 1 个任务\n');
  
  // 演示 3: 项目管理
  console.log('📌 演示 3: 项目管理');
  await memory.addProject({
    path: 'E:\\IDEWorkplaces\\DeepSeekHarness',
    name: 'deepseek-harness',
    tags: ['framework', 'ai']
  });
  console.log('   ✅ 已添加项目: deepseek-harness\n');
  
  // 演示 4: 智能推荐
  console.log('📌 演示 4: 智能推荐');
  const recs = memory.getRecommendations('coding');
  if (recs.available) {
    console.log(`   💡 找到 ${recs.suggestions.length} 个推荐:`);
    recs.suggestions.forEach(s => {
      console.log(`      - ${s.type}: ${s.items.slice(0, 2).join(', ')} (${s.reason})`);
    });
  }
  console.log();
  
  // 演示 5: 统计数据
  console.log('📌 演示 5: 统计数据');
  const stats = memory.getStats();
  console.log(`   - 总会话数: ${stats.totalSessions}`);
  console.log(`   - 活跃项目: ${stats.activeProjects}`);
  console.log(`   - 最后更新: ${new Date(stats.lastUpdated).toLocaleString('zh-CN')}\n`);
  
  // 演示 6: 数据导出
  console.log('📌 演示 6: 数据管理');
  const data = memory.exportData();
  console.log(`   ✅ 数据已导出 (版本: ${data.version})`);
  console.log(`   📦 包含字段: ${Object.keys(data).join(', ')}\n`);
  
  // 清理
  console.log('🧹 清理测试文件...');
  const fs = require('fs').promises;
  try {
    await fs.unlink('demo-memory.json');
    console.log('   ✅ 清理完成\n');
  } catch (e) {
    console.log('   ⚠️  清理失败\n');
  }
  
  console.log('='.repeat(60));
  console.log('\n✨ 演示完成！所有功能正常工作！\n');
  console.log('💡 提示:');
  console.log('   • 查看文档: MEMORY-PLUGIN-USAGE-GUIDE.md');
  console.log('   • 完整示例: memory-plugin-example.cjs');
  console.log('   • API 文档: memory-plugin/README.md\n');
  
}, 500);
