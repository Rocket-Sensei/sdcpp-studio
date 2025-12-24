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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Default paths
const PROJECT_ROOT = path.join(__dirname, '../..');  // Project root (two levels up from backend/services/)
const DEFAULT_CONFIG_PATH = path.join(__dirname, '../config/models.yml');

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
 * Logger utility for consistent logging
 */
class Logger {
  constructor(prefix = '[ModelManager]') {
    this.prefix = prefix;
  }

  info(message, ...args) {
    console.log(`${this.prefix} INFO: ${message}`, ...args);
  }

  warn(message, ...args) {
    console.warn(`${this.prefix} WARN: ${message}`, ...args);
  }

  error(message, ...args) {
    console.error(`${this.prefix} ERROR: ${message}`, ...args);
  }

  debug(message, ...args) {
    if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
      console.debug(`${this.prefix} DEBUG: ${message}`, ...args);
    }
  }
}

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
    this.configPath = options.configPath || DEFAULT_CONFIG_PATH;
    this.logger = new Logger(options.logPrefix || '[ModelManager]');

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
   * Load and parse models.yml configuration file
   * @returns {boolean} True if config loaded successfully
   */
  loadConfig() {
    try {
      this.logger.info(`Loading configuration from: ${this.configPath}`);

      // Check if file exists
      if (!fs.existsSync(this.configPath)) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }

      // Read and parse YAML
      const fileContent = fs.readFileSync(this.configPath, 'utf8');
      const config = yaml.load(fileContent);

      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration: empty or not an object');
      }

      // Parse default model configuration
      // Support both legacy 'default' and new 'default_model' and 'default_models'
      this.defaultModelId = config.default_model || config.default || null;
      this.defaultModels = config.default_models || null;

      this.logger.info(`Default model: ${this.defaultModelId || 'none'}`);
      if (this.defaultModels) {
        this.logger.info(`Type-specific defaults: ${JSON.stringify(this.defaultModels)}`);
      }

      // Parse models
      const modelsConfig = config.models || {};
      this.models.clear();

      for (const [modelId, modelConfig] of Object.entries(modelsConfig)) {
        // Validate required fields
        if (!modelConfig.name) {
          this.logger.warn(`Model "${modelId}" missing name, skipping`);
          continue;
        }
        // Determine exec_mode first
        if (!modelConfig.exec_mode || !Object.values(ExecMode).includes(modelConfig.exec_mode)) {
          this.logger.warn(`Model "${modelId}" has invalid exec_mode, defaulting to 'server'`);
          modelConfig.exec_mode = ExecMode.SERVER;
        }
        // Command is required for SERVER and CLI modes, but not for API mode
        if ((modelConfig.exec_mode === ExecMode.SERVER || modelConfig.exec_mode === ExecMode.CLI) && !modelConfig.command) {
          this.logger.warn(`Model "${modelId}" missing command (required for ${modelConfig.exec_mode} mode), skipping`);
          continue;
        }
        // API key is required for API mode
        if (modelConfig.exec_mode === ExecMode.API && !modelConfig.api_key) {
          this.logger.warn(`Model "${modelId}" missing api_key (required for API mode), skipping`);
          continue;
        }
        if (!modelConfig.mode || !Object.values(LoadMode).includes(modelConfig.mode)) {
          this.logger.warn(`Model "${modelId}" has invalid mode, defaulting to 'on_demand'`);
          modelConfig.mode = LoadMode.ON_DEMAND;
        }

        // Normalize args to array
        if (!modelConfig.args) {
          modelConfig.args = [];
        } else if (!Array.isArray(modelConfig.args)) {
          this.logger.warn(`Model "${modelId}" args is not an array, converting`);
          modelConfig.args = [modelConfig.args];
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

        this.logger.debug(`Loaded model: ${modelId} (${modelConfig.name})`);
      }

      this.configLoaded = true;
      this.logger.info(`Configuration loaded successfully. ${this.models.size} model(s) available.`);

      return true;

    } catch (error) {
      this.logger.error(`Failed to load configuration: ${error.message}`);
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
      this.logger.warn('Configuration not loaded, calling loadConfig()');
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
      this.logger.warn('Configuration not loaded, calling loadConfig()');
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
      this.logger.warn(`Model "${modelId}" is already running`);
      return this.processes.get(modelId);
    }

    this.logger.info(`Starting model: ${modelId} (${model.name})`);

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

      this.logger.debug(`Spawning: ${command} ${processedArgs.join(' ')}`);

      const childProcess = spawn(command, processedArgs, processOptions);

      // Create process entry
      const processEntry = new ProcessEntry(modelId, childProcess, port, model.exec_mode, {
        command,
        args: processedArgs,
        status: ModelStatus.STARTING
      });

      // Set up output handlers
      childProcess.stdout.on('data', (data) => {
        processEntry.appendOutput(data);
        this.logger.debug(`[${modelId}] ${data.toString().trim()}`);

        // Detect when server is ready (looks for common patterns)
        if (processEntry.status === ModelStatus.STARTING) {
          const output = data.toString();
          if (this._isServerReady(output)) {
            processEntry.status = ModelStatus.RUNNING;
            this.logger.info(`Model "${modelId}" is now running on port ${port}`);
          }
        }
      });

      childProcess.stderr.on('data', (data) => {
        processEntry.appendError(data);
        this.logger.debug(`[${modelId}] STDERR: ${data.toString().trim()}`);
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
      this.logger.error(`Failed to start model "${modelId}": ${error.message}`);
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
      this.logger.warn(`No running process for model: ${modelId}`);
      return false;
    }

    this.logger.info(`Stopping model: ${modelId} (PID: ${processEntry.pid})`);

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
              this.logger.warn(`Model "${modelId}" did not exit gracefully, forcing`);
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

      this.logger.info(`Model "${modelId}" stopped`);
      return true;

    } catch (error) {
      this.logger.error(`Error stopping model "${modelId}": ${error.message}`);
      processEntry.status = ModelStatus.ERROR;
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
    this.logger.info('Starting preload models...');

    const preloadModels = this.getAllModels().filter(
      model => model.mode === LoadMode.PRELOAD
    );

    const started = [];

    for (const model of preloadModels) {
      try {
        await this.startModel(model.id);
        started.push(model.id);
      } catch (error) {
        this.logger.error(`Failed to start preload model "${model.id}": ${error.message}`);
      }
    }

    this.logger.info(`Started ${started.length}/${preloadModels.length} preload models`);
    return started;
  }

  /**
   * Stop all running models
   * @returns {Promise<number>} Number of models stopped
   */
  async stopAllModels() {
    this.logger.info('Stopping all models...');
    this.isShuttingDown = true;

    const running = Array.from(this.processes.keys());
    let stopped = 0;

    for (const modelId of running) {
      if (await this.stopModel(modelId, { timeout: 5000 })) {
        stopped++;
      }
    }

    this.isShuttingDown = false;
    this.logger.info(`Stopped ${stopped}/${running.length} models`);
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

    this.logger.info(`Model "${modelId}" process exited (code: ${code}, signal: ${signal})`);

    processEntry.exitCode = code;
    processEntry.signal = signal;
    processEntry.status = code === 0 ? ModelStatus.STOPPED : ModelStatus.ERROR;

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
    this.logger.error(`Model "${modelId}" process error: ${error.message}`);

    const processEntry = this.processes.get(modelId);
    if (processEntry) {
      processEntry.status = ModelStatus.ERROR;
      processEntry.appendError(error.message);
    }

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
          this.logger.debug(`Cleaning up zombie process for model: ${modelId}`);
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