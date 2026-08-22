const { validateConfig } = require('./config');

const SETTINGS_NAMESPACE = 'dsh-memory';
const SETTINGS_FIELDS = [
  'trackToolCalls',
  'trackPreferences',
  'trackProjectContext',
  'trackSessionHistory',
  'enableRecommendations',
  'allowClearMemory'
];

function pickSettings(config = {}) {
  return SETTINGS_FIELDS.reduce((result, field) => {
    if (Object.prototype.hasOwnProperty.call(config, field) && config[field] !== undefined) {
      result[field] = config[field];
    }
    return result;
  }, {});
}

function loadOptionalSchema(loadModule = () => require('@deepseek-ai/schemastery')) {
  try {
    const imported = loadModule();
    const Schema = imported && (imported.default || imported);
    if (!Schema || typeof Schema.object !== 'function' || typeof Schema.boolean !== 'function') {
      return undefined;
    }

    const fields = SETTINGS_FIELDS.reduce((result, field) => {
      result[field] = Schema.boolean();
      return result;
    }, {});
    return Schema.object(fields);
  } catch (_error) {
    return undefined;
  }
}

function registerMemorySettings(ctx, config, onChange) {
  if (!ctx || !ctx.settings || typeof ctx.settings.register !== 'function') {
    return undefined;
  }

  const schema = loadOptionalSchema();
  if (!schema) return undefined;

  const options = {
    base: pickSettings(config),
    applies: 'live',
    validate(value) {
      return validateConfig({ ...config, ...pickSettings(value) });
    }
  };

  let scope;
  try {
    scope = ctx.settings.register(SETTINGS_NAMESPACE, schema, options);
    if (!scope || typeof scope.watch !== 'function') return undefined;
    const dispose = scope.watch((next) => {
      try {
        const validated = options.validate(next);
        onChange(pickSettings(validated));
      } catch (_error) {
        // A rejected live setting must not escape into the host event loop.
      }
    });

    return () => {
      try {
        if (typeof dispose === 'function') dispose();
      } catch (_error) {
        // Host disposal must remain best effort.
      }
    };
  } catch (_error) {
    return undefined;
  }
}

module.exports = {
  SETTINGS_NAMESPACE,
  SETTINGS_FIELDS,
  pickSettings,
  loadOptionalSchema,
  registerMemorySettings
};
