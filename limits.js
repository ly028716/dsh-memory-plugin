/**
 * Shared input and persistence limits.
 *
 * These limits are intentionally conservative: memory is a local convenience
 * store, not a general-purpose document database.
 */

const INPUT_LIMITS = Object.freeze({
  maxTextLength: 10000,
  maxProjectPathLength: 4096,
  maxProjectNameLength: 200,
  maxTagLength: 100,
  maxTags: 50,
  maxObjectDepth: 8,
  maxStoredValueBytes: 256 * 1024,
  maxMemoryFileBytes: 5 * 1024 * 1024
});

function assertTextLength(value, label, maxLength = INPUT_LIMITS.maxTextLength) {
  if (typeof value !== 'string') return;
  if (value.length > maxLength) {
    throw new Error(`${label} must not exceed ${maxLength} characters`);
  }
}

function getDataDepth(value, depth = 0, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return depth;
  if (seen.has(value)) throw new Error('value must be JSON-serializable');
  seen.add(value);

  let maxDepth = depth;
  for (const nestedValue of Array.isArray(value) ? value : Object.values(value)) {
    maxDepth = Math.max(maxDepth, getDataDepth(nestedValue, depth + 1, seen));
  }
  seen.delete(value);
  return maxDepth;
}

function assertDataWithinLimits(value, label, maxBytes, maxDepth = INPUT_LIMITS.maxObjectDepth) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
    getDataDepth(value);
  } catch (error) {
    if (error.message === 'value must be JSON-serializable') throw error;
    throw new Error(`${label} must be JSON-serializable`);
  }

  const depth = getDataDepth(value);
  if (depth > maxDepth) {
    throw new Error(`${label} must not exceed ${maxDepth} levels`);
  }

  const bytes = Buffer.byteLength(serialized || '', 'utf8');
  if (bytes > maxBytes) {
    throw new Error(`${label} must not exceed ${maxBytes} bytes`);
  }
}

function trimArrayToLimits(value, maxLength = null, maxBytes = INPUT_LIMITS.maxStoredValueBytes) {
  if (!Array.isArray(value)) return value;

  let trimmed = value;
  if (Number.isSafeInteger(maxLength) && maxLength > 0 && trimmed.length > maxLength) {
    trimmed = trimmed.slice(0, maxLength);
  }

  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) return trimmed;
  const byteLength = (candidate) => {
    try {
      return Buffer.byteLength(JSON.stringify(candidate) || '', 'utf8');
    } catch (_error) {
      return null;
    }
  };

  const fullLength = byteLength(trimmed);
  if (fullLength === null || fullLength <= maxBytes) return trimmed;
  if (byteLength([]) > maxBytes) return [];

  let lower = 0;
  let upper = trimmed.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    const candidateLength = byteLength(trimmed.slice(0, middle));
    if (candidateLength !== null && candidateLength <= maxBytes) {
      lower = middle;
    } else {
      upper = middle - 1;
    }
  }
  return trimmed.slice(0, lower);
}

module.exports = {
  INPUT_LIMITS,
  assertTextLength,
  assertDataWithinLimits,
  trimArrayToLimits
};
