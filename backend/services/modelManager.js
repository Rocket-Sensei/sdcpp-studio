/**
 * Model Manager Service
 *
 * Manages Stable Diffusion model configurations and processes.
 * Handles loading model configs from YAML, starting/stopping model processes,
 * and tracking running model instances.
 *
 * Supports both server mode (long-running HTTP server) and CLI mode (one-shot per image).
 * Supports both on_demand mode (start/stop as needed) and preload mode (start on startup).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';
import { spawn } from 'child_process';
import { broadcastModelStatus } from './websocket.js';
import { createLogger, logCliCommand, logCliOutput, logCliError, getSdCppLogger } from '../utils/logger.js';

const logger = createLogger('modelManager');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths
const PROJECT_ROOT = path.join(__dirname, '../..');  // Project root (two levels up from backend/services/)
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../config/models.yml');
const CONFIG_DIR = path.join(__dirname, '../config');

// Files that are NOT model configs (loaded in specific order)
const NON_MODEL_CONFIGS = ['settings.yml', 'upscalers.yml'];

// Model status constants
export const ModelStatus = {
  STOPPED: 'stopped',
  STARTING: 'starting',
  RUNNING: 'running',
  STOPPING: 'stopping',
  ERROR: 'error'
};

// Execution mode constants
export const ExecMode = {
  SERVER: 'server',
  CLI: 'cli',
  API: 'api'  // External API (OpenAI-compatible, no local server needed)
};

// Load mode constants
export const LoadMode = {
  ON_DEMAND: 'on_demand',
  PRELOAD: 'preload'
};

/**
 * Process entry for tracking running model processes
 */
class ProcessEntry {
  constructor(modelId, process, port, execMode, options = {}) {
    this.modelId = modelId;
    this.process = process;
    this.port = port;
    this.execMode = execMode;
    this.startedAt = options.startedAt || Date.now();
    this.pid = process.pid;
    this.status = options.status || ModelStatus.STARTING;
    this.exitCode = null;
    this.signal = null;
    this.outputBuffer = [];
    this.errorBuffer = [];
    this.command = options.command || '';
    this.args = options.args || [];
  }

  /**
   * Get process uptime in seconds
   */
  getUptime() {
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  /**
   * Get recent output lines
   */
  getRecentOutput(lines = 10) {
    return this.outputBuffer.slice(-lines);
  }

  /**
   * Get recent error lines
   */
  getRecentErrors(lines = 10) {
    return this.errorBuffer.slice(-lines);
  }

  /**
   * Append output to buffer
   */
  appendOutput(data) {
    const text = data.toString().trim();
    if (text) {
      this.outputBuffer.push(`[${new Date().toISOString()}] ${text}`);
      // Keep buffer size manageable
      if (this.outputBuffer.length > 100) {
        this.outputBuffer = this.outputBuffer.slice(-50);
      }
    }
  }

  /**
   * Append error to buffer
   */
  appendError(data) {
    const text = data.toString().trim();
    if (text) {
      this.errorBuffer.push(`[${new Date().toISOString()}] ${text}`);
      // Keep buffer size manageable
      if (this.errorBuffer.length > 100) {
        this.errorBuffer = this.errorBuffer.slice(-50);
      }
    }
  }
}

/**
 * Main Model Manager class
 */
export class ModelManager {
  constructor(options = {}) {
    // Support single config path, array of paths, or use default multi-config setup
    if (options.configPaths) {
      this.configPaths = Array.isArray(options.configPaths) ? options.configPaths : [options.configPaths];
    } else if (options.configPath) {
      this.configPaths = [options.configPath];
    } else {
      // Auto-detect all YAML config files in the config directory
      this.configPaths = this._discoverConfigFiles();
    }

    // In-memory storage
    this.models = new Map(); // modelId -> model config
    this.processes = new Map(); // modelId -> ProcessEntry
    this.defaultModelId = null;
    this.defaultModels = null; // Map of job type to default model ID
    this.configLoaded = false;
    this.isShuttingDown = false;

    // Port management
    this.usedPorts = new Set();
    this.nextAvailablePort = options.startPort || 8000;

    // Event callbacks
    this.onProcessExit = options.onProcessExit || null;
    this.onProcessError = options.onProcessError || null;

    // Bind methods
    this._handleProcessExit = this._handleProcessExit.bind(this);
    this._handleProcessError = this._handleProcessError.bind(this);
  }

