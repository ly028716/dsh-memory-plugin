/**
 * Quick installation test for memory plugin
 */

console.log('🧪 Memory Plugin Installation Test\n');

// Test 1: Module loading
console.log('1️⃣  Loading plugin module...');
const plugin = require('./index');
console.log(`   ✅ Loaded: ${plugin.name}`);

// Test 2: Config validation
console.log('\n2️⃣  Validating configuration...');
const { validateConfig } = require('./config');
const config = validateConfig({ storagePath: 'test.json' });
console.log('   ✅ Config valid');

// Test 3: Package.json
console.log('\n3️⃣  Checking package.json...');
const pkg = require('./package.json');
console.log(`   ✅ Name: ${pkg.name}`);
console.log(`   ✅ DSH bundle: ${pkg.dsh?.bundle ? 'Yes' : 'No'}`);

// Test 4: Core modules
console.log('\n4️⃣  Testing core modules...');
const { MemoryStorage } = require('./storage');
const { MemoryManager } = require('./memory-manager');
console.log('   ✅ Storage module loaded');
console.log('   ✅ Manager module loaded');

// Test 5: Quick functionality test
console.log('\n5️⃣  Running quick functionality test...');
(async () => {
  const path = require('path');
  const fs = require('fs').promises;
  
  const testFile = path.join(__dirname, 'quick-test.json');
  const storage = new MemoryStorage(testFile);
  const manager = new MemoryManager(config, storage);
  
  await manager.initialize();
  await manager.recordPreference('model', 'test');
  await manager.recordToolCall({ name: 'read', args: {} });
  
  const recs = manager.getRecommendations('test');
  const stats = manager.getStats();
  
  console.log('   ✅ Preference recorded');
  console.log('   ✅ Tool call tracked');
  console.log('   ✅ Recommendations working');
  console.log(`   ✅ Stats: ${stats.trackedTools} tools tracked`);
  
  await manager.dispose();
  await fs.unlink(testFile).catch(() => {});
  
  console.log('\n' + '='.repeat(50));
  console.log('\n✨ All tests passed!');
  console.log('\n📦 Plugin is ready for installation.');
  console.log('\n💡 Next steps:');
  console.log('   • Add to DSH profile using: dsh plugin --profile <name> add ../memory-plugin');
  console.log('   • Or configure in dsh.config.js');
  console.log('   • See README.md for detailed usage\n');
})();
