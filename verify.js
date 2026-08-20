/**
 * Quick verification script for memory plugin
 */

console.log('🔍 Verifying Memory Plugin...\n');

const checks = [];

// Check 1: Module loading
try {
  const config = require('./config');
  const storage = require('./storage');
  const manager = require('./memory-manager');
  const plugin = require('./index');
  
  checks.push({ name: 'Module Loading', status: '✅ PASS' });
} catch (e) {
  checks.push({ name: 'Module Loading', status: '❌ FAIL', error: e.message });
}

// Check 2: Config validation
try {
  const { validateConfig } = require('./config');
  const config = validateConfig();
  if (config.storagePath && config.maxHistoryItems) {
    checks.push({ name: 'Config Validation', status: '✅ PASS' });
  } else {
    checks.push({ name: 'Config Validation', status: '❌ FAIL' });
  }
} catch (e) {
  checks.push({ name: 'Config Validation', status: '❌ FAIL', error: e.message });
}

// Check 3: Storage operations
try {
  const { MemoryStorage } = require('./storage');
  const path = require('path');
  const fs = require('fs').promises;
  
  const testFile = path.join(__dirname, 'verify-test.json');
  const storage = new MemoryStorage(testFile);
  
  (async () => {
    await storage.initialize();
    storage.set('test.key', 'value');
    await storage.save();
    
    const val = storage.get('test.key');
    await fs.unlink(testFile);
    
    if (val === 'value') {
      checks.push({ name: 'Storage Operations', status: '✅ PASS' });
    } else {
      checks.push({ name: 'Storage Operations', status: '❌ FAIL' });
    }
    
    printResults();
  })();
} catch (e) {
  checks.push({ name: 'Storage Operations', status: '❌ FAIL', error: e.message });
  printResults();
}

function printResults() {
  console.log('\n📊 Verification Results:\n');
  checks.forEach(check => {
    console.log(`  ${check.status} ${check.name}`);
    if (check.error) {
      console.log(`       Error: ${check.error}`);
    }
  });
  
  const passed = checks.filter(c => c.status.includes('PASS')).length;
  const total = checks.length;
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Total: ${passed}/${total} checks passed`);
  
  if (passed === total) {
    console.log('\n✨ All verifications passed! Plugin is ready to use.\n');
  } else {
    console.log('\n⚠️  Some checks failed. Please review the errors above.\n');
    process.exit(1);
  }
}