  /**
   * Load and parse models.yml configuration file(s)
   * Supports multiple config files - later configs override earlier ones
   * @returns {boolean} True if config loaded successfully
   */
  loadConfig() {
    try {
      logger.info({ configFiles: this.configPaths.length }, 'Loading configuration');

      // Merge all configs
      let mergedConfig = { models: {}, upscalers: {} };
      const loadedFiles = [];

      for (const configPath of this.configPaths) {
        // Check if file exists
        if (!fs.existsSync(configPath)) {
          logger.warn({ configPath }, 'Configuration file not found - skipping');
          continue;
        }

        // Read and parse YAML
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(fileContent);

        if (!config || typeof config !== 'object') {
          logger.warn({ configPath }, 'Invalid configuration - skipping');
          continue;
        }

        // Merge models (later configs override)
        if (config.models) {
          Object.assign(mergedConfig.models, config.models);
        }

        // Merge upscalers
        if (config.upscalers) {
          Object.assign(mergedConfig.upscalers, config.upscalers);
        }

        // Capture default settings (last one wins)
        if (config.default_model) {
          mergedConfig.default_model = config.default_model;
        }
        if (config.default) {
          mergedConfig.default_model = config.default;
        }
        if (config.default_models) {
          mergedConfig.default_models = { ...mergedConfig.default_models, ...config.default_models };
        }

        loadedFiles.push(configPath);
        logger.debug({ configPath }, 'Loaded configuration from file');
      }

      if (loadedFiles.length === 0) {
        throw new Error('No valid configuration files found');
      }

      logger.info({ count: loadedFiles.length }, 'Loaded configuration files');

      // Parse default model configuration
      // Support both legacy 'default' and new 'default_model' and 'default_models'
      this.defaultModelId = mergedConfig.default_model || null;
      this.defaultModels = mergedConfig.default_models || null;

      logger.info({ defaultModel: this.defaultModelId || 'none' }, 'Default model');
      if (this.defaultModels) {
        logger.info({ defaultModels: this.defaultModels }, 'Type-specific defaults');
      }

      // Parse models
      const modelsConfig = mergedConfig.models || {};
      this.models.clear();

      for (const [modelId, modelConfig] of Object.entries(modelsConfig)) {
        // Validate required fields
        if (!modelConfig.name) {
          logger.warn({ modelId }, 'Model missing name, skipping');
          continue;
        }
        // Determine exec_mode first
        if (!modelConfig.exec_mode || !Object.values(ExecMode).includes(modelConfig.exec_mode)) {
          logger.warn({ modelId }, 'Model has invalid exec_mode, defaulting to server');
          modelConfig.exec_mode = ExecMode.SERVER;
        }
        // Command is required for SERVER and CLI modes, but not for API mode
        if ((modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.CLI) && !modelConfig.command) {
          logger.warn({ modelId, execMode: modelConfig.exec_mode }, 'Model missing command, skipping');
          continue;
        }
        // API key is required for API mode
        if (modelConfig.exec_mode === ExecMode.API && !modelConfig.api_key) {
          logger.warn({ modelId }, 'Model missing api_key, skipping');
          continue;
        }
        if (!modelConfig.mode || !Object.values(LoadMode).includes(modelConfig.mode)) {
          logger.warn({ modelId }, 'Model has invalid mode, defaulting to on_demand');
          modelConfig.mode = LoadMode.ON_DEMAND;
        }

        // Normalize args to array
        if (!modelConfig.args) {
          modelConfig.args = [];
        } else if (!Array.isArray(modelConfig.args)) {
          logger.warn({ modelId }, 'Model args is not an array, converting');
          modelConfig.args = [modelConfig.args];
        }

        // Auto-fill api field from port for server mode if not present
        if (modelConfig.exec_mode === ExecMode.SERVER && modelConfig.port && !modelConfig.api) {
          modelConfig.api = `http://127.0.0.1:${modelConfig.port}/v1`;
          logger.debug({ modelId, api: modelConfig.api }, 'Auto-filled api field');
        }

        // Auto-add --listen-port from port field for server mode if not in args
        if (modelConfig.exec_mode === ExecMode.SERVER && modelConfig.port) {
          const listenPortIdx = modelConfig.args.findIndex(arg =>
            arg === '--listen-port' || arg === '-l' || arg.startsWith('--listen-port=')
          );
          // Only add if --listen-port is not already in args
          if (listenPortIdx === -1) {
            // Check if -l flag exists (short form)
            const lFlagIdx = modelConfig.args.indexOf('-l');
            if (lFlagIdx === -1) {
              // Neither --listen-port nor -l found, add both
              modelConfig.args.push('-l');
              modelConfig.args.push('127.0.0.1');
              modelConfig.args.push('--listen-port');
              modelConfig.args.push(String(modelConfig.port));
              logger.debug({ modelId, port: modelConfig.port }, 'Auto-added --listen-port to args');
            } else {
              // -l exists, check if port follows it
              if (modelConfig.args[lFlagIdx + 1] && !modelConfig.args[lFlagIdx + 1].match(/^\d+$/)) {
                // -l is followed by a host address, check if --listen-port follows
                if (!modelConfig.args.includes('--listen-port')) {
                  // Insert --listen-port after the host address
                  modelConfig.args.splice(lFlagIdx + 2, 0, '--listen-port', String(modelConfig.port));
                  logger.debug({ modelId, port: modelConfig.port }, 'Auto-added --listen-port after -l 127.0.0.1');
                }
              }
            }
          }
        }

        // Ensure capabilities is an array, default to text-to-image if not specified
        if (!modelConfig.capabilities) {
          // Infer capabilities from model_type if available
          if (modelConfig.model_type === 'image-to-image') {
            modelConfig.capabilities = ['image-to-image', 'text-to-image'];
          } else {
            modelConfig.capabilities = ['text-to-image'];
          }
        } else if (!Array.isArray(modelConfig.capabilities)) {
          modelConfig.capabilities = [modelConfig.capabilities];
        }

        // Store model config
        this.models.set(modelId, {
          id: modelId,
          ...modelConfig
        });

        logger.debug({ modelId, name: modelConfig.name }, 'Loaded model');
      }

      this.configLoaded = true;
      logger.info({ count: this.models.size }, 'Configuration loaded successfully');

      return true;

    } catch (error) {
      logger.error({ error }, 'Failed to load configuration');
      throw error;
    }
  }

