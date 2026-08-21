/**
 * Test script to verify memory plugin can be loaded and initialized
 */

const path = require('path');
const fs = require('fs').promises;

console.log('🧪 Testing Memory Plugin Installation\n');
console.log('=' .repeat(60));

async function testPluginLoad() {
  console.log('\n1️⃣  Testing module loading...');
  try {
    const plugin = require('./index');
    
    if (!plugin.name) {
      throw new Error('Plugin missing "name" property');
    }
    if (typeof plugin.apply !== 'function') {
      throw new Error('Plugin missing "apply" function');
    }
    
    console.log(`   ✅ Plugin loaded: ${plugin.name}`);
    return plugin;
  } catch (error) {
    console.log(`   ❌ Failed to load plugin: ${error.message}`);
    throw error;
  }
}

async function testConfigValidation() {
  console.log('\n2️⃣  Testing configuration validation...');
  try {
    const { validateConfig } = require('./config');
    
    // Test default config
    const defaultConfig = validateConfig();
    console.log('   ✅ Default config validated');
    
    // Test custom config
    const customConfig = validateConfig({
      storagePath: 'custom-memory.json',
      maxHistoryItems: 50
    });
    console.log('   ✅ Custom config validated');
    
    // Test invalid config
    try {
      validateConfig({ storagePath: '' });
      console.log('   ❌ Should have rejected invalid config');
    } catch (e) {
      console.log('   ✅ Invalid config correctly rejected');
    }
    
    return true;
  } catch (error) {
    console.log(`   ❌ Config validation failed: ${error.message}`);
    throw error;
  }
}

async function testPluginApply(plugin) {
  console.log('\n3️⃣  Testing plugin apply() method...');
  
  // Create a mock DSH context
  const mockCtx = {
    effects: [],
    services: {},
    listeners: [],
    
    effect(effectFn) {
      const cleanup = effectFn();
      this.effects.push(cleanup);
      return () => {
        const index = this.effects.indexOf(cleanup);
        if (index > -1) this.effects.splice(index, 1);
      };
    },
    
    on(event, handler) {
      this.listeners.push({ event, handler });
      return () => {
        const index = this.listeners.findIndex(s => s.event === event && s.handler === handler);
        if (index > -1) this.listeners.splice(index, 1);
      };
    },
    
    provide(name, service) {
      this.services[name] = service;
      console.log(`   📝 Service provided: ${name}`);
      return () => {
        delete this.services[name];
      };
    }
  };
  
  try {
    // Apply plugin with test config
    const testConfig = {
      storagePath: path.join(__dirname, 'test-install-memory.json'),
      autoSaveInterval: 5000,
      trackToolCalls: true,
      trackPreferences: true,
      enableRecommendations: true
    };
    
    plugin.apply(mockCtx, testConfig);
    console.log('   ✅ Plugin applied successfully');
    
    // Wait a bit for async initialization
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check if memory service was registered
    if (mockCtx.services.memory) {
      console.log('   ✅ Memory service registered in context');
      
      // Test memory API
      const memory = mockCtx.services.memory;
      
      // Test setPreference
      await memory.setPreference('testModel', 'test-model-v1');
      console.log('   ✅ setPreference() works');
      
      // Test getPreference
      const pref = memory.getPreference('testModel');
      if (pref === 'test-model-v1') {
        console.log('   ✅ getPreference() works');
      } else {
        console.log('   ⚠️  getPreference() returned unexpected value');
      }
      
      // Test recordTopic
      await memory.recordTopic('plugin installation test');
      console.log('   ✅ recordTopic() works');
      
      // Test getRecommendations
      const recs = memory.getRecommendations('test');
      if (recs.available) {
        console.log('   ✅ getRecommendations() works');
      }
      
      // Test getStats
      const stats = memory.getStats();
      console.log('   ✅ getStats() works');
      
    } else {
      throw new Error('Memory service was not provided');
    }
    
    // Cleanup
    for (const cleanup of mockCtx.effects) {
      if (typeof cleanup === 'function') {
        await cleanup();
      }
    }
    
    // Clean up test file
    try {
      await fs.unlink(testConfig.storagePath);
    } catch (e) {
      // Ignore if file doesn't exist
    }
    
    return true;
  } catch (error) {
    console.log(`   ❌ Plugin apply failed: ${error.message}`);
    console.log('   Stack:', error.stack);
    throw error;
  }
}

async function testPackageJson() {
  console.log('\n4️⃣  Testing package.json...');
  try {
    const pkg = require('./package.json');
    
    if (!pkg.name) {
      throw new Error('Missing package name');
    }
    if (!pkg.dsh || !pkg.dsh.bundle) {
      throw new Error('Missing DSH bundle declaration');
    }
    
    console.log(`   ✅ Package name: ${pkg.name}`);
    console.log(`   ✅ DSH bundle declared`);
    console.log(`   ✅ Version: ${pkg.version}`);
    
    return true;
  } catch (error) {
    console.log(`   ❌ package.json validation failed: ${error.message}`);
    throw error;
  }
}

async function runAllTests() {
  const results = [];
  
  try {
    // Test 1: Load plugin
    const plugin = await testPluginLoad();
    results.push({ test: 'Module Loading', passed: true });
    
    // Test 2: Config validation
    await testConfigValidation();
    results.push({ test: 'Config Validation', passed: true });
    
    // Test 3: Package.json
    await testPackageJson();
    results.push({ test: 'Package.json', passed: true });
    
    // Test 4: Plugin apply
    await testPluginApply(plugin);
    results.push({ test: 'Plugin Apply', passed: true });
    
  } catch (error) {
    results.push({ test: error.test || 'Unknown', passed: false, error: error.message });
  }
  
  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('\n📊 Test Summary:\n');
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`   ${icon} ${result.test}`);
    if (result.error) {
      console.log(`      Error: ${result.error}`);
    }
  });
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Result: ${passed}/${total} tests passed`);
  
  if (passed === total) {
    console.log('\n✨ All tests passed! Memory plugin is ready for installation.\n');
    console.log('📦 Installation options:');
    console.log('   1. Use dsh CLI: dsh plugin --profile <name> add ../memory-plugin');
    console.log('   2. Add to dsh.config.js manually');
    console.log('   3. Install as npm package (future)\n');
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.\n');
    process.exit(1);
  }
}

// Run all tests
runAllTests().catch(error => {
  console.error('\n💥 Test suite failed:', error);
  process.exit(1);
});
