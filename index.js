/**
 * DSH Memory Plugin
 * 
 * A plugin that remembers user preferences, habits, and context to provide
 * intelligent recommendations and improve the development experience.
 * 
 * Features:
 * - Tracks tool usage patterns
 * - Remembers user preferences (agents, models, settings)
 * - Records project context
 * - Provides smart recommendations
 * - Persistent storage with auto-save
 */

const { validateConfig } = require('./config');
const { MemoryStorage } = require('./storage');
const { MemoryManager } = require('./memory-manager');
const { redactSensitiveData } = require('./privacy');
const { buildMemoryContext } = require('./memory-context');
const { createMemoryTool } = require('./memory-tool');
const { registerMemorySettings, pickSettings } = require('./memory-settings');

module.exports = {
  name: 'memory',
  
  /**
   * Apply the memory plugin to the DSH context
   * @param {Object} ctx - DSH context object
   * @param {Object} userConfig - User configuration
   */
  apply(ctx, userConfig = {}) {
    try {
      // Validate configuration
      const config = validateConfig(userConfig);
      console.log('Memory plugin loaded with config:', {
        storagePath: config.storagePath,
        trackingEnabled: {
          tools: config.trackToolCalls,
          preferences: config.trackPreferences,
          projects: config.trackProjectContext,
          sessions: config.trackSessionHistory
        }
      });
      
      // Create storage instance
      const storage = new MemoryStorage(config.storagePath);
      
      // Create memory manager
      const memoryManager = new MemoryManager(config, storage);

      // Keep the agent tool on the public memory API surface. In particular,
      // do not pass the manager or its storage through to the tool directly.
      const memoryFacade = {
        setPreference: (key, value) => memoryManager.recordPreference(key, value),
        recordTopic: (topic) => memoryManager.recordSessionItem('topic', topic),
        recordTask: (task) => memoryManager.recordSessionItem('task', task),
        addProject: (projectInfo) => memoryManager.recordProjectContext(projectInfo),
        exportData: () => memoryManager.exportData(),
        clearMemory: () => memoryManager.clearMemory()
      };

      // Register optional DSH capabilities without changing the existing
      // memory service or automatic collection policy.
      const registrationDisposers = [];
      if (ctx.systemPrompt && typeof ctx.systemPrompt.context === 'function') {
        const dispose = ctx.systemPrompt.context({
          name: 'dsh-memory:context',
          order: 120,
          text: () => {
            try {
              return buildMemoryContext(memoryManager.exportData());
            } catch (_error) {
              return '';
            }
          }
        });
        if (typeof dispose === 'function') registrationDisposers.push(dispose);
      }

      if (ctx.tools && typeof ctx.tools.register === 'function') {
        const dispose = ctx.tools.register(createMemoryTool(memoryFacade, config));
        if (typeof dispose === 'function') registrationDisposers.push(dispose);
      }

      const settingsDispose = registerMemorySettings(ctx, config, (nextSettings) => {
        const wasAutomaticCollectionEnabled = memoryManager.isAutomaticCollectionEnabled();
        Object.assign(config, pickSettings(nextSettings));
        Object.assign(memoryManager.config, pickSettings(nextSettings));
        const isAutomaticCollectionEnabled = memoryManager.isAutomaticCollectionEnabled();

        if (memoryManager.sessionStartTime) {
          if (!wasAutomaticCollectionEnabled && isAutomaticCollectionEnabled) {
            memoryManager.startAutoSave();
          } else if (wasAutomaticCollectionEnabled && !isAutomaticCollectionEnabled) {
            memoryManager.stopAutoSave();
          }
        }
      });
      if (typeof settingsDispose === 'function') registrationDisposers.push(settingsDispose);

      if (registrationDisposers.length > 0 && typeof ctx.effect === 'function') {
        ctx.effect(() => () => {
          for (const dispose of registrationDisposers.splice(0)) {
            try {
              dispose();
            } catch (error) {
              console.error('Memory plugin: Failed to dispose DSH registration:', error.message);
            }
          }
        });
      }
      
      // Initialize memory system
      let isInitialized = false;
      let initializationPromise = null;
      
      const initializeMemory = async () => {
        if (isInitialized) return;

        if (initializationPromise) return initializationPromise;

        initializationPromise = (async () => {
          try {
            await memoryManager.initialize();
            // Record current working directory only when automatic project
            // collection is explicitly enabled.
            if (config.trackProjectContext) {
              const cwd = process.cwd();
              await memoryManager.recordProjectContext({
                path: cwd,
                name: cwd.split(/[\\/]/).pop() || cwd,
                tags: ['current-workspace']
              });
            }
            isInitialized = true;
            console.log('Memory system initialized successfully');
          } catch (error) {
            console.error('Memory plugin: Initialization failed:', error.message);
            throw error;
          } finally {
            initializationPromise = null;
          }
        })();

        return initializationPromise;
      };
      
      // Subscribe to tool calls to track usage
      if (config.trackToolCalls && ctx.on) {
        // Cordis event listeners are lifecycle-bound effects and are removed
        // automatically when the plugin unloads.
        ctx.on('tools/result', async (exec, result) => {
          try {
            await initializeMemory();
            await memoryManager.recordToolCall({
              name: exec.name,
              args: exec.arguments,
              result
            });
          } catch (error) {
            console.error('Memory plugin: Failed to record tool call:', error.message);
          }
        });
      }
      
      // Register cleanup effect
      ctx.effect(() => {
        return async () => {
          console.log('Memory plugin: Cleaning up...');
          await memoryManager.dispose();
        };
      });
      
      // Expose memory manager API through context for other plugins/features
      const ready = initializeMemory();

      ctx.provide('memory', {
        ready,

        // Preference management
        ...memoryFacade,
        getPreference: (key) => storage.memory ? storage.get(`userPreferences.${key}`) : undefined,

        // Recommendations
        getRecommendations: (context) => memoryManager.getRecommendations(context),

        // Statistics
        getStats: () => memoryManager.getStats(),

        // Data management
        importData: (data) => memoryManager.importData(data),

        // Direct storage access (advanced)
        storage: {
          get: (path) => storage.memory ? storage.get(path) : undefined,
          set: (path, value) => {
            const safeValue = redactSensitiveData(value);
            if (storage.memory) {
              storage.set(path, safeValue);
              return storage.save();
            }
            return ready.then(() => {
              storage.set(path, safeValue);
              return storage.save();
            });
          },
          save: () => ready.then(() => storage.save())
        }
      });

      ready.catch(error => {
        console.error('Memory plugin: Async initialization failed:', error.message);
      });
      
    } catch (error) {
      console.error('Memory plugin: Configuration validation failed:', error.message);
      throw error;
    }
  }
};
