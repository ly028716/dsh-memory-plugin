(function registerClient(globalObject, nodeModule, nodeRequire) {
  function factory(requireFn) {
    const module = { exports: {} };
    const localRequire = typeof requireFn === 'function' ? requireFn : undefined;

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
      if (!localRequire) return undefined;
      try {
        return localRequire('react');
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
        failed: Boolean(status.failed ?? binding.failed),
        recommendations: readRecommendationMetrics(status)
      };
    }

    function readRecommendationMetrics(status) {
      const metrics = status && status.recommendations;
      if (!metrics || typeof metrics !== 'object') return null;

      const result = {};
      for (const field of ['requests', 'availableRequests', 'contextualRequests', 'contextMatches', 'fallbackRequests', 'suggestions']) {
        if (Number.isFinite(metrics[field])) result[field] = metrics[field];
      }
      for (const field of ['contextMatchRate', 'fallbackRate']) {
        if (metrics[field] === null || Number.isFinite(metrics[field])) result[field] = metrics[field];
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    function booleanValues(binding) {
      const values = readValues(binding);
      return SETTINGS_FIELDS.reduce((result, field) => {
        result[field] = typeof values[field] === 'boolean' ? values[field] : false;
        return result;
      }, {});
    }

    function readCollectionStatus(values) {
      const collectionFields = SETTINGS_FIELDS.filter((field) => field.startsWith('track'));
      const fields = collectionFields.reduce((result, field) => {
        const enabled = values[field] === true;
        result[field] = {
          enabled,
          label: enabled ? '已开启' : '已暂停'
        };
        return result;
      }, {});
      const enabledCount = collectionFields.filter((field) => fields[field].enabled).length;

      return {
        fields,
        enabledCount,
        automaticCollectionEnabled: enabledCount > 0
      };
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
      const status = readStatus(binding);
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
        status,
        collection: readCollectionStatus(values),
        recommendations: status.recommendations
      };
    }

    function formatRate(rate) {
      return Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : '暂无数据';
    }

    function MemorySettingsCard(props) {
      const React = loadReact();
      if (!React || typeof React.createElement !== 'function') return null;

      const fields = props?.fields || {};
      const status = props?.status || {};
      const collection = props?.collection || {
        fields: {},
        enabledCount: 0,
        automaticCollectionEnabled: false
      };
      const recommendations = props?.recommendations;
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

      const collectionFields = Object.entries(collection.fields || {}).map(([field, definition]) => (
        React.createElement(
          'span',
          { key: field, 'data-dsh-memory-collection-field': field },
          `${field}: ${definition.label}`
        )
      ));
      const collectionStatus = React.createElement(
        'div',
        { 'data-dsh-memory': 'collection-status' },
        `自动采集：${collection.automaticCollectionEnabled ? '已开启' : '已暂停'}`,
        `已开启 ${collection.enabledCount} 项`,
        collectionFields
      );
      const recommendationStatus = recommendations
        ? React.createElement(
          'div',
          { 'data-dsh-memory': 'recommendation-metrics' },
          `推荐请求：${recommendations.requests ?? 0}`,
          `可用请求：${recommendations.availableRequests ?? 0}`,
          `上下文请求：${recommendations.contextualRequests ?? 0}`,
          `上下文命中：${recommendations.contextMatches ?? 0}`,
          `回退请求：${recommendations.fallbackRequests ?? 0}`,
          `建议数：${recommendations.suggestions ?? 0}`,
          `上下文命中率：${formatRate(recommendations.contextMatchRate)}`,
          `回退率：${formatRate(recommendations.fallbackRate)}`
        )
        : '当前会话暂无推荐指标';

      return React.createElement(
        'section',
        { 'data-dsh-memory': MEMORY_NAMESPACE },
        React.createElement('h2', null, props?.title || 'Memory'),
        collectionStatus,
        recommendationStatus,
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
      inject: ['slots', 'locale', 'connection', 'remote', 'settingsScope'],
      MEMORY_NAMESPACE,
      MEMORY_LOCALE_NAMESPACE,
      SETTINGS_FIELDS,
      SLOT_NAME,
      MemorySettingsCard,
      apply
    };
    return module.exports;
  }

  if (nodeModule && nodeModule.exports && typeof nodeRequire === 'function') {
    nodeModule.exports = factory(nodeRequire);
    return;
  }

  if (globalObject && globalObject.__ModuleLoader__ && typeof globalObject.__ModuleLoader__.load === 'function') {
    globalObject.__ModuleLoader__.load({
      id: '@ly028716/dsh-memory-plugin',
      factory
    });
  }
})(
  typeof window !== 'undefined' ? window : undefined,
  typeof module !== 'undefined' ? module : undefined,
  typeof require === 'function' ? require : undefined
);
