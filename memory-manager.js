/**
 * Memory Manager
 * Core logic for tracking, analyzing, and managing user memory data.
 */

const { MemoryStorage, DEFAULT_MEMORY, cloneData, parseDotPath } = require('./storage');
const { DataLifecycleManager } = require('./data-lifecycle');
const fs = require('fs').promises;
const path = require('path');
const { redactSensitiveData, redactProjectPath } = require('./privacy');
const {
  INPUT_LIMITS,
  assertTextLength,
  assertDataWithinLimits,
  trimArrayToLimits
} = require('./limits');

const IMPORTED_HISTORY_FIELDS = [
  ['inputHabits', 'commonCommands'],
  ['inputHabits', 'frequentPatterns'],
  ['inputHabits', 'preferredTools'],
  ['sessionHistory', 'recentTopics'],
  ['sessionHistory', 'frequentTasks']
];

function boundImportedHistory(data, maxHistoryItems) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return data;

  for (const [sectionName, fieldName] of IMPORTED_HISTORY_FIELDS) {
    const section = data[sectionName];
    if (!section || typeof section !== 'object' || Array.isArray(section)) continue;
    if (Array.isArray(section[fieldName])) {
      section[fieldName] = trimArrayToLimits(
        section[fieldName],
        maxHistoryItems,
        INPUT_LIMITS.maxStoredValueBytes
      );
    }
  }

  return data;
}

function isRecoverableMemoryFileError(error) {
  return error instanceof SyntaxError || error?.message === 'Invalid memory data format';
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecommendationCommand(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    isNonEmptyString(value.command) && Number.isFinite(value.count);
}

function isRecommendationProject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) &&
    isNonEmptyString(value.path);
}

class MemoryManager {
  constructor(config, storage) {
    this.config = config;
    this.storage = storage;
    this.lifecycle = new DataLifecycleManager(storage, config);
    this.autoSaveTimer = null;
    this._autoSaveGeneration = 0;
    this.sessionStartTime = null;
    this._initializePromise = null;
    this.recommendationMetrics = {
      requests: 0,
      availableRequests: 0,
      contextualRequests: 0,
      contextMatches: 0,
      fallbackRequests: 0,
      suggestions: 0
    };
  }