  /**
   * Get model configuration by ID
   * @param {string} modelId - Model identifier
   * @returns {Object|null} Model configuration or null if not found
   */
  getModel(modelId) {
    if (!this.configLoaded) {
      logger.warn('Configuration not loaded, calling loadConfig()');
      this.loadConfig();
    }

    return this.models.get(modelId) || null;
  }

  /**
   * Get all available models
   * @returns {Array} Array of model configurations
   */
  getAllModels() {
    if (!this.configLoaded) {
      logger.warn('Configuration not loaded, calling loadConfig()');
      this.loadConfig();
    }

    return Array.from(this.models.values()).map(model => {
      const modelStatus = this.getModelStatus(model.id);
      return {
        ...model,
        isRunning: this.isModelRunning(model.id),
        status: modelStatus.status,
        pid: modelStatus.pid || null,
        port: modelStatus.port || null
      };
    });
  }

  /**
   * Get default model configuration
   * @returns {Object|null} Default model configuration or null
   */
  getDefaultModel() {
    if (!this.configLoaded) {
      this.loadConfig();
    }

    // First check if there's a model with default: true flag
    for (const [modelId, model] of this.models.entries()) {
      if (model.default === true) {
        return this.getModel(modelId);
      }
    }

    // Fall back to global default setting
    if (!this.defaultModelId) {
      return null;
    }

    return this.getModel(this.defaultModelId);
  }

