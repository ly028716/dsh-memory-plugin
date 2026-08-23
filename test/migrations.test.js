const {
  CURRENT_DATA_VERSION,
  CURRENT_SCHEMA_VERSION,
  migrateData
} = require('../migrations');

test('migrates a 1.0.0 document without mutating the input', () => {
  const source = {
    version: '1.0.0',
    metadata: { createdAt: '2026-01-01T00:00:00.000Z' },
    userPreferences: { defaultModel: 'model-a' }
  };

  const result = migrateData(source);

  expect(result.version).toBe(CURRENT_DATA_VERSION);
  expect(result.metadata.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  expect(result.userPreferences.defaultModel).toBe('model-a');
  expect(source.metadata.schemaVersion).toBeUndefined();
  expect(source.version).toBe('1.0.0');
});

test('rejects unknown future versions', () => {
  expect(() => migrateData({ version: '9.0.0', metadata: {} }))
    .toThrow('Unsupported memory data version');
});

test('rejects malformed versioned data', () => {
  expect(() => migrateData({ metadata: {} })).toThrow('Invalid memory data format');
});
