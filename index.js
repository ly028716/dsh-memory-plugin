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
      
      // Initialize memory system
      let isInitialized = false;
      
      const initializeMemory = async () => {
        if (isInitialized) return;
        
        try {
          await memoryManager.initialize();
          isInitialized = true;
          console.log('Memory system initialized successfully');
          
          // Record current working directory as project context
          const cwd = process.cwd();
          await memoryManager.recordProjectContext({
            path: cwd,
            name: cwd.split(/[\\/]/).pop() || cwd,
            tags: ['current-workspace']
          });
        } catch (error) {
          console.error('Memory plugin: Initialization failed:', error.message);
        }
      };
      
      // Subscribe to tool calls to track usage
      if (config.trackToolCalls && ctx.subscribe) {
        ctx.effect(() => {
          // Try to subscribe to tool call events
          // Note: The actual event system may vary based on DSH version
          const unsubscribe = ctx.subscribe?.('tool-call', async (event) => {
            if (!isInitialized) {
              await initializeMemory();
            }
            
            try {
              await memoryManager.recordToolCall({
                name: event.toolName || event.name,
                args: event.args,
                result: event.result
              });
            } catch (error) {
              console.error('Memory plugin: Failed to record tool call:', error.message);
            }
          });
          
          return () => {
            if (unsubscribe) {
              unsubscribe();
            }
          };
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
      if (ctx.registerService) {
        ctx.registerService('memory', {
          // Preference management
          setPreference: (key, value) => memoryManager.recordPreference(key, value),
          getPreference: (key) => storage.get(`userPreferences.${key}`),
          
          // Session tracking
          recordTopic: (topic) => memoryManager.recordSessionItem('topic', topic),
          recordTask: (task) => memoryManager.recordSessionItem('task', task),
          
          // Project context
          addProject: (projectInfo) => memoryManager.recordProjectContext(projectInfo),
          
          // Recommendations
          getRecommendations: (context) => memoryManager.getRecommendations(context),
          
          // Statistics
          getStats: () => memoryManager.getStats(),
          
          // Data management
          exportData: () => memoryManager.exportData(),
          importData: (data) => memoryManager.importData(data),
          clearMemory: () => memoryManager.clearMemory(),
          
          // Direct storage access (advanced)
          storage: {
            get: (path) => storage.get(path),
            set: (path, value) => storage.set(path, value)
          }
        });
      }
      
      // Initialize on first use
      initializeMemory().catch(error => {
        console.error('Memory plugin: Async initialization failed:', error.message);
      });
      
    } catch (error) {
      console.error('Memory plugin: Configuration validation failed:', error.message);
      throw error;
    }
  }
};