  /**
   * Get default model for a specific job type
   * @param {string} jobType - Job type ('generate', 'edit', 'variation')
   * @returns {Object|null} Default model configuration or null
   */
  getDefaultModelForType(jobType) {
    if (!this.configLoaded) {
      this.loadConfig();
    }

    // Map job types to default_models keys
    const typeMap = {
      'generate': 'text_to_image',
      'edit': 'image_to_image',
      'variation': 'image_to_image'
    };

    const typeKey = typeMap[jobType];
    if (!typeKey) {
      // No specific type mapping, use global default
      return this.getDefaultModel();
    }

    // Check if we have a type-specific default
    if (this.defaultModels && this.defaultModels[typeKey]) {
      const modelId = this.defaultModels[typeKey];
      return this.getModel(modelId);
    }

    // Fall back to global default
    return this.getDefaultModel();
  }

  /**
   * Get running models
   * @returns {Array} Array of running model info
   */
  getRunningModels() {
    const running = [];

    for (const [modelId, processEntry] of this.processes.entries()) {
      const model = this.getModel(modelId);
      if (model && processEntry.status === ModelStatus.RUNNING) {
        running.push({
          id: modelId,
          name: model.name,
          pid: processEntry.pid,
          port: processEntry.port,
          execMode: processEntry.execMode,
          uptime: processEntry.getUptime(),
          startedAt: processEntry.startedAt
        });
      }
    }

    return running;
  }

  /**
   * Start a model process
   * @param {string} modelId - Model identifier to start
   * @param {Object} options - Optional overrides
   * @returns {Promise<ProcessEntry>} Process entry for the started process
   */
  async startModel(modelId, options = {}) {
    if (this.isShuttingDown) {
      throw new Error('Cannot start model during shutdown');
    }

    const model = this.getModel(modelId);
    if (!model) {
      throw new Error(`Model not found: ${modelId}`);
    }

    if (this.isModelRunning(modelId)) {
      logger.warn({ modelId, name: model.name }, 'Model is already running');
      return this.processes.get(modelId);
    }

    logger.info({ modelId, name: model.name }, 'Starting model');

    try {
      // Determine port
      const port = options.port || model.port || this._getAvailablePort();

      // Build command and args
      const command = options.command || model.command;
      const args = options.args || model.args || [];

      // Replace port in args if needed
      const processedArgs = this._processArgs(args, { port, model });

      // Spawn process
      const processOptions = {
        cwd: options.cwd || PROJECT_ROOT,  // Default to project root so paths resolve correctly
        env: { ...process.env, ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false
      };

      logger.debug({ command, args: processedArgs }, 'Spawning process');

      const childProcess = spawn(command, processedArgs, processOptions);

      // Log the command to sdcpp.log for server mode
      if (model.exec_mode === ExecMode.SERVER) {
        logCliCommand(command, processedArgs, { cwd: processOptions.cwd });
      }

      // Create process entry
      const processEntry = new ProcessEntry(modelId, childProcess, port, model.exec_mode, {
        command,
        args: processedArgs,
        status: ModelStatus.STARTING
      });

      // Set up output handlers
      childProcess.stdout.on('data', (data) => {
        const output = data.toString();
        processEntry.appendOutput(data);
        logger.debug({ modelId, output: output.trim() }, 'Process stdout');

        // Log to sdcpp.log for server mode processes
        if (model.exec_mode === ExecMode.SERVER) {
          const sdcppLogger = getSdCppLogger();
          sdcppLogger.info({ modelId, stdout: output.trim() }, 'Server output');
          sdcppLogger.flush();
        }

        // Detect when server is ready (looks for common patterns)
        if (processEntry.status === ModelStatus.STARTING) {
          if (this._isServerReady(output)) {
            processEntry.status = ModelStatus.RUNNING;
            logger.info({ modelId, port }, 'Model is now running');
            // Broadcast model status change
            broadcastModelStatus(modelId, ModelStatus.RUNNING, {
              port,
              execMode: model.exec_mode,
              pid: processEntry.pid,
            });
          }
        }
      });

      childProcess.stderr.on('data', (data) => {
        const error = data.toString();
        processEntry.appendError(error);
        logger.debug({ modelId, output: error.trim() }, 'Process stderr');

        // Log to sdcpp.log for server mode processes
        if (model.exec_mode === ExecMode.SERVER) {
          const sdcppLogger = getSdCppLogger();
          sdcppLogger.warn({ modelId, stderr: error.trim() }, 'Server error');
          sdcppLogger.flush();
        }
      });

      // Set up exit handler
      childProcess.on('exit', (code, signal) => {
        this._handleProcessExit(modelId, code, signal);
      });

      childProcess.on('error', (error) => {
        this._handleProcessError(modelId, error);
      });

      // Store process
      this.processes.set(modelId, processEntry);
      this.usedPorts.add(port);

      // For CLI mode, we expect quick exit
      if (model.exec_mode === ExecMode.CLI) {
        processEntry.status = ModelStatus.RUNNING;
      }

      // Wait for server mode to be ready (with timeout)
      if (model.exec_mode === ExecMode.SERVER) {
        await this._waitForServerReady(processEntry, options.timeout || 30000);
      }

      return processEntry;

    } catch (error) {
      logger.error({ error, modelId }, 'Failed to start model');
      throw error;
    }
  }

  /**
   * Stop a model process
   * @param {string} modelId - Model identifier to stop
   * @param {Object} options - Stop options
   * @returns {Promise<boolean>} True if stopped successfully
   */
  async stopModel(modelId, options = {}) {
    const processEntry = this.processes.get(modelId);

    if (!processEntry) {
      logger.warn({ modelId }, 'No running process for model');
      return false;
    }

    logger.info({ modelId, pid: processEntry.pid }, 'Stopping model');

    try {
      processEntry.status = ModelStatus.STOPPING;

      const { force = false, timeout = 10000 } = options;
      const childProcess = processEntry.process;

      if (force) {
        // Force kill immediately
        childProcess.kill('SIGKILL');
      } else {
        // Try graceful shutdown first
        childProcess.kill('SIGTERM');

        // Wait for process to exit
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            if (childProcess && !childProcess.killed) {
              logger.warn({ modelId }, 'Model did not exit gracefully, forcing');
              childProcess.kill('SIGKILL');
            }
            resolve();
          }, timeout);

          childProcess.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      // Clean up
      this.processes.delete(modelId);
      if (processEntry.port) {
        this.usedPorts.delete(processEntry.port);
      }

      logger.info({ modelId }, 'Model stopped');
      // Broadcast model status change
      broadcastModelStatus(modelId, ModelStatus.STOPPED, {});
      return true;

    } catch (error) {
      logger.error({ error, modelId }, 'Error stopping model');
      processEntry.status = ModelStatus.ERROR;
      // Broadcast model status change
      broadcastModelStatus(modelId, ModelStatus.ERROR, { error: error.message });
      return false;
    }
  }

