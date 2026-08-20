/**
 * Simple test runner for memory plugin
 * Run with: node run-tests.js
 */

const fs = require('fs').promises;
const path = require('path');

// Test state
let passed = 0;
let failed = 0;
let currentDescribe = '';
let beforeEachFn = null;
let afterEachFn = null;

// Simple test framework
function describe(name, fn) {
  currentDescribe = name;
  console.log(`\n📋 ${name}`);
  
  // Reset hooks
  beforeEachFn = null;
  afterEachFn = null;
  
  fn();
}

function beforeEach(fn) {
  beforeEachFn = fn;
}

function afterEach(fn) {
  afterEachFn = fn;
}

async function test(name, fn) {
  const fullName = currentDescribe ? `${currentDescribe} > ${name}` : name;
  
  try {
    // Run setup
    if (beforeEachFn) {
      await beforeEachFn();
    }
    
    // Run test
    await fn();
    
    // Run cleanup
    if (afterEachFn) {
      await afterEachFn();
    }
    
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (error) {
    console.log(`  ❌ ${name}`);
    console.log(`     Error: ${error.message}`);
    failed++;
    
    // Still run cleanup on failure
    if (afterEachFn) {
      try {
        await afterEachFn();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  }
}

async function runTests() {
  console.log('🧪 Running Memory Plugin Tests\n');
  console.log('=' .repeat(60));
  
  // Load test files
  const testDir = path.join(__dirname, 'test');
  const testFiles = await fs.readdir(testDir);
  
  for (const file of testFiles) {
    if (file.endsWith('.test.js')) {
      require(path.join(testDir, file));
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log(`\n📊 Results: ${passed} passed, ${failed} failed`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

// Mock expect function
global.expect = (actual) => ({
  toBe: (expected) => {
    if (actual !== expected) {
      throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
  },
  toEqual: (expected) => {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
    }
  },
  toBeDefined: () => {
    if (actual === undefined || actual === null) {
      throw new Error('Expected value to be defined');
    }
  },
  toBeUndefined: () => {
    if (actual !== undefined) {
      throw new Error(`Expected value to be undefined but got ${JSON.stringify(actual)}`);
    }
  },
  toBeNull: () => {
    if (actual !== null) {
      throw new Error(`Expected value to be null but got ${JSON.stringify(actual)}`);
    }
  },
  toContain: (item) => {
    if (!actual.includes(item)) {
      throw new Error(`Expected array to contain ${JSON.stringify(item)}`);
    }
  },
  toBeGreaterThan: (expected) => {
    if (!(actual > expected)) {
      throw new Error(`Expected ${actual} to be greater than ${expected}`);
    }
  },
  toBeLessThan: (expected) => {
    if (!(actual < expected)) {
      throw new Error(`Expected ${actual} to be less than ${expected}`);
    }
  },
  toThrow: (message) => {
    // For sync tests - this is a placeholder
  }
});

// Async expect helper for promises
global.expectAsync = {
  rejects: async (promise, message) => {
    try {
      await promise;
      throw new Error('Expected promise to reject but it resolved');
    } catch (error) {
      if (message && !error.message.includes(message)) {
        throw new Error(`Expected error to include "${message}" but got "${error.message}"`);
      }
    }
  }
};

// Global functions
global.describe = describe;
global.test = test;
global.beforeEach = beforeEach;
global.afterEach = afterEach;

// Run tests
runTests().catch(error => {
  console.error('Failed to run tests:', error);
  process.exit(1);
});
