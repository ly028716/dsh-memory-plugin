/**
 * Tests for config.js
 */

const { validateConfig, DEFAULT_CONFIG } = require('../config');

describe('Config Validation', () => {
  test('should return default config when no user config provided', () => {
    const config = validateConfig();
    expect(config).toEqual(DEFAULT_CONFIG);
  });

  test('should merge user config with defaults', () => {
    const userConfig = { storagePath: 'custom.json' };
    const config = validateConfig(userConfig);
    expect(config.storagePath).toBe('custom.json');
    expect(config.maxHistoryItems).toBe(DEFAULT_CONFIG.maxHistoryItems);
  });

  test('should disable all automatic collection by default', () => {
    const config = validateConfig();

    expect(config.trackToolCalls).toBe(false);
    expect(config.trackPreferences).toBe(false);
    expect(config.trackProjectContext).toBe(false);
    expect(config.trackSessionHistory).toBe(false);
  });

  test('should throw error for invalid storagePath', () => {
    expect(() => validateConfig({ storagePath: '' })).toThrow('storagePath must be a non-empty string');
    expect(() => validateConfig({ storagePath: 123 })).toThrow('storagePath must be a non-empty string');
  });

  test('should throw error for invalid maxHistoryItems', () => {
    expect(() => validateConfig({ maxHistoryItems: -1 })).toThrow('maxHistoryItems must be a positive number');
    expect(() => validateConfig({ maxHistoryItems: '100' })).toThrow('maxHistoryItems must be a positive number');
    expect(() => validateConfig({ maxHistoryItems: 1.5 })).toThrow('maxHistoryItems must be a positive integer');
    expect(() => validateConfig({ maxHistoryItems: Infinity })).toThrow('maxHistoryItems must be a finite number');
  });

  test('should throw error for invalid autoSaveInterval', () => {
    expect(() => validateConfig({ autoSaveInterval: 0 })).toThrow('autoSaveInterval must be a positive number');
    expect(() => validateConfig({ autoSaveInterval: '5000' })).toThrow('autoSaveInterval must be a positive number');
    expect(() => validateConfig({ autoSaveInterval: NaN })).toThrow('autoSaveInterval must be a finite number');
    expect(() => validateConfig({ autoSaveInterval: Infinity })).toThrow('autoSaveInterval must be a finite number');
    expect(() => validateConfig({ autoSaveInterval: 1.5 })).toThrow('autoSaveInterval must be a positive integer');
    expect(() => validateConfig({ autoSaveInterval: 2 ** 31 })).toThrow('autoSaveInterval must not exceed 2147483647 milliseconds');
  });

  test('should throw error for invalid boolean flags', () => {
    expect(() => validateConfig({ trackToolCalls: 'yes' })).toThrow('trackToolCalls must be a boolean value');
    expect(() => validateConfig({ enableRecommendations: 1 })).toThrow('enableRecommendations must be a boolean value');
  });

  test('should throw error for invalid patternRecognitionThreshold', () => {
    expect(() => validateConfig({ patternRecognitionThreshold: 0 })).toThrow('patternRecognitionThreshold must be a positive number');
    expect(() => validateConfig({ patternRecognitionThreshold: -1 })).toThrow('patternRecognitionThreshold must be a positive number');
    expect(() => validateConfig({ patternRecognitionThreshold: 1.5 })).toThrow('patternRecognitionThreshold must be a positive integer');
  });

  test('should accept valid boolean values', () => {
    const config = validateConfig({
      trackToolCalls: false,
      trackPreferences: true,
      enableRecommendations: false
    });
    expect(config.trackToolCalls).toBe(false);
    expect(config.trackPreferences).toBe(true);
    expect(config.enableRecommendations).toBe(false);
  });

  test('should accept custom numeric values', () => {
    const config = validateConfig({
      maxHistoryItems: 50,
      autoSaveInterval: 10000,
      patternRecognitionThreshold: 5
    });
    expect(config.maxHistoryItems).toBe(50);
    expect(config.autoSaveInterval).toBe(10000);
    expect(config.patternRecognitionThreshold).toBe(5);
  });

  test('provides local backup and retention defaults', () => {
    const config = validateConfig();

    expect(config.backupDir).toBeNull();
    expect(config.backupOnInitialize).toBe(true);
    expect(config.backupRetentionDays).toBe(30);
    expect(config.backupRetentionCount).toBe(10);
  });

  test('rejects invalid backup retention settings', () => {
    expect(() => validateConfig({ backupRetentionDays: 0 }))
      .toThrow('backupRetentionDays must be a positive integer');
    expect(() => validateConfig({ backupRetentionCount: 10001 }))
      .toThrow('backupRetentionCount must not exceed 10000');
    expect(() => validateConfig({ backupOnInitialize: 'yes' }))
      .toThrow('backupOnInitialize must be a boolean value');
  });
});
