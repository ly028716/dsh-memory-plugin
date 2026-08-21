/**
 * Privacy helpers for data collected by the memory manager.
 *
 * Redaction is intentionally one-way and always enabled. The plugin does not
 * have a key-management boundary, so reversible encryption would create a
 * false sense of protection.
 */

const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN = /(?:api[-_]?key|access[-_]?key|token|secret|password|passwd|pwd|authorization|credential|cookie|private[-_]?key|client[-_]?secret)/i;
const CLI_SENSITIVE_NAME_PATTERN = /^(?:api[-_]?key|access[-_]?key|access[-_]?token|auth(?:orization)?|token|secret|password|passwd|pwd|client[-_]?secret|private[-_]?key)$/i;
const ENV_SENSITIVE_NAME_PATTERN = /(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|PRIVATE_KEY)$/i;

function redactString(value) {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, REDACTED)
    .replace(/([?&](?:api[-_]?key|access[-_]?key|access[-_]?token|token|secret|password|passwd|pwd|authorization|credential)\s*=\s*)([^&#\s]+)/gi, `$1${REDACTED}`)
    .replace(/((?:https?|ftp):\/\/[^/\s:@]+:)([^@\s]+)(@)/gi, `$1${REDACTED}$3`)
    .replace(/(\b(?:authorization\s*:\s*)?bearer\s+)([^\s,;]+)/gi, `$1${REDACTED}`)
    .replace(/(\bauthorization\s*:\s*)(?!bearer\s+)([^\s,;]+)/gi, `$1${REDACTED}`)
    .replace(/(\b(?:api[-_ ]?key|access[-_ ]?token|token|secret|password|passwd|pwd))(\s*(?:[:=]|\s)\s*)(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9._~+/=-]+))/gi, (match, name, separator, doubleQuoted, singleQuoted) => {
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${name}${separator}${quote}${REDACTED}${quote}`;
    })
    .replace(/(--([a-z][a-z0-9_-]*)(?:=|\s+))(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi, (match, prefix, name, doubleQuoted, singleQuoted) => {
      if (!CLI_SENSITIVE_NAME_PATTERN.test(name)) return match;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${prefix}${quote}${REDACTED}${quote}`;
    })
    .replace(/\b([A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD|PASS|PWD|CREDENTIAL|PRIVATE_KEY))(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"';&|]+))/g, (match, name, separator, doubleQuoted, singleQuoted) => {
      if (!ENV_SENSITIVE_NAME_PATTERN.test(name)) return match;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${name}${separator}${quote}${REDACTED}${quote}`;
    })
    .replace(/(["']?(?:api[-_]?key|access[-_]?key|access[-_]?token|token|secret|password|passwd|pwd|credential|private[-_]?key)["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi, `$1${REDACTED}`);
}

function redactSensitiveData(value, seen = new WeakMap()) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return seen.get(value);

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);

  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = SENSITIVE_KEY_PATTERN.test(key)
      ? REDACTED
      : redactSensitiveData(nestedValue, seen);
  }

  return clone;
}

function redactProjectPath(value) {
  if (typeof value !== 'string') return value;

  return value.replace(
    /([\\/])(Users|Documents and Settings|home)([\\/])[^\\/]+/gi,
    '$1$2$3[USER]'
  );
}

module.exports = {
  REDACTED,
  redactSensitiveData,
  redactProjectPath
};
