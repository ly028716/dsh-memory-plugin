const MEMORY_NAMESPACE = 'dsh-memory';
const SLOT_NAME = 'settings.plugin.item';
const MEMORY_LOCALE_NAMESPACE = 'dsh-memory';
const SETTINGS_FIELDS = Object.freeze([
  'trackToolCalls',
  'trackPreferences',
  'trackProjectContext',
  'trackSessionHistory',
  'enableRecommendations',
  'allowClearMemory'
]);

function getCapability(ctx, name) {
  if (!ctx) return undefined;
  if (typeof ctx.get === 'function') return ctx.get(name);
  return ctx[name];
}

function loadReact() {
  try {
    return require('react');
  } catch (_error) {
    return undefined;
  }
}

function readValues(binding) {
  try {
    if (typeof binding.getValues === 'function') return binding.getValues();
    if (typeof binding.get === 'function') return binding.get();
    if (binding.values && typeof binding.values === 'object') return binding.values;
  } catch (_error) {
    return {};
  }
  return {};
}

function readStatus(binding) {
  let status = {};
  try {
    if (typeof binding.getStatus === 'function') status = binding.getStatus() || {};
    else if (binding.status && typeof binding.status === 'object') status = binding.status;
  } catch (_error) {
    status = {};
  }

  return {
    writable: typeof binding.update === 'function' || typeof binding.set === 'function',
    dirty: Boolean(status.dirty ?? binding.dirty),
    failed: Boolean(status.failed ?? binding.failed)
  };
}

function booleanValues(binding) {
  const values = readValues(binding);
  return SETTINGS_FIELDS.reduce((result, field) => {
    result[field] = typeof values[field] === 'boolean' ? values[field] : false;
    return result;
  }, {});
}

function updateValues(binding, field, value) {
  if (!SETTINGS_FIELDS.includes(field) || typeof value !== 'boolean') return;
  const next = { ...booleanValues(binding), [field]: value };
  if (typeof binding.update === 'function') {
    binding.update(next);
  } else if (typeof binding.set === 'function') {
    binding.set(field, value);
  }
}

function createCardProps(binding) {
  const values = booleanValues(binding);
  const fields = SETTINGS_FIELDS.reduce((result, field) => {
    result[field] = {
      type: 'boolean',
      value: values[field],
      set: (value) => updateValues(binding, field, value)
    };
    return result;
  }, {});

  return {
    namespace: MEMORY_NAMESPACE,
    title: 'Memory',
    fields,
    status: readStatus(binding)
  };
}

function MemorySettingsCard(props) {
  const React = loadReact();
  if (!React || typeof React.createElement !== 'function') return null;

  const fields = props?.fields || {};
  const status = props?.status || {};
  const controls = SETTINGS_FIELDS.map((field) => {
    const definition = fields[field] || {};
    return React.createElement(
      'label',
      { key: field },
      React.createElement('input', {
        type: 'checkbox',
        checked: definition.value === true,
        disabled: status.writable === false,
        onChange: (event) => definition.set?.(event?.target?.checked === true)
      }),
      field
    );
  });

  return React.createElement(
    'section',
    { 'data-dsh-memory': MEMORY_NAMESPACE },
    React.createElement('h2', null, props?.title || 'Memory'),
    `writable: ${Boolean(status.writable)}`,
    `dirty: ${Boolean(status.dirty)}`,
    `failed: ${Boolean(status.failed)}`,
    controls
  );
}

function apply(ctx) {
  const slots = getCapability(ctx, 'slots');
  const settingsScope = getCapability(ctx, 'settingsScope');
  if (!slots || typeof slots.inject !== 'function' || typeof slots.register !== 'function') return undefined;
  if (!settingsScope || typeof settingsScope.bind !== 'function') return undefined;
  if (!loadReact()) return undefined;

  let binding;
  try {
    binding = settingsScope.bind({ namespace: MEMORY_NAMESPACE });
  } catch (_error) {
    return undefined;
  }
  if (!binding) return undefined;

  let slotDispose;
  let injectionDispose;
  try {
    injectionDispose = slots.inject(SLOT_NAME, () => {
      slotDispose = slots.register({
        name: SLOT_NAME,
        key: MEMORY_NAMESPACE,
        locale: MEMORY_LOCALE_NAMESPACE,
        inject: () => createCardProps(binding)
      }, MemorySettingsCard);
      return slotDispose;
    });
  } catch (_error) {
    return undefined;
  }

  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const disposers = new Set([slotDispose, injectionDispose]);
    for (const registrationDispose of disposers) {
      try {
        if (typeof registrationDispose === 'function') registrationDispose();
      } catch (_error) {
        // Host disposal is best effort.
      }
    }
    try {
      if (typeof binding.dispose === 'function') binding.dispose();
    } catch (_error) {
      // Host disposal is best effort.
    }
  };

  if (typeof ctx?.effect === 'function') {
    ctx.effect(() => dispose);
  }
  return dispose;
}

module.exports = {
  MEMORY_NAMESPACE,
  MEMORY_LOCALE_NAMESPACE,
  SETTINGS_FIELDS,
  SLOT_NAME,
  MemorySettingsCard,
  apply
};
