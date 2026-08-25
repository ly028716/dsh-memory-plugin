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
    const FIELD_GROUPS = Object.freeze({
      collection: Object.freeze([
        'trackToolCalls',
        'trackPreferences',
        'trackProjectContext',
        'trackSessionHistory'
      ]),
      recommendations: Object.freeze(['enableRecommendations']),
      privacy: Object.freeze(['allowClearMemory'])
    });
    const FIELD_DEFINITIONS = Object.freeze({
      trackToolCalls: { label: '工具调用', hint: '记录工具使用偏好，帮助改进后续建议' },
      trackPreferences: { label: '偏好设置', hint: '保存你主动表达的偏好和工作习惯' },
      trackProjectContext: { label: '项目上下文', hint: '记录当前项目的技术栈和约定' },
      trackSessionHistory: { label: '会话历史', hint: '允许跨会话引用已确认的记忆' },
      enableRecommendations: { label: '启用推荐', hint: '在相关任务中显示匹配的记忆' },
      allowClearMemory: { label: '允许清除 Memory', hint: '允许用户在 Memory 管理页删除已采集内容' }
    });
    const LOCALE_DICTIONARIES = Object.freeze({
      zh: Object.freeze({
        title: 'Memory', description: '管理记忆采集和推荐行为', collection: '采集控制',
        recommendations: '推荐', privacy: '数据安全', save: '保存', saving: '保存中…',
        discard: '放弃修改', unsaved: '未保存', readOnly: '当前配置为只读，无法修改。',
        saveFailed: '保存失败，请稍后重试。', automaticCollection: '自动采集', enabled: '已开启',
        paused: '已暂停', enabledCount: '已开启 {count}/4 项', noMetrics: '当前会话暂无推荐指标',
        recommendationsRequests: '推荐请求', availableRequests: '可用请求', contextualRequests: '上下文请求',
        contextMatches: '上下文命中', fallbackRequests: '回退请求', suggestions: '建议数',
        contextMatchRate: '上下文命中率', fallbackRate: '回退率', noData: '暂无数据',
        collapse: '收起', expand: '展开', stateEnabled: '状态：已开启', statePaused: '状态：已暂停',
        privacyNote: '只允许清除 Memory 内容，不会影响插件配置。',
        fields: Object.freeze({
          trackToolCalls: { label: '工具调用', hint: '记录工具使用偏好，帮助改进后续建议' },
          trackPreferences: { label: '偏好设置', hint: '保存你主动表达的偏好和工作习惯' },
          trackProjectContext: { label: '项目上下文', hint: '记录当前项目的技术栈和约定' },
          trackSessionHistory: { label: '会话历史', hint: '允许跨会话引用已确认的记忆' },
          enableRecommendations: { label: '启用推荐', hint: '在相关任务中显示匹配的记忆' },
          allowClearMemory: { label: '允许清除 Memory', hint: '允许用户在 Memory 管理页删除已采集内容' }
        })
      }),
      en: Object.freeze({
        title: 'Memory', description: 'Manage memory collection and recommendations', collection: 'Collection',
        recommendations: 'Recommendations', privacy: 'Data safety', save: 'Save', saving: 'Saving…',
        discard: 'Discard changes', unsaved: 'Unsaved', readOnly: 'This configuration is read-only.',
        saveFailed: 'Save failed. Try again later.', automaticCollection: 'Automatic collection', enabled: 'Enabled',
        paused: 'Paused', enabledCount: '{count}/4 enabled', noMetrics: 'No recommendation metrics in this session',
        recommendationsRequests: 'Recommendation requests', availableRequests: 'Available requests', contextualRequests: 'Contextual requests',
        contextMatches: 'Context matches', fallbackRequests: 'Fallback requests', suggestions: 'Suggestions',
        contextMatchRate: 'Context match rate', fallbackRate: 'Fallback rate', noData: 'No data',
        collapse: 'Collapse', expand: 'Expand', stateEnabled: 'Status: enabled', statePaused: 'Status: paused',
        privacyNote: 'Only Memory content can be cleared; plugin configuration is not affected.',
        fields: Object.freeze({
          trackToolCalls: { label: 'Tool calls', hint: 'Record tool usage preferences to improve future recommendations' },
          trackPreferences: { label: 'Preferences', hint: 'Save preferences and work habits that you express explicitly' },
          trackProjectContext: { label: 'Project context', hint: 'Record the current project stack and conventions' },
          trackSessionHistory: { label: 'Session history', hint: 'Allow confirmed memories to be referenced across sessions' },
          enableRecommendations: { label: 'Enable recommendations', hint: 'Show matching memories for relevant tasks' },
          allowClearMemory: { label: 'Allow clearing Memory', hint: 'Allow users to delete collected content from the Memory page' }
        })
      })
    });

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

    function resolveLocaleDictionary(locale) {
      const values = [];
      try {
        if (typeof locale === 'string') values.push(locale);
        if (locale && typeof locale.getLocale === 'function') values.push(locale.getLocale());
        if (locale && typeof locale.getCurrentLocale === 'function') values.push(locale.getCurrentLocale());
        if (locale && typeof locale.getLanguage === 'function') values.push(locale.getLanguage());
        values.push(locale?.currentLocale, locale?.locale, locale?.language);
      } catch (_error) {
        // A host locale capability is optional and must not break the card.
      }
      const localeValue = values.find((value) => typeof value === 'string' && value.trim() !== '');
      const localeKey = String(localeValue || 'zh').toLowerCase().startsWith('en') ? 'en' : 'zh';
      return LOCALE_DICTIONARIES[localeKey];
    }

    function formatMessage(template, replacements = {}) {
      return String(template || '').replace(/\{(\w+)\}/g, (_match, key) =>
        Object.prototype.hasOwnProperty.call(replacements, key) ? String(replacements[key]) : `{${key}}`);
    }

    function readSnapshot(binding) {
      try {
        if (typeof binding?.getSnapshot === 'function') return binding.getSnapshot() || {};
      } catch (_error) {
        return {};
      }
      return {};
    }

    function readValues(binding) {
      const snapshot = readSnapshot(binding);
      if (snapshot.value && typeof snapshot.value === 'object') return snapshot.value;
      try {
        if (typeof binding.getValues === 'function') return binding.getValues() || {};
        if (typeof binding.get === 'function') return binding.get() || {};
        if (binding.values && typeof binding.values === 'object') return binding.values;
      } catch (_error) {
        return {};
      }
      return {};
    }

    function readStatus(binding) {
      const snapshot = readSnapshot(binding);
      let status = {};
      try {
        if (typeof binding.getStatus === 'function') status = binding.getStatus() || {};
        else if (binding.status && typeof binding.status === 'object') status = binding.status;
      } catch (_error) {
        status = {};
      }
      return {
        writable: typeof snapshot.writable === 'boolean'
          ? snapshot.writable
          : typeof binding.update === 'function' || typeof binding.set === 'function',
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
      const fields = FIELD_GROUPS.collection.reduce((result, field) => {
        const enabled = values[field] === true;
        result[field] = { enabled, label: enabled ? '已开启' : '已暂停' };
        return result;
      }, {});
      const enabledCount = FIELD_GROUPS.collection.filter((field) => fields[field].enabled).length;
      return { fields, enabledCount, automaticCollectionEnabled: enabledCount > 0 };
    }

    function formatRate(rate) {
      return Number.isFinite(rate) ? `${Math.round(rate * 100)}%` : '暂无数据';
    }

    function formatCount(value) {
      return Number.isFinite(value) ? String(value) : '暂无数据';
    }

    function buildState(binding) {
      const values = booleanValues(binding);
      const status = readStatus(binding);
      return { values, status, collection: readCollectionStatus(values), recommendations: status.recommendations };
    }

    function createCardModel(binding) {
      let cachedState;
      const listeners = new Set();
      let bindingDispose;
      const invalidate = () => {
        cachedState = undefined;
        for (const listener of [...listeners]) listener();
      };
      try {
        if (typeof binding.subscribe === 'function') bindingDispose = binding.subscribe(invalidate);
      } catch (_error) {
        bindingDispose = undefined;
      }
      return {
        getState() {
          if (!cachedState) cachedState = buildState(binding);
          return cachedState;
        },
        subscribe(listener) {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        async save(values) {
          const current = this.getState().values;
          const changed = SETTINGS_FIELDS.filter((field) => values[field] !== current[field]);
          if (changed.length === 0) return;
          if (typeof binding.set === 'function') {
            for (const field of changed) await binding.set(field, values[field]);
            return;
          }
          if (typeof binding.update === 'function') {
            await binding.update({ ...current, ...values });
            return;
          }
          throw new Error('Memory settings are not writable');
        },
        dispose() {
          listeners.clear();
          try {
            if (typeof bindingDispose === 'function') bindingDispose();
          } catch (_error) {
            // Host disposal is best effort.
          }
        }
      };
    }

    function createCardProps(binding, model, locale) {
      const state = model.getState();
      const dictionary = resolveLocaleDictionary(locale);
      const fields = SETTINGS_FIELDS.reduce((result, field) => {
        result[field] = {
          type: 'boolean',
          value: state.values[field],
          set: (value) => model.save({ ...model.getState().values, [field]: value })
        };
        return result;
      }, {});
      return {
        namespace: MEMORY_NAMESPACE,
        title: dictionary.title,
        description: dictionary.description,
        fields,
        values: state.values,
        status: state.status,
        collection: state.collection,
        recommendations: state.recommendations,
        dictionary,
        model
      };
    }

    function styleObject(...parts) {
      return Object.assign({}, ...parts.filter(Boolean));
    }

    const styles = Object.freeze({
      card: { listStyle: 'none', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, background: 'var(--dsw-alias-bg-layer-3)', color: 'var(--dsw-alias-label-primary)', overflow: 'hidden' },
      header: { width: '100%', appearance: 'none', border: 0, background: 'none', color: 'inherit', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', font: 'inherit' },
      headText: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 },
      title: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
      description: { fontSize: 13, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      pending: { flex: 'none', borderRadius: 999, padding: '1px 8px', fontSize: 11, lineHeight: '17px', fontWeight: 500, whiteSpace: 'nowrap', background: 'var(--dsw-alias-bg-module-platform)', color: 'var(--dsw-alias-label-secondary)' },
      chevron: { flex: 'none', color: 'var(--dsw-alias-label-tertiary)', fontSize: 18 },
      body: { borderTop: '1px solid var(--dsw-alias-border-l2)', padding: '0 16px 8px' },
      readOnly: { margin: '12px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      section: { padding: '14px 0 4px' },
      sectionTitle: { marginBottom: 8, fontSize: 11, lineHeight: 1.4, letterSpacing: '.05em', textTransform: 'uppercase', color: 'var(--dsw-alias-label-tertiary)' },
      group: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-3)' },
      field: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '12px 13px', borderBottom: '1px solid var(--dsw-alias-border-l2)', cursor: 'pointer' },
      fieldLast: { borderBottom: 0 },
      fieldText: { minWidth: 0, flex: 1 },
      fieldLabel: { fontSize: 14, lineHeight: 1.4, color: 'var(--dsw-alias-label-primary)' },
      fieldHint: { display: 'block', marginTop: 3, fontSize: 12, lineHeight: 1.45, color: 'var(--dsw-alias-label-tertiary)' },
      fieldState: { display: 'block', marginTop: 4, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' },
      checkbox: { flex: 'none', width: 18, height: 18, accentColor: 'var(--dsw-alias-brand-primary)' },
      collectionSummary: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 12px', borderBottom: '1px solid var(--dsw-alias-border-l2)', fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      summaryState: { color: 'var(--dsw-alias-label-primary)', fontWeight: 500 },
      privacyNote: { margin: '9px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      metrics: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8, padding: '12px 13px', borderTop: '1px solid var(--dsw-alias-border-l2)' },
      metric: { minWidth: 0, padding: 8, borderRadius: 8, background: 'var(--dsw-alias-bg-layer-2)' },
      metricLabel: { fontSize: 11, lineHeight: 1.35, color: 'var(--dsw-alias-label-tertiary)' },
      metricValue: { marginTop: 3, fontSize: 15, lineHeight: 1.3, color: 'var(--dsw-alias-label-primary)' },
      noMetrics: { padding: '12px 13px', fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' },
      footer: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 0 4px', borderTop: '1px solid var(--dsw-alias-border-l2)' },
      failure: { flex: 1, minWidth: 0, margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-error)' },
      button: { appearance: 'none', border: '1px solid transparent', borderRadius: 8, padding: '5px 14px', font: 'inherit', fontSize: 13, lineHeight: 1.5, cursor: 'pointer' },
      discard: { borderColor: 'var(--dsw-alias-border-l2)', background: 'none', color: 'var(--dsw-alias-label-secondary)' },
      save: { background: 'var(--dsw-alias-label-primary)', color: 'var(--dsw-alias-bg-layer-3)' },
      disabled: { opacity: 0.4, cursor: 'default' }
    });

    function fieldLabel(field, dictionary) {
      return dictionary?.fields?.[field]?.label || FIELD_DEFINITIONS[field]?.label || field;
    }

    function fieldHint(field, dictionary) {
      return dictionary?.fields?.[field]?.hint || FIELD_DEFINITIONS[field]?.hint || '';
    }

    function renderMetric(React, label, value, key) {
      return React.createElement('div', { key, style: styles.metric, 'data-dsh-memory-metric': key },
        React.createElement('div', { style: styles.metricLabel }, label),
        React.createElement('div', { style: styles.metricValue }, value));
    }

    function MemorySettingsCard(props) {
      const React = loadReact();
      if (!React || typeof React.createElement !== 'function') return null;

      const dictionary = props?.dictionary || LOCALE_DICTIONARIES.zh;
      const model = props?.model;
      const state = model?.getState?.() || {
        values: props?.values || {},
        status: props?.status || {},
        collection: props?.collection || readCollectionStatus(props?.values || {}),
        recommendations: props?.recommendations || null
      };
      const sourceValues = state.values || {};
      const hasHooks = typeof React.useState === 'function';
      const [open, setOpen] = hasHooks ? React.useState(false) : [true, () => {}];
      const [draft, setDraft] = hasHooks ? React.useState(() => ({ ...sourceValues })) : [{ ...sourceValues }, () => {}];
      const draftRef = typeof React.useRef === 'function' ? React.useRef({ ...sourceValues }) : { current: { ...sourceValues } };
      draftRef.current = draft;
      const [saving, setSaving] = hasHooks ? React.useState(false) : [false, () => {}];
      const [failed, setFailed] = hasHooks ? React.useState(false) : [false, () => {}];

      if (hasHooks && typeof React.useEffect === 'function' && model?.subscribe) {
        React.useEffect(() => model.subscribe(() => {
          const next = model.getState().values;
          draftRef.current = { ...next };
          setDraft({ ...next });
          setFailed(false);
        }), [model]);
      }

      const status = state.status || {};
      const disabled = status.writable === false || saving;
      const isDraftDirty = () => SETTINGS_FIELDS.some((field) => draftRef.current[field] !== sourceValues[field]);
      const dirty = isDraftDirty();
      const collection = readCollectionStatus(draft);
      const recommendations = state.recommendations;
      const metrics = recommendations ? [
        [dictionary.recommendationsRequests, formatCount(recommendations.requests), 'requests'],
        [dictionary.availableRequests, formatCount(recommendations.availableRequests), 'availableRequests'],
        [dictionary.contextualRequests, formatCount(recommendations.contextualRequests), 'contextualRequests'],
        [dictionary.contextMatches, formatCount(recommendations.contextMatches), 'contextMatches'],
        [dictionary.fallbackRequests, formatCount(recommendations.fallbackRequests), 'fallbackRequests'],
        [dictionary.suggestions, formatCount(recommendations.suggestions), 'suggestions'],
        [dictionary.contextMatchRate, formatRate(recommendations.contextMatchRate), 'contextMatchRate'],
        [dictionary.fallbackRate, formatRate(recommendations.fallbackRate), 'fallbackRate']
      ] : [];

      const changeField = (field, value) => {
        const next = { ...draftRef.current, [field]: value };
        draftRef.current = next;
        setDraft(next);
        setFailed(false);
      };
      const discard = () => {
        const next = { ...(model?.getState?.().values || sourceValues) };
        draftRef.current = next;
        setDraft(next);
        setFailed(false);
      };
      const save = () => {
        if (!model || disabled || !isDraftDirty()) return;
        setSaving(true);
        setFailed(false);
        Promise.resolve(model.save(draftRef.current)).then(() => {
          setSaving(false);
        }).catch(() => {
          setSaving(false);
          setFailed(true);
        });
      };

      const renderField = (field, index, fields) => {
        const enabled = draft[field] === true;
        return React.createElement('label', {
          key: field,
          style: styleObject(styles.field, index === fields.length - 1 ? styles.fieldLast : null),
          'data-dsh-memory-field': field
        },
        React.createElement('span', { style: styles.fieldText },
          React.createElement('span', { style: styles.fieldLabel }, fieldLabel(field, dictionary)),
          React.createElement('span', { style: styles.fieldHint }, fieldHint(field, dictionary)),
          FIELD_GROUPS.collection.includes(field)
            ? React.createElement('span', { style: styles.fieldState }, enabled ? dictionary.stateEnabled : dictionary.statePaused)
            : null),
        React.createElement('input', {
          type: 'checkbox',
          style: styles.checkbox,
          checked: enabled,
          disabled,
          onChange: (event) => changeField(field, event?.target?.checked === true)
        }));
      };
      const renderSection = (key, title, fields, children) => {
        const groupChildren = children || fields.map((field, index) => renderField(field, index, fields));
        return React.createElement('section', {
          key, style: styles.section, 'data-dsh-memory-section': key
        }, React.createElement('div', { style: styles.sectionTitle }, title),
        React.createElement('div', { style: styles.group }, ...groupChildren));
      };

      const collectionSummary = React.createElement('div', {
        style: styles.collectionSummary, 'data-dsh-memory': 'collection-status'
      }, React.createElement('span', null, formatMessage(`${dictionary.automaticCollection}：{state}`, {
        state: collection.automaticCollectionEnabled ? dictionary.enabled : dictionary.paused
      })), React.createElement('span', { style: styles.summaryState },
        formatMessage(dictionary.enabledCount, { count: collection.enabledCount })));
      const collectionChildren = [collectionSummary, ...FIELD_GROUPS.collection.map((field, index) => renderField(field, index, FIELD_GROUPS.collection))];
      const recommendationChildren = [
        renderField('enableRecommendations', 0, FIELD_GROUPS.recommendations),
        recommendations
          ? React.createElement('div', { key: 'metrics', style: styles.metrics, 'data-dsh-memory': 'recommendation-metrics' }, metrics.map(([label, value, key]) => renderMetric(React, label, value, key)))
          : React.createElement('div', { key: 'metrics', style: styles.noMetrics, 'data-dsh-memory': 'recommendation-metrics' }, dictionary.noMetrics)
      ];
      const privacyChildren = [
        renderField('allowClearMemory', 0, FIELD_GROUPS.privacy),
        React.createElement('p', { key: 'note', style: styles.privacyNote }, dictionary.privacyNote)
      ];

      const header = React.createElement('button', {
        type: 'button', style: styles.header, 'aria-expanded': open,
        'aria-label': `${open ? dictionary.collapse : dictionary.expand}: ${props?.title || dictionary.title}`,
        onClick: () => setOpen(!open)
      }, React.createElement('span', { style: styles.headText },
        React.createElement('span', { style: styles.title }, props?.title || dictionary.title),
        React.createElement('span', { style: styles.description }, props?.description || dictionary.description)),
      dirty ? React.createElement('span', { style: styles.pending }, dictionary.unsaved) : null,
      React.createElement('span', { style: styleObject(styles.chevron, open ? { transform: 'rotate(180deg)' } : null), 'aria-hidden': true }, '⌄'));

      const body = open ? React.createElement('div', { style: styles.body },
        status.writable === false ? React.createElement('p', { style: styles.readOnly, role: 'status' }, dictionary.readOnly) : null,
        renderSection('collection', dictionary.collection, FIELD_GROUPS.collection, collectionChildren),
        renderSection('recommendations', dictionary.recommendations, FIELD_GROUPS.recommendations, recommendationChildren),
        renderSection('privacy', dictionary.privacy, FIELD_GROUPS.privacy, privacyChildren),
        React.createElement('div', { style: styles.footer },
          failed ? React.createElement('p', { style: styles.failure, role: 'status' }, dictionary.saveFailed) : null,
          React.createElement('button', {
            type: 'button', style: styleObject(styles.button, styles.discard, (!dirty || saving) ? styles.disabled : null),
            disabled: !dirty || saving, onClick: discard
          }, dictionary.discard),
          React.createElement('button', {
            type: 'button', style: styleObject(styles.button, styles.save, (!dirty || disabled) ? styles.disabled : null),
            disabled: !dirty || disabled, onClick: save
          }, saving ? dictionary.saving : dictionary.save))
      ) : null;

      return React.createElement('li', { 'data-dsh-memory': MEMORY_NAMESPACE, style: styles.card }, header, body);
    }

    function registerLocale(ctx) {
      const locale = getCapability(ctx, 'locale');
      if (!locale || typeof locale.register !== 'function') return undefined;
      try {
        return locale.register(MEMORY_LOCALE_NAMESPACE, LOCALE_DICTIONARIES);
      } catch (_error) {
        return undefined;
      }
    }

    function apply(ctx) {
      const slots = getCapability(ctx, 'slots');
      const locale = getCapability(ctx, 'locale');
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

      const model = createCardModel(binding);
      const localeDispose = registerLocale(ctx);
      let slotDispose;
      let injectionDispose;
      try {
        injectionDispose = slots.inject(SLOT_NAME, () => {
          slotDispose = slots.register({
            name: SLOT_NAME,
            key: MEMORY_NAMESPACE,
            locale: MEMORY_LOCALE_NAMESPACE,
            inject: () => createCardProps(binding, model, locale)
          }, MemorySettingsCard);
          return slotDispose;
        });
      } catch (_error) {
        model.dispose();
        if (typeof localeDispose === 'function') localeDispose();
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
        if (typeof localeDispose === 'function') {
          try { localeDispose(); } catch (_error) { /* best effort */ }
        }
        model.dispose();
        try {
          if (typeof binding.dispose === 'function') binding.dispose();
        } catch (_error) {
          // Host disposal is best effort.
        }
      };

      if (typeof ctx?.effect === 'function') ctx.effect(() => dispose);
      return dispose;
    }

    module.exports = {
      inject: ['slots', 'locale', 'connection', 'remote', 'settingsScope'],
      MEMORY_NAMESPACE,
      MEMORY_LOCALE_NAMESPACE,
      SETTINGS_FIELDS,
      FIELD_GROUPS,
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
    globalObject.__ModuleLoader__.load({ id: '@ly028716/dsh-memory-plugin', factory });
  }
})(
  typeof window !== 'undefined' ? window : undefined,
  typeof module !== 'undefined' ? module : undefined,
  typeof require === 'function' ? require : undefined
);
