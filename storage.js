/**
 * Memory Storage Module
 * Handles reading, writing, and managing memory data persistence.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Default memory structure
 */
const DEFAULT_MEMORY = {
  version: '1.0.0',
  lastUpdated: null,
  userPreferences: {
    preferredAgents: [],
    defaultModel: null,
    language: null,
    workingDirectory: null,
    customSettings: {}
  },
  inputHabits: {
    commonCommands: [],
    frequentPatterns: [],
    preferredTools: []
  },
  projectContext: {
    activeProjects: []
  },
  sessionHistory: {
    recentTopics: [],
    frequentTasks: [],
    toolUsageStats: {}
  },
  metadata: {
    createdAt: null,
    totalSessions: 0,
    lastSessionDate: null
  }
};

/**
 * MemoryStorage class for managing persistent memory data
 */
class MemoryStorage {
  constructor(storagePath) {
    this.storagePath = path.resolve(process.cwd(), storagePath);
    this.memory = null;
    this.isDirty = false;
  }

  /**
   * Initialize storage - load existing data or create new
   */
  async initialize() {
    try {
      await this.load();
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, create with defaults
        this.memory = { ...DEFAULT_MEMORY };
        this.memory.metadata.createdAt = new Date().toISOString();
        await this.save();
      } else {
        throw error;
      }
    }
  }

  /**
   * Load memory data from file
   */
  async load() {
    const content = await fs.readFile(this.storagePath, 'utf-8');
    this.memory = JSON.parse(content);
    this.isDirty = false;
  }

  /**
   * Save memory data to file atomically
   */
  async save() {
    if (!this.isDirty && this.memory) {
      return; // No changes to save
    }

    this.memory.lastUpdated = new Date().toISOString();
    
    // Write to temporary file first, then rename for atomicity
    const tempPath = this.storagePath + '.tmp';
    const content = JSON.stringify(this.memory, null, 2);
    
    await fs.writeFile(tempPath, content, 'utf-8');
    await fs.rename(tempPath, this.storagePath);
    
    this.isDirty = false;
  }

  /**
   * Get a value from memory by path
   * @param {string} dotPath - Dot notation path (e.g., 'userPreferences.defaultModel')
   * @returns {*} The value at the specified path
   */
  get(dotPath) {
    if (!this.memory) {
      throw new Error('Memory not initialized. Call initialize() first.');
    }

    const keys = dotPath.split('.');
    let current = this.memory;
    
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }
    
    return current;
  }

  /**
   * Set a value in memory by path
   * @param {string} dotPath - Dot notation path
   * @param {*} value - Value to set
   */
  set(dotPath, value) {
    if (!this.memory) {
      throw new Error('Memory not initialized. Call initialize() first.');
    }

    const keys = dotPath.split('.');
    let current = this.memory;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!(key in current)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    current[keys[keys.length - 1]] = value;
    this.isDirty = true;
  }

  /**
   * Append an item to an array in memory
   * @param {string} dotPath - Dot notation path to the array
   * @param {*} item - Item to append
   * @param {number} maxLength - Maximum length of the array (optional)
   */
  async appendToArray(dotPath, item, maxLength = null) {
    let array = this.get(dotPath) || [];
    
    if (!Array.isArray(array)) {
      array = [];
    }
    
    // Add new item to the beginning
    array.unshift(item);
    
    // Trim if maxLength is specified
    if (maxLength && array.length > maxLength) {
      array = array.slice(0, maxLength);
    }
    
    this.set(dotPath, array);
    await this.save();
  }

  /**
   * Increment a counter in memory
   * @param {string} dotPath - Dot notation path to the counter
   * @param {number} amount - Amount to increment (default: 1)
   */
  increment(dotPath, amount = 1) {
    const current = this.get(dotPath) || 0;
    this.set(dotPath, current + amount);
  }

  /**
   * Update statistics for tool usage
   * @param {string} toolName - Name of the tool
   */
  async recordToolUsage(toolName) {
    const stats = this.get('sessionHistory.toolUsageStats') || {};
    stats[toolName] = (stats[toolName] || 0) + 1;
    this.set('sessionHistory.toolUsageStats', stats);
    await this.save();
  }

  /**
   * Add a project to active projects list
   * @param {Object} project - Project information
   */
  async addProject(project) {
    const projects = this.get('projectContext.activeProjects') || [];
    
    // Check if project already exists
    const existingIndex = projects.findIndex(p => p.path === project.path);
    
    if (existingIndex >= 0) {
      // Update existing project
      projects[existingIndex] = {
        ...projects[existingIndex],
        ...project,
        lastAccessed: new Date().toISOString()
      };
    } else {
      // Add new project
      projects.unshift({
        ...project,
        lastAccessed: new Date().toISOString()
      });
    }
    
    // Keep only recent projects
    const maxProjects = 20;
    if (projects.length > maxProjects) {
      projects.splice(maxProjects);
    }
    
    this.set('projectContext.activeProjects', projects);
    await this.save();
  }

  /**
   * Clear all memory data
   */
  async clear() {
    this.memory = { ...DEFAULT_MEMORY };
    this.memory.metadata.createdAt = new Date().toISOString();
    await this.save();
  }

  /**
   * Get memory statistics
   * @returns {Object} Statistics about the memory data
   */
  getStats() {
    if (!this.memory) {
      throw new Error('Memory not initialized');
    }

    return {
      totalSessions: this.memory.metadata.totalSessions,
      lastUpdated: this.memory.lastUpdated,
      trackedTools: Object.keys(this.memory.sessionHistory.toolUsageStats || {}).length,
      activeProjects: (this.memory.projectContext.activeProjects || []).length,
      preferredAgents: (this.memory.userPreferences.preferredAgents || []).length
    };
  }

  /**
   * Export memory data for backup
   * @returns {Object} Complete memory data
   */
  exportData() {
    if (!this.memory) {
      throw new Error('Memory not initialized');
    }
    return { ...this.memory };
  }

  /**
   * Import memory data from backup
   * @param {Object} data - Memory data to import
   */
  async importData(data) {
    // Basic validation
    if (!data.version || !data.metadata) {
      throw new Error('Invalid memory data format');
    }
    
    this.memory = data;
    this.isDirty = true;
    await this.save();
  }
}

module.exports = { MemoryStorage, DEFAULT_MEMORY };
