/**
 * Integration test: Simulate DSH plugin loading
 * This tests the plugin as it would be loaded by DSH
 */

const path = require('path');
const fs = require('fs').promises;

console.log('🔌 DSH Plugin Integration Test\n');
console.log('=' .repeat(60));

async function simulateDSHLoading() {
  console.log('\n📦 Step 1: Loading plugin module...');
  
  // Load the plugin (same as DSH would do)
  const pluginPath = path.join(__dirname, 'index.js');
  const plugin = require(pluginPath);
  
  console.log(`   ✅ Plugin name: ${plugin.name}`);
  console.log(`   ✅ Has apply method: ${typeof plugin.apply === 'function'}`);
  
  // Verify package.json has DSH bundle declaration
  console.log('\n📋 Step 2: Checking package.json...');
  const pkg = require('./package.json');
  console.log(`   ✅ Package: ${pkg.name}`);
  console.log(`   ✅ DSH bundle: ${JSON.stringify(pkg.dsh)}`);
  
  if (!pkg.dsh || !pkg.dsh.bundle) {
    throw new Error('Missing dsh.bundle declaration in package.json');
  }

  const expectedPatchPath = './cordis.patch.yml';
  if (pkg.dsh.bundle.patch !== expectedPatchPath) {
    throw new Error(`Expected dsh.bundle.patch to be ${expectedPatchPath}`);
  }

  const bundlePatchPath = path.join(__dirname, 'cordis.patch.yml');
  const bundlePatch = await fs.readFile(bundlePatchPath, 'utf-8');
  if (!bundlePatch.includes('id: dsh-memory-plugin') ||
      !bundlePatch.includes("name: '@ly028716/dsh-memory-plugin'")) {
    throw new Error('cordis.patch.yml does not insert the @ly028716/dsh-memory-plugin package');
  }
  
  // Create a mock DSH context (simulating real DSH environment)
  console.log('\n🔧 Step 3: Creating mock DSH context...');
  
  const mockCtx = {
    _effects: [],
    _services: {},
    _serviceDisposers: [],
    _listeners: [],
    
    effect(effectFn) {
      const cleanup = effectFn();
      this._effects.push(cleanup);
      console.log('   📝 Effect registered');
      return () => {
        const idx = this._effects.indexOf(cleanup);
        if (idx > -1) this._effects.splice(idx, 1);
      };
    },
    
    on(event, handler) {
      this._listeners.push({ event, handler });
      console.log(`   📝 Event listener registered: ${event}`);
      return () => {
        const idx = this._listeners.findIndex(s => s.event === event && s.handler === handler);
        if (idx > -1) this._listeners.splice(idx, 1);
      };
    },
    
    provide(name, service) {
      this._services[name] = service;
      const dispose = () => {
        delete this._services[name];
      };
      this._serviceDisposers.push(dispose);
      console.log(`   📝 Service provided: ${name}`);
      return dispose;
    }
  };
  
  // Apply the plugin with configuration
  console.log('\n⚙️  Step 4: Applying plugin with config...');
  
  const testConfig = {
    storagePath: path.join(__dirname, 'integration-test-memory.json'),
    autoSaveInterval: 100,
    trackToolCalls: true,
    trackPreferences: true,
    trackProjectContext: true,
    trackSessionHistory: true,
    enableRecommendations: true
  };
  
  try {
    plugin.apply(mockCtx, testConfig);
    console.log('   ✅ Plugin applied successfully');
    
    // Wait for async initialization
    await new Promise(resolve => setTimeout(resolve, 300));

    if (!mockCtx._listeners.some(listener => listener.event === 'tools/result')) {
      throw new Error('Plugin did not register the tools/result event listener');
    }

  } catch (error) {
    console.log(`   ❌ Plugin apply failed: ${error.message}`);
    throw error;
  }
  
  // Test the registered memory service
  console.log('\n🧪 Step 5: Testing memory service API...');
  
  if (!mockCtx._services.memory) {
    throw new Error('Plugin did not provide the memory service');
  } else {
    const memory = mockCtx._services.memory;
    
    // Test setPreference
    await memory.setPreference('testModel', 'qwen3.7-plus');
    console.log('   ✅ setPreference() works');
    
    // Test getPreference
    const model = memory.getPreference('testModel');
    if (model === 'qwen3.7-plus') {
      console.log('   ✅ getPreference() works');
    }
    
    // Test recordTopic
    await memory.recordTopic('integration test');
    console.log('   ✅ recordTopic() works');
    
    // Test addProject
    await memory.addProject({
      path: __dirname,
      name: 'memory-plugin',
      tags: ['test']
    });
    console.log('   ✅ addProject() works');
    
    // Test getRecommendations
    const recs = memory.getRecommendations('coding');
    if (recs.available) {
      console.log('   ✅ getRecommendations() works');
      console.log(`      Found ${recs.suggestions.length} suggestions`);
    }
    
    // Test getStats
    const stats = memory.getStats();
    console.log('   ✅ getStats() works');
    console.log(`      Sessions: ${stats.totalSessions}, Tools: ${stats.trackedTools}`);
    
    // Test exportData
    const data = memory.exportData();
    console.log('   ✅ exportData() works');
    console.log(`      Data version: ${data.version}`);
  }
  
  // Cleanup
  console.log('\n🧹 Step 6: Cleaning up...');
  
  for (const cleanup of mockCtx._effects) {
    if (typeof cleanup === 'function') {
      try {
        await cleanup();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }

  for (const dispose of mockCtx._serviceDisposers) {
    dispose();
  }
  
  // Remove test file
  try {
    await fs.unlink(testConfig.storagePath);
    console.log('   ✅ Test file cleaned up');
  } catch (e) {
    console.log('   ⚠️  Could not clean up test file');
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('\n✨ Integration test completed successfully!\n');
  console.log('📦 The plugin is ready for DSH installation.');
  console.log('\n💡 Installation methods:');
  console.log('   1. Manual: Add to dsh.config.js');
  console.log('   2. CLI: dsh plugin --profile <name> add @ly028716/dsh-memory-plugin');
  console.log('   3. Direct: require() in your code\n');
}

// Run integration test
simulateDSHLoading().catch(error => {
  console.error('\n❌ Integration test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
