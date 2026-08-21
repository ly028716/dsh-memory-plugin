/**
 * Memory Plugin Configuration
 * Validates and provides default configuration for the memory plugin.
 */

const DEFAULT_CONFIG = {
  // Storage settings
  storagePath: '.dsh-memory.json',
  maxHistoryItems: 100,
  autoSaveInterval: 5000, // milliseconds
  
  // Automatic collection (opt-in; explicit memory API writes remain available)
  trackToolCalls: false,
  trackPreferences: false,
  trackProjectContext: false,
  trackSessionHistory: false,
  
  // Privacy settings
  encryptSensitiveData: false,
  allowClearMemory: true,
  
  // Smart features
  enableRecommendations: true,
  patternRecognitionThreshold: 3 // minimum occurrences to recognize a pattern
};

/**
 * Validate user configuration against defaults
 * @param {Object} userConfig - User provided configuration
 * @returns {Object} Validated configuration with defaults applied
 */
function validateConfig(userConfig = {}) {
  if (!userConfig || typeof userConfig !== 'object' || Array.isArray(userConfig)) {
    throw new Error('userConfig must be an object');
  }

  const config = { ...DEFAULT_CONFIG, ...userConfig };
  
  // Validate storagePath
  if (typeof config.storagePath !== 'string' || config.storagePath.trim() === '' || config.storagePath.includes('\0')) {
    throw new Error('storagePath must be a non-empty string');
  }
  
  // Validate maxHistoryItems
  if (typeof config.maxHistoryItems !== 'number') {
    throw new Error('maxHistoryItems must be a positive number');
  }
  if (!Number.isFinite(config.maxHistoryItems)) {
    throw new Error('maxHistoryItems must be a finite number');
  }
  if (config.maxHistoryItems <= 0) {
    throw new Error('maxHistoryItems must be a positive number');
  }
  if (!Number.isSafeInteger(config.maxHistoryItems)) {
    throw new Error('maxHistoryItems must be a positive integer');
  }
  if (config.maxHistoryItems > 10000) {
    throw new Error('maxHistoryItems must not exceed 10000');
  }
  
  // Validate autoSaveInterval
  if (typeof config.autoSaveInterval !== 'number') {
    throw new Error('autoSaveInterval must be a positive number');
  }
  if (!Number.isFinite(config.autoSaveInterval)) {
    throw new Error('autoSaveInterval must be a finite number');
  }
  if (config.autoSaveInterval <= 0) {
    throw new Error('autoSaveInterval must be a positive number');
  }
  
  // Validate boolean flags
  const booleanFlags = [
    'trackToolCalls',
    'trackPreferences', 
    'trackProjectContext',
    'trackSessionHistory',
    'encryptSensitiveData',
    'allowClearMemory',
    'enableRecommendations'
  ];
  
  for (const flag of booleanFlags) {
    if (config[flag] !== undefined && typeof config[flag] !== 'boolean') {
      throw new Error(`${flag} must be a boolean value`);
    }
  }
  
  // Validate patternRecognitionThreshold
  if (typeof config.patternRecognitionThreshold !== 'number') {
    throw new Error('patternRecognitionThreshold must be a positive number');
  }
  if (!Number.isFinite(config.patternRecognitionThreshold)) {
    throw new Error('patternRecognitionThreshold must be a finite number');
  }
  if (config.patternRecognitionThreshold <= 0) {
    throw new Error('patternRecognitionThreshold must be a positive number');
  }
  if (!Number.isSafeInteger(config.patternRecognitionThreshold)) {
    throw new Error('patternRecognitionThreshold must be a positive integer');
  }
  
  return config;
}

module.exports = { validateConfig, DEFAULT_CONFIG };
