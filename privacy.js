/**
 * Privacy helpers for data collected by the memory manager.
 *
 * Redaction is intentionally one-way and always enabled. The plugin does not
 * have a key-management boundary, so reversible encryption would create a
 * false sense of protection.
 */

const REDACTED = '[REDACTED]';

const CLI_SENSITIVE_NAME_PATTERN = /^(?:api[-_]?key|access[-_]?key|access[-_]?token|auth(?:orization)?|auth[-_]?(?:token|password)|token|secret|password|passwd|pwd|client[-_]?secret|private[-_]?key)$/i;
const ENV_SENSITIVE_NAME_PATTERN = /(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|CREDENTIAL|PRIVATE[_-]?KEY)/i;
const SENSITIVE_KEY_TOKENS = new Set([
  'auth',
  'authorization',
  'credential',
  'cookie',
  'password',
  'passwd',
  'pwd',
  'secret',
  'token'
]);

function isSensitiveKey(key) {
  const tokens = String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .toLowerCase()
    .split('_')
    .filter(Boolean);

  if (tokens.some((token) => SENSITIVE_KEY_TOKENS.has(token))) return true;

  const normalized = tokens.join('_');
  return /(?:^|_)(?:api_key|access_key|access_token|private_key)(?:_|$)/.test(normalized);
}

function redactString(value) {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/gi, REDACTED)
    .replace(/\b((?:[A-Z][A-Z0-9]*_)*(?:API[_-]?KEY|ACCESS[_-]?KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|CREDENTIAL|PRIVATE[_-]?KEY)(?:_[A-Z0-9]+)*)(\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"';&|]+))/g, (match, name, separator, doubleQuoted, singleQuoted) => {
      if (!ENV_SENSITIVE_NAME_PATTERN.test(name)) return match;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${name}${separator}${quote}${REDACTED}${quote}`;
    })
    .replace(/([?&](?:api[-_]?key|access[-_]?key|access[-_]?token|token|secret|password|passwd|pwd|authorization|credential)\s*=\s*)([^&#\s]+)/gi, `$1${REDACTED}`)
    .replace(/((?:https?|ftp):\/\/[^/\s:@]+:)([^@\s]+)(@)/gi, `$1${REDACTED}$3`)
    .replace(/((?:--user(?:name)?|-u)\s+)([^:\s]+:)([^\s"';&|]+)/gi, `$1$2${REDACTED}`)
    .replace(/(\b(?:authorization\s*:\s*)?bearer\s+)([^\s,;]+)/gi, `$1${REDACTED}`)
    .replace(/(\bauthorization\s*:\s*)(?!bearer\s+)([^\s,;]+)/gi, `$1${REDACTED}`)
    .replace(/((?:_authToken|_authPassword|authToken|authPassword)\s*(?:[:=]|\s)\s*)(?:"([^"]*)"|'([^']*)'|([^\s"';&|]+))/gi, (match, prefix, doubleQuoted, singleQuoted) => {
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${prefix}${quote}${REDACTED}${quote}`;
    })
    .replace(/(\b(?:api[-_ ]?key|access[-_ ]?token|token|secret|password|passwd|pwd|auth|auth[-_ ]?(?:token|password)))(\s*(?:[:=]|\s)\s*)(?:"([^"]*)"|'([^']*)'|([A-Za-z0-9._~+/=-]+))/gi, (match, name, separator, doubleQuoted, singleQuoted) => {
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${name}${separator}${quote}${REDACTED}${quote}`;
    })
    .replace(/(--([a-z][a-z0-9_-]*)(?:=|\s+))(?:"([^"]*)"|'([^']*)'|([^\s]+))/gi, (match, prefix, name, doubleQuoted, singleQuoted) => {
      if (!CLI_SENSITIVE_NAME_PATTERN.test(name)) return match;
      const quote = doubleQuoted !== undefined ? '"' : singleQuoted !== undefined ? "'" : '';
      return `${prefix}${quote}${REDACTED}${quote}`;
    })
    .replace(/(?<![A-Za-z0-9_])(["']?(?:api[-_]?key|access[-_]?key|access[-_]?token|token|secret|password|passwd|pwd|credential|private[-_]?key|auth(?:[-_ ]?(?:token|password))?)["']?\s*[:=]\s*["']?)([^"',}\s]+)/gi, `$1${REDACTED}`);
}

function redactSensitiveData(value, seen = new WeakMap()) {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date || value instanceof RegExp || Buffer.isBuffer(value)) return value;
  if (seen.has(value)) return seen.get(value);

  const clone = Array.isArray(value) ? [] : {};
  seen.set(value, clone);

  for (const [key, nestedValue] of Object.entries(value)) {
    clone[key] = isSensitiveKey(key)
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
