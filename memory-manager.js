/**
 * Memory Manager
 * Core logic for tracking, analyzing, and managing user memory data.
 */

const { MemoryStorage, DEFAULT_MEMORY, cloneData, parseDotPath } = require('./storage');
const path = require('path');
const { redactSensitiveData, redactProjectPath } = require('./privacy');

class MemoryManager {
  constructor(config, storage) {
    this.config = config;
    this.storage = storage;
    this.autoSaveTimer = null;
    this.sessionStartTime = null;
    this._initializePromise = null;
  }

  /**
   * Initialize the memory manager
   */
  async initialize() {
    if (this.sessionStartTime) return;
    if (this._initializePromise) return this._initializePromise;

    this._initializePromise = (async () => {
      await this.storage.initialize();
      this.startAutoSave();
      this.sessionStartTime = Date.now();

      // Update session metadata
      this.storage.increment('metadata.totalSessions');
      this.storage.set('metadata.lastSessionDate', new Date().toISOString());
      await this.storage.save();
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

  /**
   * Start automatic saving at configured intervals
   */
  startAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    
    this.autoSaveTimer = setInterval(async () => {
      try {
        await this.storage.save();
      } catch (error) {
        console.error('Memory plugin: Auto-save failed:', error.message);
      }
    }, this.config.autoSaveInterval);
  }

  /**
   * Stop automatic saving
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
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

    await this.ensureInitialized();

    const { name, args, result } = toolCall;
    
    // Record tool usage statistics
    await this.storage.recordToolUsage(name);
    
    // Track preferred tools
    if (this.config.trackPreferences) {
      const preferredTools = this.storage.get('inputHabits.preferredTools') || [];
      
      if (!preferredTools.includes(name)) {
        preferredTools.push(name);
        this.storage.set('inputHabits.preferredTools', preferredTools);
      }
    }
    
    // Analyze command patterns
    if (args && args.command) {
      await this.analyzeCommand(redactSensitiveData(args.command));
    }
  }

  /**
   * Analyze and record command patterns
   * @param {string} command - The command that was executed
   */
  async analyzeCommand(command) {
    if (typeof command !== 'string') {
      throw new Error('command must be a string');
    }

    await this.ensureInitialized();
    const safeCommand = redactSensitiveData(command);
    const commonCommands = this.storage.get('inputHabits.commonCommands') || [];
    
    // Check if command already exists
    const existingIndex = commonCommands.findIndex(cmd => cmd.command === safeCommand);
    
    if (existingIndex >= 0) {
      // Increment count
      commonCommands[existingIndex].count++;
      commonCommands[existingIndex].lastUsed = new Date().toISOString();
    } else {
      // Add new command
      commonCommands.unshift({
        command: safeCommand,
        count: 1,
        firstUsed: new Date().toISOString(),
        lastUsed: new Date().toISOString()
      });
    }
    
    // Sort by frequency and trim
    commonCommands.sort((a, b) => b.count - a.count);
    if (commonCommands.length > this.config.maxHistoryItems) {
      commonCommands.splice(this.config.maxHistoryItems);
    }
    
    this.storage.set('inputHabits.commonCommands', commonCommands);
    await this.storage.save();
  }

  /**
   * Record user preference update
   * @param {string} preferenceKey - The preference key
   * @param {*} value - The preference value
   */
  async recordPreference(preferenceKey, value) {
    if (!this.config.trackPreferences) return;

    if (typeof preferenceKey !== 'string' || preferenceKey.trim() === '') {
      throw new Error('preferenceKey must be a non-empty string');
    }

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
    if (!this.config.trackProjectContext) return;

    if (!projectInfo || typeof projectInfo !== 'object' || Array.isArray(projectInfo)) {
      throw new Error('projectInfo must be an object');
    }

    if (typeof projectInfo.path !== 'string' || projectInfo.path.trim() === '') {
      throw new Error('projectInfo.path must be a non-empty string');
    }

    if (projectInfo.name !== undefined && typeof projectInfo.name !== 'string') {
      throw new Error('projectInfo.name must be a string');
    }

    if (projectInfo.tags !== undefined && (!Array.isArray(projectInfo.tags) || projectInfo.tags.some((tag) => typeof tag !== 'string'))) {
      throw new Error('projectInfo.tags must be an array of strings');
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
    if (!this.config.trackSessionHistory) return;

    if (type !== 'topic' && type !== 'task') {
      throw new Error('session item type must be topic or task');
    }

    if (typeof content !== 'string') {
      throw new Error('session item content must be a string');
    }

    await this.ensureInitialized();
    
    const path = type === 'topic' 
      ? 'sessionHistory.recentTopics'
      : 'sessionHistory.frequentTasks';
    
    await this.storage.appendToArray(path, {
      content: redactSensitiveData(content),
      timestamp: new Date().toISOString()
    }, this.config.maxHistoryItems);
  }

  /**
   * Get recommendations based on memory data
   * @param {string} context - Current context for recommendations
   * @returns {Object} Recommendations object
   */
  getRecommendations(context) {
    if (!this.config.enableRecommendations) {
      return { available: false };
    }

    const recommendations = {
      available: true,
      suggestions: []
    };

    if (!this.storage.memory) return recommendations;

    // Recommend preferred agents
    const preferredAgents = this.storage.get('userPreferences.preferredAgents') || [];
    if (preferredAgents.length > 0) {
      recommendations.suggestions.push({
        type: 'agent',
        items: preferredAgents.slice(0, 3),
        reason: 'Based on your usage history'
      });
    }

    // Recommend default model
    const defaultModel = this.storage.get('userPreferences.defaultModel');
    if (defaultModel) {
      recommendations.suggestions.push({
        type: 'model',
        items: [defaultModel],
        reason: 'Your preferred model'
      });
    }

    // Recommend common commands
    const commonCommands = this.storage.get('inputHabits.commonCommands') || [];
    if (commonCommands.length > 0) {
      recommendations.suggestions.push({
        type: 'commands',
        items: commonCommands.slice(0, 5).map(cmd => cmd.command),
        reason: 'Frequently used commands'
      });
    }

    // Recommend projects
    const activeProjects = this.storage.get('projectContext.activeProjects') || [];
    if (activeProjects.length > 0) {
      recommendations.suggestions.push({
        type: 'projects',
        items: activeProjects.slice(0, 3).map(p => p.name || p.path),
        reason: 'Recently accessed projects'
      });
    }

    return recommendations;
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
    await this.storage.importData(redactSensitiveData(data));
  }

  /**
   * Clear all memory data
   */
  async clearMemory() {
    if (!this.config.allowClearMemory) {
      throw new Error('Memory clearing is disabled in configuration');
    }
    
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
    }
  }
}

module.exports = { MemoryManager };
