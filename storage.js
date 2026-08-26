/**
 * Memory Storage Module
 * Handles reading, writing, and managing memory data persistence.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { redactSensitiveData } = require('./privacy');
const { INPUT_LIMITS, assertDataWithinLimits } = require('./limits');
const { CURRENT_DATA_VERSION, CURRENT_SCHEMA_VERSION, migrateData } = require('./migrations');

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
  version: CURRENT_DATA_VERSION,
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
    schemaVersion: CURRENT_SCHEMA_VERSION,
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

  async writeSnapshot(snapshot) {
    const tempPath = `${this.storagePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
    const content = JSON.stringify(snapshot, null, 2);
    assertDataWithinLimits(snapshot, 'memory file', INPUT_LIMITS.maxMemoryFileBytes);

    try {
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
    } finally {
      try {
        await fs.unlink(tempPath);
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
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
  async initialize(options = {}) {
    if (this.memory) return;
    if (this._initializePromise) return this._initializePromise;

    const persistIfMissing = options.persistIfMissing !== false;
    const persistSanitized = options.persistSanitized !== false;

    this._initializePromise = (async () => {
      try {
        await this.load({ persistSanitized });
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;

        // File doesn't exist, create an isolated default data set.
        this.memory = createDefaultMemory();
        this.memory.metadata.createdAt = new Date().toISOString();
        if (persistIfMissing) {
          await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
          this.markDirty();
          await this.save();
        }
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
  async load(options = {}) {
    const persistSanitized = options.persistSanitized !== false;
    const content = await fs.readFile(this.storagePath, 'utf-8');
    const parsed = JSON.parse(content);
    assertDataWithinLimits(parsed, 'memory file', INPUT_LIMITS.maxMemoryFileBytes);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Invalid memory data format');
    }

    const migrated = migrateData(parsed);
    const sanitized = redactSensitiveData(migrated);
    this.memory = mergeDefaults(DEFAULT_MEMORY, sanitized);
    const migrationApplied = parsed.version !== migrated.version;
    this.isDirty = migrationApplied || JSON.stringify(sanitized) !== JSON.stringify(parsed);
    this._dirtyVersion = 0;
    this._dirtyPaths.clear();
    this._replaceOnSave = this.isDirty;
    if (this.isDirty && (persistSanitized || migrationApplied)) {
      await this.save();
    } else if (this.isDirty) {
      this.isDirty = false;
      this._dirtyPaths.clear();
      this._replaceOnSave = false;
    }
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

        await this.writeSnapshot(persistedSnapshot);

        if (this._dirtyVersion === version) {
          this.memory = cloneData(persistedSnapshot);
          this.isDirty = false;
          this._dirtyPaths.clear();
          this._replaceOnSave = false;
        }
      } finally {
        await this.releaseLock(ownerToken);
      }
    });

    this._saveQueue = operation.catch(() => {});
    return operation;
  }

  async flush() {
    await this._saveQueue;
  }

  async readPersistedSnapshot() {
    try {
      const latestContent = await fs.readFile(this.storagePath, 'utf8');
      const latestParsed = JSON.parse(latestContent);
      assertDataWithinLimits(latestParsed, 'memory file', INPUT_LIMITS.maxMemoryFileBytes);
      return mergeDefaults(DEFAULT_MEMORY, redactSensitiveData(migrateData(latestParsed)));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return cloneData(this.memory);
    }
  }

  async mutatePersisted(dotPath, mutate) {
    this.assertInitialized();
    parseDotPath(dotPath);
    if (typeof mutate !== 'function') throw new Error('mutate must be a function');

    const operation = this._saveQueue.then(async () => {
      await fs.mkdir(path.dirname(this.storagePath), { recursive: true });
      const ownerToken = await this.acquireLock();
      try {
        const persistedSnapshot = await this.readPersistedSnapshot();
        const nextValue = redactSensitiveData(mutate(cloneData(getPathValue(persistedSnapshot, dotPath))));
        assertDataWithinLimits(nextValue, 'stored value', INPUT_LIMITS.maxStoredValueBytes);
        setPathValue(persistedSnapshot, dotPath, nextValue);
        persistedSnapshot.lastUpdated = new Date().toISOString();
        await this.writeSnapshot(persistedSnapshot);

        setPathValue(this.memory, dotPath, nextValue);
        this.memory.lastUpdated = persistedSnapshot.lastUpdated;
      } finally {
        await this.releaseLock(ownerToken);
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
    return this.mutatePersisted(dotPath, (current) => {
      let array = Array.isArray(current) ? current : [];
      array.unshift(item);

      if (maxLength && array.length > maxLength) {
        array = array.slice(0, maxLength);
      }
      return array;
    });
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
    this.assertInitialized();
    if (typeof toolName !== 'string' || toolName.trim() === '') {
      throw new Error('toolName must be a non-empty string');
    }
    assertSafeKey(toolName);
    return this.mutatePersisted('sessionHistory.toolUsageStats', (stats) => {
      const nextStats = stats && typeof stats === 'object' && !Array.isArray(stats) ? stats : {};
      const currentCount = Number.isSafeInteger(nextStats[toolName]) && nextStats[toolName] >= 0
        ? nextStats[toolName]
        : 0;
      nextStats[toolName] = currentCount + 1;
      return nextStats;
    });
  }

  /**
   * Add a project to active projects list
   * @param {Object} project - Project information
   */
  async addProject(project) {
    return this.mutatePersisted('projectContext.activeProjects', (current) => {
      const projects = Array.isArray(current) ? current : [];
      const existingIndex = projects.findIndex((existing) => existing.path === project.path);

      if (existingIndex >= 0) {
        projects[existingIndex] = {
          ...projects[existingIndex],
          ...project,
          lastAccessed: new Date().toISOString()
        };
      } else {
        projects.unshift({
          ...project,
          lastAccessed: new Date().toISOString()
        });
      }

      if (projects.length > 20) projects.splice(20);
      return projects;
    });
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
    assertDataWithinLimits(data, 'import data', INPUT_LIMITS.maxMemoryFileBytes);
    await this.initialize();
    await this.replaceData(data);
  }

  async replaceData(data) {
    assertDataWithinLimits(data, 'import data', INPUT_LIMITS.maxMemoryFileBytes);
    const migrated = migrateData(data);
    this.memory = mergeDefaults(DEFAULT_MEMORY, redactSensitiveData(migrated));
    this.markDirty();
    await this.save();
  }
}

module.exports = { MemoryStorage, DEFAULT_MEMORY, cloneData, parseDotPath };