  /**
   * Check if a model is currently running
   * @param {string} modelId - Model identifier
   * @returns {boolean} True if model is running
   */
  isModelRunning(modelId) {
    const processEntry = this.processes.get(modelId);
    if (!processEntry) {
      return false;
    }

    // Check if process is still alive
    const process = processEntry.process;
    if (!process || process.killed || process.exitCode !== null) {
      return false;
    }

    return processEntry.status === ModelStatus.RUNNING ||
           processEntry.status === ModelStatus.STARTING;
  }

  /**
   * Get model status
   * @param {string} modelId - Model identifier
   * @returns {Object} Status object
   */
  getModelStatus(modelId) {
    const model = this.getModel(modelId);

    if (!model) {
      return {
        exists: false,
        status: ModelStatus.ERROR,
        error: 'Model not found'
      };
    }

    const processEntry = this.processes.get(modelId);

    if (!processEntry) {
      return {
        exists: true,
        id: modelId,
        name: model.name,
        status: ModelStatus.STOPPED,
        execMode: model.exec_mode,
        mode: model.mode
      };
    }

    const isAlive = processEntry.process && !processEntry.process.killed && processEntry.process.exitCode === null;

    return {
      exists: true,
      id: modelId,
      name: model.name,
      status: isAlive ? processEntry.status : ModelStatus.STOPPED,
      pid: processEntry.pid,
      port: processEntry.port,
      execMode: processEntry.execMode,
      mode: model.mode,
      uptime: isAlive ? processEntry.getUptime() : null,
      startedAt: processEntry.startedAt,
      recentOutput: processEntry.getRecentOutput(5),
      recentErrors: processEntry.getRecentErrors(5)
    };
  }

