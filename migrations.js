/**
 * Versioned memory data migrations.
 *
 * Migrations are intentionally forward-only and operate on cloned data so a
 * failed migration cannot mutate the caller's document.
 */

const CURRENT_DATA_VERSION = '1.1.0';
const CURRENT_SCHEMA_VERSION = 2;

function cloneData(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function assertDocument(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || typeof data.version !== 'string' || !data.metadata || typeof data.metadata !== 'object' || Array.isArray(data.metadata)) {
    throw new Error('Invalid memory data format');
  }
}

const MIGRATIONS = new Map([
  ['1.0.0', (data) => ({
    ...cloneData(data),
    version: CURRENT_DATA_VERSION,
    metadata: {
      ...cloneData(data.metadata),
      schemaVersion: CURRENT_SCHEMA_VERSION
    }
  })]
]);

function migrateData(input) {
  assertDocument(input);

  let current = cloneData(input);
  while (current.version !== CURRENT_DATA_VERSION) {
    const migrate = MIGRATIONS.get(current.version);
    if (!migrate) {
      throw new Error(`Unsupported memory data version: ${current.version}`);
    }
    current = migrate(current);
  }

  return current;
}

module.exports = {
  CURRENT_DATA_VERSION,
  CURRENT_SCHEMA_VERSION,
  migrateData
};
