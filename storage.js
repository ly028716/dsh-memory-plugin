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

function cloneData(value) {
  if (value === undefined || value === null) return value;
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(defaults, value) {
  if (Array.isArray(defaults)) {
    return Array.isArray(value) ? cloneData(value) : cloneData(defaults);
  }

  if (defaults && typeof defaults === 'object') {
    const source = value && typeof value === 'object' && !Array.isArray(value)
      ? value
      : {};
    const result = {};

    for (const key of Object.keys(defaults)) {
      result[key] = mergeDefaults(defaults[key], source[key]);
    }

    for (const key of Object.keys(source)) {
      if (!(key in defaults)) {
        result[key] = cloneData(source[key]);
      }
    }

    return result;
  }

  return value === undefined ? defaults : cloneData(value);
}

function createDefaultMemory() {
  return cloneData(DEFAULT_MEMORY);
}

/**
 * MemoryStorage class for managing persistent memory data
 */
class MemoryStorage {
  constructor(storagePath) {
    if (typeof storagePath !== 'string' || storagePath.trim() === '') {
      throw new Error('storagePath must be a non-empty string');
    }

    this.storagePath = path.resolve(process.cwd(), storagePath);
    this.memory = null;
    this.isDirty = false;
    this._dirtyVersion = 0;
    this._initializePromise = null;
    this._saveQueue = Promise.resolve();
  }

  assertInitialized() {
    if (!this.memory) {
      throw new Error('Memory not initialized. Call initialize() first.');
    }
  }

  markDirty() {
    this.isDirty = true;
    this._dirtyVersion += 1;
  }

  /**
   * Initialize storage - load existing data or create new
   */
  async initialize() {
    if (this.memory) return;
    if (this._initializePromise) return this._initializePromise;

    this._initializePromise = (async () => {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });

      try {
        await this.load();
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;

        // File doesn't exist, create an isolated default data set.
        this.memory = createDefaultMemory();
        this.memory.metadata.createdAt = new Date().toISOString();
        this.markDirty();
        await this.save();
      }
    })();

    try {
      await this._initializePromise;
    } catch (error) {
      this.memory = null;
      this.isDirty = false;
      this._dirtyVersion = 0;
      throw error;
    } finally {
      this._initializePromise = null;
    }
  }

  /**
   * Load memory data from file
   */
  async load() {
    const content = await fs.readFile(this.storagePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid memory data format');
    }

    this.memory = mergeDefaults(DEFAULT_MEMORY, parsed);
    this.isDirty = false;
    this._dirtyVersion = 0;
  }

  /**
   * Save memory data to file atomically
   */
  async save() {
    this.assertInitialized();
    if (!this.isDirty) return;

    const version = this._dirtyVersion;
    const snapshot = cloneData(this.memory);
    snapshot.lastUpdated = new Date().toISOString();
    const tempPath = `${this.storagePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    const content = JSON.stringify(snapshot, null, 2);

    const operation = this._saveQueue.then(async () => {
      try {
        await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
        await fs.writeFile(tempPath, content, 'utf-8');
        await fs.rename(tempPath, this.storagePath);

        if (this._dirtyVersion === version) {
          this.memory.lastUpdated = snapshot.lastUpdated;
          this.isDirty = false;
        }
      } finally {
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
    });

    this._saveQueue = operation.catch(() => {});
    return operation;
  }

  /**
   * Get a value from memory by path
   * @param {string} dotPath - Dot notation path (e.g., 'userPreferences.defaultModel')
   * @returns {*} The value at the specified path
   */
  get(dotPath) {
    this.assertInitialized();

    const keys = dotPath.split('.');
    let current = this.memory;
    
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = current[key];
    }
    
    return cloneData(current);
  }

  /**
   * Set a value in memory by path
   * @param {string} dotPath - Dot notation path
   * @param {*} value - Value to set
   */
  set(dotPath, value) {
    this.assertInitialized();

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
    current[keys[keys.length - 1]] = cloneData(value);
    this.markDirty();
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
    await this.initialize();
    this.memory = createDefaultMemory();
    this.memory.metadata.createdAt = new Date().toISOString();
    this.markDirty();
    await this.save();
  }

  /**
   * Get memory statistics
   * @returns {Object} Statistics about the memory data
   */
  getStats() {
    this.assertInitialized();

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
    this.assertInitialized();
    return cloneData(this.memory);
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
    
    await this.initialize();
    this.memory = mergeDefaults(DEFAULT_MEMORY, data);
    this.markDirty();
    await this.save();
  }
}

module.exports = { MemoryStorage, DEFAULT_MEMORY };
