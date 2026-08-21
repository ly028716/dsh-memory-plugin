/**
 * Memory Storage Module
 * Handles reading, writing, and managing memory data persistence.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redactSensitiveData } = require('./privacy');
const { INPUT_LIMITS, assertDataWithinLimits } = require('./limits');

const UNSAFE_PATH_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);
const LOCK_RETRY_INTERVAL_MS = 25;
const LOCK_TIMEOUT_MS = 5000;
const LOCK_STALE_AFTER_MS = 30000;

function parseDotPath(dotPath) {
  if (typeof dotPath !== 'string' || dotPath.trim() === '') {
    throw new Error('Storage path must be a non-empty string');
  }

  const keys = dotPath.split('.');
  if (keys.some((key) => key === '' || UNSAFE_PATH_SEGMENTS.has(key))) {
    throw new Error(`Unsafe storage path: ${dotPath}`);
  }

  return keys;
}

function assertSafeKey(key) {
  if (UNSAFE_PATH_SEGMENTS.has(key)) {
    throw new Error(`Unsafe memory key: ${key}`);
  }
}

function getPathValue(value, dotPath) {
  let current = value;
  for (const key of parseDotPath(dotPath)) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = current[key];
  }
  return current;
}

function setPathValue(value, dotPath, nestedValue) {
  const keys = parseDotPath(dotPath);
  let current = value;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index];
    if (!current[key] || typeof current[key] !== 'object' || Array.isArray(current[key])) {
      current[key] = {};
    }
    current = current[key];
  }
  current[keys[keys.length - 1]] = cloneData(nestedValue);
}

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
      assertSafeKey(key);
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
    this.lockPath = `${this.storagePath}.lock`;
    this._dirtyPaths = new Set();
    this._replaceOnSave = false;
  }

  async acquireLock() {
    const startedAt = Date.now();
    const ownerToken = crypto.randomBytes(16).toString('hex');

    while (Date.now() - startedAt < LOCK_TIMEOUT_MS) {
      try {
        const handle = await fs.open(this.lockPath, 'wx');
        try {
          await handle.writeFile(JSON.stringify({
            pid: process.pid,
            ownerToken,
            createdAt: new Date().toISOString()
          }), 'utf8');
        } finally {
          await handle.close();
        }
        return ownerToken;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;

        try {
          const lockStat = await fs.stat(this.lockPath);
          if (Date.now() - lockStat.mtimeMs > LOCK_STALE_AFTER_MS) {
            await fs.unlink(this.lockPath);
            continue;
          }
        } catch (statError) {
          if (statError.code !== 'ENOENT') throw statError;
        }

        await new Promise((resolve) => setTimeout(resolve, LOCK_RETRY_INTERVAL_MS));
      }
    }

    throw new Error(`Timed out waiting for storage lock: ${this.lockPath}`);
  }

  async releaseLock(ownerToken) {
    if (typeof ownerToken !== 'string' || ownerToken.length === 0) return;

    try {
      const content = await fs.readFile(this.lockPath, 'utf8');
      let lockData;
      try {
        lockData = JSON.parse(content);
      } catch (error) {
        return;
      }
      if (lockData.ownerToken !== ownerToken) return;
      await fs.unlink(this.lockPath);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }

  async setPrivateFileMode(filePath) {
    try {
      await fs.chmod(filePath, 0o600);
    } catch (error) {
      if (process.platform !== 'win32' || !['EPERM', 'ENOSYS'].includes(error.code)) throw error;
    }
  }

  assertInitialized() {
    if (!this.memory) {
      throw new Error('Memory not initialized. Call initialize() first.');
    }
  }

  markDirty(dotPath = null) {
    this.isDirty = true;
    this._dirtyVersion += 1;
    if (dotPath === null) {
      this._replaceOnSave = true;
    } else {
      this._dirtyPaths.add(dotPath);
    }
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
      this._dirtyPaths.clear();
      this._replaceOnSave = false;
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
    assertDataWithinLimits(parsed, 'memory file', INPUT_LIMITS.maxMemoryFileBytes);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid memory data format');
    }

    const sanitized = redactSensitiveData(parsed);
    this.memory = mergeDefaults(DEFAULT_MEMORY, sanitized);
    this.isDirty = JSON.stringify(sanitized) !== JSON.stringify(parsed);
    this._dirtyVersion = 0;
    this._dirtyPaths.clear();
    this._replaceOnSave = this.isDirty;
    if (this.isDirty) await this.save();
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
    const dirtyPaths = [...this._dirtyPaths];
    const replaceOnSave = this._replaceOnSave;
    const tempPath = `${this.storagePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;

    const operation = this._saveQueue.then(async () => {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      const ownerToken = await this.acquireLock();
      try {
        let persistedSnapshot = snapshot;
        if (!replaceOnSave) {
          try {
            const latestContent = await fs.readFile(this.storagePath, 'utf8');
            const latestParsed = JSON.parse(latestContent);
            persistedSnapshot = mergeDefaults(DEFAULT_MEMORY, latestParsed);
            for (const dirtyPath of dirtyPaths) {
              setPathValue(persistedSnapshot, dirtyPath, getPathValue(snapshot, dirtyPath));
            }
            persistedSnapshot.lastUpdated = snapshot.lastUpdated;
          } catch (error) {
            if (error.code !== 'ENOENT') throw error;
          }
        }

        const content = JSON.stringify(persistedSnapshot, null, 2);
        assertDataWithinLimits(persistedSnapshot, 'memory file', INPUT_LIMITS.maxMemoryFileBytes);
        const handle = await fs.open(tempPath, 'w', 0o600);
        try {
          await handle.writeFile(content, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        await this.setPrivateFileMode(tempPath);
        await fs.rename(tempPath, this.storagePath);
        await this.setPrivateFileMode(this.storagePath);

        if (this._dirtyVersion === version) {
          this.memory = cloneData(persistedSnapshot);
          this.isDirty = false;
          this._dirtyPaths.clear();
          this._replaceOnSave = false;
        }
      } finally {
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
        await this.releaseLock(ownerToken);
      }
    });

    this._saveQueue = operation.catch(() => {});
    return operation;
  }

  async flush() {
    await this._saveQueue;
  }

  /**
   * Get a value from memory by path
   * @param {string} dotPath - Dot notation path (e.g., 'userPreferences.defaultModel')
   * @returns {*} The value at the specified path
   */
  get(dotPath) {
    this.assertInitialized();

    const keys = parseDotPath(dotPath);
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
    assertDataWithinLimits(value, 'stored value', INPUT_LIMITS.maxStoredValueBytes);

    const keys = parseDotPath(dotPath);
    let current = this.memory;
    
    // Navigate to the parent object
    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current || typeof current !== 'object' || Array.isArray(current)) {
        throw new Error(`Cannot set nested storage path: ${dotPath}`);
      }
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        current[key] = {};
      }
      current = current[key];
    }
    
    // Set the final value
    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      throw new Error(`Cannot set nested storage path: ${dotPath}`);
    }
    const safeValue = redactSensitiveData(value);
    assertDataWithinLimits(safeValue, 'stored value', INPUT_LIMITS.maxStoredValueBytes);
    current[keys[keys.length - 1]] = cloneData(safeValue);
    this.markDirty(dotPath);
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
    if (!data || typeof data !== 'object' || Array.isArray(data) || !data.version || !data.metadata) {
      throw new Error('Invalid memory data format');
    }
    assertDataWithinLimits(data, 'import data', INPUT_LIMITS.maxMemoryFileBytes);
    
    await this.initialize();
    this.memory = mergeDefaults(DEFAULT_MEMORY, redactSensitiveData(data));
    this.markDirty();
    await this.save();
  }
}

module.exports = { MemoryStorage, DEFAULT_MEMORY, cloneData, parseDotPath };
