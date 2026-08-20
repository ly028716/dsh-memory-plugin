/**
 * Memory Plugin Demo
 * Demonstrates the key features of the memory plugin
 */

const { MemoryManager } = require('./memory-manager');
const { MemoryStorage } = require('./storage');
const { validateConfig } = require('./config');
const fs = require('fs').promises;
const path = require('path');

async function demo() {
  console.log('🧠 DSH Memory Plugin Demo\n');
  console.log('=' .repeat(60));
  
  // Setup
  const testFile = path.join(__dirname, 'demo-memory.json');
  const config = validateConfig({
    storagePath: testFile,
    autoSaveInterval: 1000,
    trackToolCalls: true,
    trackPreferences: true,
    trackProjectContext: true,
    trackSessionHistory: true,
    enableRecommendations: true
  });
  
  const storage = new MemoryStorage(config.storagePath);
  const manager = new MemoryManager(config, storage);
  
  try {
    // Initialize
    console.log('\n1️⃣  Initializing memory system...');
    await manager.initialize();
    console.log('   ✅ Memory system ready');
    
    // Record some tool usage
    console.log('\n2️⃣  Recording tool usage...');
    await manager.recordToolCall({ name: 'read', args: { file_path: 'index.js' } });
    await manager.recordToolCall({ name: 'read', args: { file_path: 'config.js' } });
    await manager.recordToolCall({ name: 'write', args: { file_path: 'output.txt' } });
    await manager.recordToolCall({ name: 'glob', args: { pattern: '**/*.js' } });
    await manager.recordToolCall({ name: 'grep', args: { pattern: 'function' } });
    console.log('   ✅ Recorded 5 tool calls');
    
    // Set user preferences
    console.log('\n3️⃣  Setting user preferences...');
    await manager.recordPreference('defaultModel', 'qwen3.7-plus');
    await manager.recordPreference('language', 'zh-CN');
    console.log('   ✅ Preferences saved');
    
    // Add project context
    console.log('\n4️⃣  Adding project context...');
    await manager.recordProjectContext({
      path: 'E:\\IDEWorkplaces\\DeepSeekHarness',
      name: 'deepseek-harness',
      tags: ['framework', 'typescript']
    });
    await manager.recordProjectContext({
      path: 'E:\\IDEWorkplaces\\MyProject',
      name: 'my-project',
      tags: ['nodejs', 'api']
    });
    console.log('   ✅ Projects tracked');
    
    // Record session history
    console.log('\n5️⃣  Recording session history...');
    await manager.recordSessionItem('topic', 'plugin development');
    await manager.recordSessionItem('topic', 'memory system design');
    await manager.recordSessionItem('task', 'implement storage module');
    console.log('   ✅ Session items recorded');
    
    // Get recommendations
    console.log('\n6️⃣  Getting smart recommendations...');
    const recommendations = manager.getRecommendations('coding');
    console.log('   📊 Recommendations available:', recommendations.available);
    console.log('   💡 Suggestions:');
    recommendations.suggestions.forEach(suggestion => {
      console.log(`      - ${suggestion.type}: ${suggestion.items.join(', ')} (${suggestion.reason})`);
    });
    
    // Show statistics
    console.log('\n7️⃣  Memory statistics...');
    const stats = manager.getStats();
    console.log('   📈 Stats:', JSON.stringify(stats, null, 2));
    
    // Export data
    console.log('\n8️⃣  Exporting memory data...');
    const exportedData = manager.exportData();
    console.log('   ✅ Data exported (version:', exportedData.version + ')');
    console.log('   📦 Contains:', Object.keys(exportedData).join(', '));
    
    // Show stored data structure
    console.log('\n9️⃣  Sample stored data...');
    const sampleData = {
      preferredTools: storage.get('inputHabits.preferredTools'),
      commonCommands: storage.get('inputHabits.commonCommands').slice(0, 2),
      toolUsageStats: storage.get('sessionHistory.toolUsageStats')
    };
    console.log('   📋 Sample:', JSON.stringify(sampleData, null, 2));
    
    console.log('\n' + '='.repeat(60));
    console.log('\n✨ Demo completed successfully!');
    console.log('\n💡 Key Features Demonstrated:');
    console.log('   • Automatic tool usage tracking');
    console.log('   • User preference management');
    console.log('   • Project context recording');
    console.log('   • Session history tracking');
    console.log('   • Smart recommendations');
    console.log('   • Data export/import');
    console.log('   • Persistent storage with auto-save');
    
  } finally {
    // Cleanup
    await manager.dispose();
    try {
      await fs.unlink(testFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run demo
demo().catch(error => {
  console.error('Demo failed:', error);
  process.exit(1);
});