  /**
   * Initialize the memory manager
   */
  async initialize() {
    if (this.sessionStartTime) return;
    if (this._initializePromise) return this._initializePromise;

    this._initializePromise = (async () => {
      const automaticCollectionEnabled = this.isAutomaticCollectionEnabled();
      if (this.config.backupOnInitialize) {
        try {
          await fs.access(this.storage.storagePath);
          await this.lifecycle.backupFile('startup');
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      try {
        await this.storage.initialize({
          persistIfMissing: automaticCollectionEnabled,
          persistSanitized: automaticCollectionEnabled
        });
      } catch (error) {
        if (!isRecoverableMemoryFileError(error)) throw error;
        try {
          const recovery = await this.lifecycle.recoverFromLatestBackup();
          console.warn(`Memory plugin: Recovered corrupt memory from backup ${recovery.restored}`);
        } catch (recoveryError) {
          error.recoveryError = recoveryError;
          throw error;
        }
      }
      if (automaticCollectionEnabled) this.startAutoSave();
      this.sessionStartTime = Date.now();

      // Update session metadata
      if (automaticCollectionEnabled) {
        await this.storage.recordSessionStart();
      }
      await this.lifecycle.applyRetention();
    })();

    try {
      await this._initializePromise;
    } catch (error) {
      this.stopAutoSave();
      this.sessionStartTime = null;
      throw error;
    } finally {
      this._initializePromise = null;
    }
  }

  async ensureInitialized() {
    await this.initialize();
  }

  isAutomaticCollectionEnabled() {
    return this.config.trackToolCalls ||
      this.config.trackPreferences ||
      this.config.trackProjectContext ||
      this.config.trackSessionHistory;
  }

  /**
   * Start automatic saving at configured intervals
   */
  startAutoSave() {
    this.stopAutoSave();
    const generation = this._autoSaveGeneration;
    const schedule = () => {
      if (generation !== this._autoSaveGeneration) return;
      this.autoSaveTimer = setTimeout(async () => {
        if (generation !== this._autoSaveGeneration) return;
        try {
          await this.storage.save();
        } catch (error) {
          console.error('Memory plugin: Auto-save failed:', error.message);
        } finally {
          schedule();
        }
      }, this.config.autoSaveInterval);
    };

    schedule();
  }

  /**
   * Stop automatic saving.
   */
  stopAutoSave() {
    this._autoSaveGeneration += 1;
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Record a tool call
   * @param {Object} toolCall - Tool call information
   */
  async recordToolCall(toolCall) {
    if (!this.config.trackToolCalls) return;

    if (!toolCall || typeof toolCall !== 'object' || typeof toolCall.name !== 'string' || toolCall.name.trim() === '') {
      throw new Error('toolCall.name must be a non-empty string');
    }
    assertTextLength(toolCall.name, 'toolCall.name', INPUT_LIMITS.maxProjectNameLength);

    await this.ensureInitialized();

    const { name, args } = toolCall;
    const mutations = [
      {
        dotPath: 'sessionHistory.toolUsageStats',
        mutate: (stats) => {
          const nextStats = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
          const currentCount = Number.isSafeInteger(nextStats[name]) && nextStats[name] >= 0
            ? nextStats[name]
            : 0;
          nextStats[name] = currentCount + 1;
          return nextStats;
        }
      }
    ];

    if (this.config.trackPreferences) {
      mutations.push({
        dotPath: 'inputHabits.preferredTools',
        maxArrayBytes: INPUT_LIMITS.maxStoredValueBytes,
        mutate: (tools) => {
          const nextTools = Array.isArray(tools) ? tools : [];
          if (!nextTools.includes(name)) nextTools.push(name);
          return nextTools;
        }
      });
    }

    if (args && args.command) {
      if (typeof args.command !== 'string') throw new Error('command must be a string');
      assertTextLength(args.command, 'command');
      const safeCommand = redactSensitiveData(args.command);
      mutations.push({
        dotPath: 'inputHabits.commonCommands',
        maxArrayLength: this.config.maxHistoryItems,
        mutate: (commands) => {
          const nextCommands = Array.isArray(commands) ? commands : [];
          const existingIndex = nextCommands.findIndex((entry) => entry && entry.command === safeCommand);
          const now = new Date().toISOString();

          if (existingIndex >= 0) {
            const existing = nextCommands[existingIndex];
            existing.count = Number.isSafeInteger(existing.count) && existing.count >= 0 ? existing.count + 1 : 1;
            existing.lastUsed = now;
          } else {
            nextCommands.unshift({ command: safeCommand, count: 1, firstUsed: now, lastUsed: now });
          }

          nextCommands.sort((left, right) => right.count - left.count);
          return nextCommands.slice(0, this.config.maxHistoryItems);
        }
      });
    }

    await this.storage.mutatePersistedBatch(mutations);
  }

  /**
   * Analyze and record command patterns
   * @param {string} command - The command that was executed
   */
  async analyzeCommand(command) {
    if (typeof command !== 'string') {
      throw new Error('command must be a string');
    }
    assertTextLength(command, 'command');

    await this.ensureInitialized();
    const safeCommand = redactSensitiveData(command);
    await this.storage.recordCommandUsage(safeCommand, this.config.maxHistoryItems);
  }

  /**
   * Record user preference update
   * @param {string} preferenceKey - The preference key
   * @param {*} value - The preference value
   */
  async recordPreference(preferenceKey, value) {
    if (typeof preferenceKey !== 'string' || preferenceKey.trim() === '') {
      throw new Error('preferenceKey must be a non-empty string');
    }
    assertTextLength(preferenceKey, 'preferenceKey', INPUT_LIMITS.maxProjectNameLength);
    assertDataWithinLimits(value, 'stored value', INPUT_LIMITS.maxStoredValueBytes);

    parseDotPath(`userPreferences.${preferenceKey}`);
    await this.ensureInitialized();
    
    this.storage.set(`userPreferences.${preferenceKey}`, redactSensitiveData(value));
    await this.storage.save();
  }

  /**
   * Record active project context
   * @param {Object} projectInfo - Project information
   */
  async recordProjectContext(projectInfo) {
    if (!projectInfo || typeof projectInfo !== 'object' || Array.isArray(projectInfo)) {
      throw new Error('projectInfo must be an object');
    }

    if (typeof projectInfo.path !== 'string' || projectInfo.path.trim() === '') {
      throw new Error('projectInfo.path must be a non-empty string');
    }
    assertTextLength(projectInfo.path, 'projectInfo.path', INPUT_LIMITS.maxProjectPathLength);

    if (projectInfo.name !== undefined && typeof projectInfo.name !== 'string') {
      throw new Error('projectInfo.name must be a string');
    }
    if (projectInfo.name !== undefined) {
      assertTextLength(projectInfo.name, 'projectInfo.name', INPUT_LIMITS.maxProjectNameLength);
    }

    if (projectInfo.tags !== undefined && (!Array.isArray(projectInfo.tags) || projectInfo.tags.some((tag) => typeof tag !== 'string'))) {
      throw new Error('projectInfo.tags must be an array of strings');
    }
    if (projectInfo.tags !== undefined) {
      if (projectInfo.tags.length > INPUT_LIMITS.maxTags) {
        throw new Error(`projectInfo.tags must not contain more than ${INPUT_LIMITS.maxTags} items`);
      }
      projectInfo.tags.forEach((tag) => assertTextLength(tag, 'projectInfo.tag', INPUT_LIMITS.maxTagLength));
    }

    await this.ensureInitialized();
    
    const safeProjectInfo = redactSensitiveData(projectInfo);
    safeProjectInfo.path = redactProjectPath(safeProjectInfo.path);

    await this.storage.addProject({
      path: safeProjectInfo.path,
      name: safeProjectInfo.name || path.basename(safeProjectInfo.path),
      tags: safeProjectInfo.tags || []
    });
  }

  /**
   * Record session topic or task
   * @param {string} type - 'topic' or 'task'
   * @param {string} content - The topic or task content
   */
  async recordSessionItem(type, content) {
    if (type !== 'topic' && type !== 'task') {
      throw new Error('session item type must be topic or task');
    }

    if (typeof content !== 'string') {
      throw new Error('session item content must be a string');
    }
    assertTextLength(content, 'session item content');

    await this.ensureInitialized();
    
    const path = type === 'topic' 
      ? 'sessionHistory.recentTopics'
      : 'sessionHistory.frequentTasks';
    
    await this.storage.appendToArray(path, {
      content: redactSensitiveData(content),
      timestamp: new Date().toISOString()
    }, this.config.maxHistoryItems, 'content');
  }

  /**
   * Get recommendations based on memory data
   * @param {string} context - Current context for recommendations
   * @returns {Object} Recommendations object
   */
  getRecommendations(context) {
    this.recommendationMetrics.requests += 1;

    if (!this.config.enableRecommendations) {
      return { available: false };
    }

    this.recommendationMetrics.availableRequests += 1;

    const recommendations = {
      available: true,
      suggestions: []
    };

    if (!this.storage.memory) return recommendations;

    // Recommend preferred agents
    const preferredAgents = (this.storage.get('userPreferences.preferredAgents') || [])
      .filter(isNonEmptyString);
    if (preferredAgents.length > 0) {
      recommendations.suggestions.push({
        type: 'agent',
        items: preferredAgents.slice(0, 3),
        reason: 'Based on your usage history'
      });
    }

    // Recommend default model
    const defaultModel = this.storage.get('userPreferences.defaultModel');
    if (isNonEmptyString(defaultModel)) {
      recommendations.suggestions.push({
        type: 'model',
        items: [defaultModel],
        reason: 'Your preferred model'
      });
    }

    const contextTokens = typeof context === 'string'
      ? context.trim().toLowerCase().split(/\s+/).filter(Boolean)
      : [];
    const hasContext = contextTokens.length > 0;
    if (hasContext) this.recommendationMetrics.contextualRequests += 1;

    const matchesContext = (value) => {
      if (contextTokens.length === 0) return true;
      const text = String(value || '').toLowerCase();
      return contextTokens.some((token) => text.includes(token));
    };

    // Recommend common commands that have reached the recognition threshold
    const commonCommands = this.storage.get('inputHabits.commonCommands') || [];
    const frequentCommands = commonCommands.filter((command) => (
      isRecommendationCommand(command) && command.count >= this.config.patternRecognitionThreshold
    ));
    const contextualCommands = frequentCommands.filter((command) => matchesContext(command.command));
    const commandsToRecommend = contextualCommands.length > 0 ? contextualCommands : frequentCommands;
    if (commandsToRecommend.length > 0) {
      recommendations.suggestions.push({
        type: 'commands',
        items: commandsToRecommend.slice(0, 5).map(cmd => cmd.command),
        reason: 'Frequently used commands'
      });
    }

    // Recommend projects
    const activeProjects = (this.storage.get('projectContext.activeProjects') || [])
      .filter(isRecommendationProject);
    const contextualProjects = activeProjects.filter((project) => matchesContext([
      project.name,
      project.path,
      ...(Array.isArray(project.tags) ? project.tags.filter(isNonEmptyString) : [])
    ].join(' ')));
    const projectsToRecommend = contextualProjects.length > 0 ? contextualProjects : activeProjects;
    if (projectsToRecommend.length > 0) {
      recommendations.suggestions.push({
        type: 'projects',
        items: projectsToRecommend.slice(0, 3).map(p => p.name || p.path),
        reason: 'Recently accessed projects'
      });
    }

    if (hasContext) {
      const hasContextMatch = contextualCommands.length > 0 || contextualProjects.length > 0;
      const hasFallbackCandidate = !hasContextMatch && (
        frequentCommands.length > 0 || activeProjects.length > 0
      );
      if (hasContextMatch) this.recommendationMetrics.contextMatches += 1;
      else if (hasFallbackCandidate) this.recommendationMetrics.fallbackRequests += 1;
    }

    this.recommendationMetrics.suggestions += recommendations.suggestions.length;

    return recommendations;
  }

  /**
   * Get privacy-safe recommendation quality metrics for the current process.
   * @returns {Object} Recommendation request, coverage, and fallback metrics
   */
  getRecommendationMetrics() {
    const { contextualRequests } = this.recommendationMetrics;
    return {
      ...this.recommendationMetrics,
      contextMatchRate: contextualRequests > 0
        ? this.recommendationMetrics.contextMatches / contextualRequests
        : null,
      fallbackRate: contextualRequests > 0
        ? this.recommendationMetrics.fallbackRequests / contextualRequests
        : null,
      patternRecognitionThreshold: this.config.patternRecognitionThreshold
    };
  }

  /**
   * Get memory statistics
   * @returns {Object} Statistics
   */
  getStats() {
    if (!this.storage.memory) {
      return {
        totalSessions: 0,
        lastUpdated: null,
        trackedTools: 0,
        activeProjects: 0,
        preferredAgents: 0
      };
    }

    return this.storage.getStats();
  }

  /**
   * Export memory data
   * @returns {Object} Complete memory data
   */
  exportData() {
    if (!this.storage.memory) return cloneData(DEFAULT_MEMORY);

    return this.storage.exportData();
  }

  /**
   * Import memory data
   * @param {Object} data - Memory data to import
   */
  async importData(data) {
    await this.ensureInitialized();
    const safeData = boundImportedHistory(
      redactSensitiveData(data),
      this.config.maxHistoryItems
    );
    await this.lifecycle.backup('import-safety');
    await this.storage.importData(safeData);
  }

  async backup(reason = 'manual') {
    await this.ensureInitialized();
    return this.lifecycle.backup(reason);
  }

  async listBackups() {
    await this.ensureInitialized();
    return this.lifecycle.listBackups();
  }

  async restoreBackup(name) {
    await this.ensureInitialized();
    return this.lifecycle.restoreBackup(name);
  }

  async applyRetention() {
    await this.ensureInitialized();
    return this.lifecycle.applyRetention();
  }

  /**
   * Clear all memory data
   */
  async clearMemory() {
    if (!this.config.allowClearMemory) {
      throw new Error('Memory clearing is disabled in configuration');
    }

    await this.ensureInitialized();
    await this.lifecycle.backup('clear-safety');
    await this.storage.clear();
  }

  /**
   * Cleanup resources
   */
  async dispose() {
    if (this._initializePromise) {
      await this._initializePromise.catch(() => {});
    }
    this.stopAutoSave();
    if (this.storage.memory) {
      await this.storage.save();
      await this.storage.flush();
    }
  }
}

module.exports = { MemoryManager };