  /**
   * Start all preload models
   * @returns {Promise<Array>} Array of started model IDs
   */
  async startPreloadModels() {
    logger.info('Starting preload models...');

    const preloadModels = this.getAllModels().filter(
      model => model.mode === LoadMode.PRELOAD
    );

    const started = [];

    for (const model of preloadModels) {
      try {
        await this.startModel(model.id);
        started.push(model.id);
      } catch (error) {
        logger.error({ error, modelId: model.id }, 'Failed to start preload model');
      }
    }

    logger.info({ started: started.length, total: preloadModels.length }, 'Started preload models');
    return started;
  }

  /**
   * Stop all running models
   * @returns {Promise<number>} Number of models stopped
   */
  async stopAllModels() {
    logger.info('Stopping all models...');
    this.isShuttingDown = true;

    const running = Array.from(this.processes.keys());
    let stopped = 0;

    for (const modelId of running) {
      if (await this.stopModel(modelId, { timeout: 5000 })) {
        stopped++;
      }
    }

    this.isShuttingDown = false;
    logger.info({ stopped, total: running.length }, 'Stopped models');
    return stopped;
  }

  /**
   * Get an available port
   * @returns {number} Available port number
   * @private
   */
  _getAvailablePort() {
    while (this.usedPorts.has(this.nextAvailablePort)) {
      this.nextAvailablePort++;
    }

    const port = this.nextAvailablePort;
    this.nextAvailablePort++;
    return port;
  }

  /**
   * Auto-discover all YAML config files in the config directory
   * @returns {Array<string>} Array of config file paths in load order
   * @private
   */
  _discoverConfigFiles() {
    // Fall back to single config if directory doesn't exist
    if (!fs.existsSync(CONFIG_DIR)) {
      logger.warn({ configDir: CONFIG_DIR }, 'Config directory not found, using fallback');
      return [DEFAULT_CONFIG_PATH];
    }

    const files = fs.readdirSync(CONFIG_DIR).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));

    // Separate into special configs and model configs
    const specialConfigs = [];
    const modelConfigs = [];

    for (const file of files) {
      if (NON_MODEL_CONFIGS.includes(file)) {
        specialConfigs.push(file);
      } else {
        modelConfigs.push(file);
      }
    }

    // Sort: settings.yml first, upscalers.yml second, then model configs alphabetically
    specialConfigs.sort((a, b) => {
      if (a === 'settings.yml') return -1;
      if (b === 'settings.yml') return 1;
      if (a === 'upscalers.yml') return -1;
      if (b === 'upscalers.yml') return 1;
      return a.localeCompare(b);
    });

    modelConfigs.sort();

