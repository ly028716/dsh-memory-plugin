/**
 * Memory Plugin 交互式演示
 * 模拟真实开发场景，展示记忆系统的实际效果
 */

const plugin = require('./index.js');
const fs = require('fs').promises;

console.log('\n' + '🎯'.repeat(30));
console.log('Memory Plugin 交互式演示 - 真实场景模拟');
console.log('🎯'.repeat(30) + '\n');

// 创建 DSH Context
const ctx = {
  _effects: [],
  _services: {},
  effect(cleanupFn) { this._effects.push(cleanupFn); },
  provide(name, service) {
    this._services[name] = service; 
  }
};

// 初始化插件
plugin.apply(ctx, {
  storagePath: 'interactive-demo.json',
  autoSaveInterval: 100,
  trackToolCalls: true,
  trackPreferences: true,
  enableRecommendations: true
});

setTimeout(async () => {
  const memory = ctx._services.memory;
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📖 场景：你是一个开发者，正在使用 DSH 助手进行项目开发\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // ========== 第一天：初次使用 ==========
  console.log('📅 第一天：初次使用 DSH\n');
  console.log('💬 你：帮我创建一个 React 组件');
  console.log('🤖 DSH：好的，我来帮你创建...\n');
  
  // 模拟第一次使用，没有历史记录
  const day1Recs = memory.getRecommendations('react');
  console.log('📊 智能推荐状态：');
  if (day1Recs.suggestions.length === 0) {
    console.log('   ⚪ 暂无个性化推荐（首次使用）');
    console.log('   💡 提示：随着使用次数增加，我会学习你的偏好\n');
  }
  
  // 记录这次会话
  await memory.recordTopic('create React component');
  await memory.addProject({
    path: 'E:\\Projects\\my-app',
    name: 'my-react-app',
    tags: ['react', 'typescript']
  });
  
  console.log('✅ 已记录：创建了 React 组件\n');
  
  // ========== 第二天：继续使用 ==========
  await new Promise(r => setTimeout(r, 100));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📅 第二天：继续开发\n');
  console.log('💬 你：帮我修复这个 bug');
  console.log('🤖 DSH：好的，让我看看...\n');
  
  await memory.recordTopic('fix bug in component');
  await memory.recordTask('debug react component');
  
  // 设置一些偏好
  await memory.setPreference('defaultModel', 'qwen3.7-plus');
  await memory.setPreference('preferredAgents', ['coding-assistant']);
  await memory.setPreference('language', 'zh-CN');
  
  console.log('✅ 已记录：修复了 bug\n');
  console.log('⚙️  你设置了偏好：\n');
  console.log(`   • 默认模型: ${memory.getPreference('defaultModel')}`);
  console.log(`   • 常用 Agent: ${memory.getPreference('preferredAgents').join(', ')}`);
  console.log(`   • 语言: ${memory.getPreference('language')}\n`);
  
  // ========== 第三天：开始看到效果 ==========
  await new Promise(r => setTimeout(r, 100));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📅 第三天：记忆系统开始发挥作用\n');
  console.log('💬 你：帮我优化这个组件的性能');
  
  // 现在获取推荐
  const day3Recs = memory.getRecommendations('optimization');
  
  console.log('\n🎯 智能推荐引擎激活！\n');
  console.log('🤖 DSH：基于你的使用历史，我为你推荐：\n');
  
  day3Recs.suggestions.forEach((suggestion, index) => {
    console.log(`   ${index + 1}. 📌 ${suggestion.type.toUpperCase()}`);
    console.log(`      推荐内容: ${suggestion.items.join(', ')}`);
    console.log(`      推荐理由: ${suggestion.reason}`);
    console.log();
  });
  
  console.log('💡 这就是记忆系统的价值：\n');
  console.log('   ✅ 记住你喜欢的模型，不用每次都选择');
  console.log('   ✅ 记住常用的 Agent，自动推荐');
  console.log('   ✅ 记住项目上下文，提供更相关的帮助');
  console.log('   ✅ 记住讨论主题，保持对话连贯性\n');
  
  // ========== 一周后：丰富的历史数据 ==========
  await new Promise(r => setTimeout(r, 100));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📅 一周后：积累了丰富的使用历史\n');
  
  // 模拟更多的使用记录
  const topics = [
    'implement authentication',
    'add API endpoints',
    'write unit tests',
    'setup CI/CD',
    'code review',
    'performance optimization',
    'database migration',
    'deploy to production'
  ];
  
  for (const topic of topics) {
    await memory.recordTopic(topic);
  }
  
  const tasks = [
    'create user model',
    'implement login feature',
    'write test cases',
    'fix security issue',
    'optimize database query'
  ];
  
  for (const task of tasks) {
    await memory.recordTask(task);
  }
  
  // 添加更多项目
  await memory.addProject({
    path: 'E:\\Projects\\api-server',
    name: 'backend-api',
    tags: ['nodejs', 'express', 'mongodb']
  });
  
  await memory.addProject({
    path: 'E:\\Projects\\mobile-app',
    name: 'mobile-app',
    tags: ['react-native', 'ios', 'android']
  });
  
  console.log('📊 使用统计报告：\n');
  const stats = memory.getStats();
  console.log(`   📈 总会话数: ${stats.totalSessions}`);
  console.log(`   📁 活跃项目: ${stats.activeProjects} 个`);
  console.log(`   🕐 最后更新: ${new Date(stats.lastUpdated).toLocaleString('zh-CN')}\n`);
  
  // 导出数据查看
  const data = memory.exportData();
  
  console.log('📝 最近讨论的主题（Top 5）：\n');
  data.sessionHistory.recentTopics.slice(0, 5).forEach((topic, i) => {
    console.log(`   ${i + 1}. ${topic.content}`);
  });
  
  console.log('\n✅ 完成的任务（Top 5）：\n');
  data.sessionHistory.frequentTasks.slice(0, 5).forEach((task, i) => {
    console.log(`   ${i + 1}. ${task.content}`);
  });
  
  console.log('\n📁 管理的项目：\n');
  data.projectContext.activeProjects.forEach((project, i) => {
    console.log(`   ${i + 1}. ${project.name}`);
    console.log(`      路径: ${project.path}`);
    console.log(`      标签: ${project.tags.join(', ')}`);
    console.log();
  });
  
  // ========== 智能推荐的实际应用 ==========
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🎯 实际应用场景演示\n');
  
  const scenarios = [
    { context: 'coding', desc: '当你开始编码时' },
    { context: 'debugging', desc: '当你需要调试时' },
    { context: 'testing', desc: '当你写测试时' },
    { context: 'deployment', desc: '当你部署时' }
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n💼 场景：${scenario.desc}`);
    const recs = memory.getRecommendations(scenario.context);
    
    if (recs.suggestions.length > 0) {
      console.log('   🤖 DSH 建议：');
      recs.suggestions.slice(0, 2).forEach(s => {
        console.log(`      • 使用 ${s.items[0]} (${s.reason})`);
      });
    }
  }
  
  console.log('\n');
  
  // ========== 对比演示 ==========
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🔄 有记忆 vs 无记忆 对比\n');
  
  console.log('❌ 没有记忆系统：\n');
  console.log('   • 每次都要重新选择模型');
  console.log('   • 每次都要重新配置 Agent');
  console.log('   • 不记得之前讨论过什么');
  console.log('   • 不知道你在做什么项目');
  console.log('   • 无法提供个性化建议\n');
  
  console.log('✅ 有记忆系统：\n');
  console.log('   • 自动使用你喜欢的模型 ✓');
  console.log('   • 推荐你常用的 Agent ✓');
  console.log('   • 记得之前的讨论主题 ✓');
  console.log('   • 了解你的项目上下文 ✓');
  console.log('   • 提供个性化的智能建议 ✓\n');
  
  // ========== 数据可视化 ==========
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('📊 记忆数据概览\n');
  
  const userData = memory.exportData();
  
  console.log('用户偏好：');
  console.log('├─ 默认模型:', userData.userPreferences.defaultModel || '未设置');
  console.log('├─ 语言:', userData.userPreferences.language || '未设置');
  console.log('├─ 常用 Agent:', (userData.userPreferences.preferredAgents || []).join(', ') || '未设置');
  console.log('└─ 自定义设置:', Object.keys(userData.userPreferences.customSettings || {}).length, '项');
  
  console.log('\n输入习惯：');
  console.log('├─ 常用工具:', (userData.inputHabits.preferredTools || []).join(', ') || '未记录');
  console.log('├─ 常用命令:', (userData.inputHabits.commonCommands || []).length, '条');
  console.log('└─ 频繁模式:', (userData.inputHabits.frequentPatterns || []).length, '个');
  
  console.log('\n项目上下文：');
  console.log('└─ 活跃项目:', userData.projectContext.activeProjects.length, '个');
  
  console.log('\n会话历史：');
  console.log('├─ 最近主题:', userData.sessionHistory.recentTopics.length, '个');
  console.log('├─ 频繁任务:', userData.sessionHistory.frequentTasks.length, '个');
  console.log('└─ 工具统计:', Object.keys(userData.sessionHistory.toolUsageStats || {}).length, '种工具');
  
  console.log('\n元数据：');
  console.log('├─ 创建时间:', new Date(userData.metadata.createdAt).toLocaleDateString('zh-CN'));
  console.log('├─ 总会话:', userData.metadata.totalSessions);
  console.log('└─ 最后会话:', new Date(userData.metadata.lastSessionDate).toLocaleDateString('zh-CN'));
  
  console.log('\n');
  
  // ========== 清理 ==========
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('🧹 清理演示数据...\n');
  
  try {
    await memory.clearMemory();
    await fs.unlink('interactive-demo.json');
    console.log('✅ 演示数据已清理\n');
  } catch (e) {
    console.log('⚠️  清理完成（文件可能不存在）\n');
  }
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  console.log('✨ 演示结束！\n');
  console.log('💡 关键收获：\n');
  console.log('   1. 记忆系统会随着使用越来越智能');
  console.log('   2. 自动学习你的偏好和习惯');
  console.log('   3. 提供个性化的智能推荐');
  console.log('   4. 保持对话的连贯性和上下文');
  console.log('   5. 提高开发效率和工作体验\n');
  console.log('📚 了解更多：');
  console.log('   • MEMORY-PLUGIN-USAGE-GUIDE.md');
  console.log('   • memory-plugin/README.md');
  console.log('   • memory-plugin/USAGE.md\n');
  console.log('🎯'.repeat(30) + '\n');
  
}, 500);