    const allConfigs = [...specialConfigs, ...modelConfigs];
    return allConfigs.map(f => path.join(CONFIG_DIR, f));
  }

  /**
   * Process arguments, replacing placeholders
   * @param {Array} args - Arguments array
   * @param {Object} context - Context for replacements
   * @returns {Array} Processed arguments
   * @private
   */
  _processArgs(args, context) {
    return args.map(arg => {
      // Replace port placeholder
      arg = arg.replace(/\{port\}/g, context.port);
      arg = arg.replace(/\$\{port\}/g, context.port);

      // Replace model-specific placeholders
      if (context.model) {
        arg = arg.replace(/\{model\.id\}/g, context.model.id);
        arg = arg.replace(/\$\{model\.id\}/g, context.model.id);
      }

      return arg;
    });
  }

  /**
   * Check if server output indicates it's ready
   * @param {string} output - Process output
   * @returns {boolean} True if server appears ready
   * @private
   */
  _isServerReady(output) {
    const readyPatterns = [
      /listening/i,
      /server.*ready/i,
      /started.*on.*port/i,
      /serving.*http/i,
      /accepting.*connections/i,
      /ready.*accept/i,
      /Uvicorn running/i,
      /Application startup complete/i
    ];

    return readyPatterns.some(pattern => pattern.test(output));
  }

  /**
   * Wait for server to be ready
   * @param {ProcessEntry} processEntry - Process entry
   * @param {number} timeout - Timeout in ms
   * @returns {Promise<void>}
   * @private
   */
  async _waitForServerReady(processEntry, timeout) {
    const startTime = Date.now();
    const checkInterval = 500;

    return new Promise((resolve, reject) => {
      const checkReady = () => {
        const elapsed = Date.now() - startTime;

        if (processEntry.status === ModelStatus.RUNNING) {
          resolve();
          return;
        }

        if (processEntry.process.killed || processEntry.process.exitCode !== null) {
          reject(new Error('Process exited before becoming ready'));
          return;
        }

        if (elapsed >= timeout) {
          reject(new Error(`Timeout waiting for server to be ready (${timeout}ms)`));
          return;
        }

        setTimeout(checkReady, checkInterval);
      };

      checkReady();
    });
  }

  /**
   * Handle process exit event
   * @param {string} modelId - Model ID
   * @param {number} code - Exit code
   * @param {string} signal - Exit signal
   * @private
   */
  _handleProcessExit(modelId, code, signal) {
    const processEntry = this.processes.get(modelId);

    if (!processEntry) {
      return;
    }

    logger.info({ modelId, code, signal }, 'Model process exited');

    processEntry.exitCode = code;
    processEntry.signal = signal;
    const newStatus = code === 0 ? ModelStatus.STOPPED : ModelStatus.ERROR;
    processEntry.status = newStatus;

    // Broadcast model status change
    broadcastModelStatus(modelId, newStatus, {
      exitCode: code,
      signal,
    });

    // Free the port
    if (processEntry.port) {
      this.usedPorts.delete(processEntry.port);
    }

    // Don't delete from processes immediately - keep for status info
    // Will be cleaned up on next startModel call

    // Call callback if provided
    if (this.onProcessExit) {
      this.onProcessExit(modelId, code, signal);
    }
  }

  /**
   * Handle process error event
   * @param {string} modelId - Model ID
   * @param {Error} error - Error object
   * @private
   */
  _handleProcessError(modelId, error) {
    logger.error({ error, modelId }, 'Model process error');

    const processEntry = this.processes.get(modelId);
    if (processEntry) {
      processEntry.status = ModelStatus.ERROR;
      processEntry.appendError(error.message);
    }

    // Broadcast model status change
    broadcastModelStatus(modelId, ModelStatus.ERROR, { error: error.message });

    // Call callback if provided
    if (this.onProcessError) {
      this.onProcessError(modelId, error);
    }
  }

  /**
   * Cleanup zombie/terminated processes
   * @returns {number} Number of processes cleaned up
   */
  cleanupZombies() {
    let cleaned = 0;

    for (const [modelId, processEntry] of this.processes.entries()) {
      const process = processEntry.process;

      if (!process || process.killed || process.exitCode !== null) {
        if (processEntry.status !== ModelStatus.STOPPING) {
          logger.debug({ modelId }, 'Cleaning up zombie process');
          this.processes.delete(modelId);
          if (processEntry.port) {
            this.usedPorts.delete(processEntry.port);
          }
          cleaned++;
        }
      }
    }

    return cleaned;
  }

  /**
   * Get process entry for a model
   * @param {string} modelId - Model ID
   * @returns {ProcessEntry|null} Process entry or null
   */
  getProcess(modelId) {
    return this.processes.get(modelId) || null;
  }

  /**
   * Get all process entries
   * @returns {Array} Array of process entries
   */
  getAllProcesses() {
    return Array.from(this.processes.values());
  }

  /**
   * Get model-specific generation parameters
   * Returns default generation parameters for a model if defined in models.yml
   * @param {string} modelId - Model identifier
   * @returns {Object|null} Model-specific generation parameters or null
   */
  getModelGenerationParams(modelId) {
    if (!this.configLoaded) {
      this.loadConfig();
    }

    const model = this.getModel(modelId);
    if (!model || !model.generation_params) {
      return null;
    }

    return model.generation_params;
  }
}

/**
 * Singleton instance for application-wide use
 */
let singletonInstance = null;

/**
 * Get or create singleton ModelManager instance
 * @param {Object} options - Options for ModelManager
 * @returns {ModelManager} Singleton instance
 */
export function getModelManager(options = {}) {
  if (!singletonInstance) {
    singletonInstance = new ModelManager(options);
  }
  return singletonInstance;
}

/**
 * Export a default function to create a new ModelManager
 */
export default function createModelManager(options = {}) {
  return new ModelManager(options);
}

/**
 * Singleton instance - automatically initialized on import
 */
export const modelManager = getModelManager();