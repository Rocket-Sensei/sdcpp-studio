/**
 * Model Downloader Service
 *
 * Downloads models from HuggingFace using Python huggingface_hub first,
 * with easydl (Node.js) as fallback.
 *
 * Features:
 * - Python-first approach using hf_hub_download via wrapper script
 * - Automatic fallback to Node.js easydl if Python unavailable
 * - Progress tracking for both methods
 * - Resume support (built into both hf_hub_download and easydl)
 * - Token authentication support
 * - Custom cache directories
 */

import { randomUUID } from 'crypto';
import { mkdirSync, existsSync, statSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { promisify } from 'util';

// Lazy import easydl to avoid issues if not installed
let EasyDl = null;
try {
  const easydlModule = await import('easy-dl');
  EasyDl = easydlModule.default || easydlModule;
} catch (e) {
  // easydl not installed, will use Python only
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Default directories
const DEFAULT_MODELS_DIR = process.env.MODELS_DIR || join(__dirname, '../../models');
const HF_HUB_CACHE = process.env.HF_HUB_CACHE || process.env.HUGGINGFACE_HUB_CACHE || join(__dirname, '../../models/hf_cache/hub');
const NODE_HF_CACHE = process.env.NODE_HF_CACHE || join(__dirname, '../../models/hf_cache/node');

// Python wrapper script path
const PYTHON_SCRIPT = join(__dirname, '../scripts/hf_download.py');

// Ensure cache directories exist
if (!existsSync(HF_HUB_CACHE)) {
  mkdirSync(HF_HUB_CACHE, { recursive: true });
}
if (!existsSync(NODE_HF_CACHE)) {
  mkdirSync(NODE_HF_CACHE, { recursive: true });
}

// HuggingFace authentication token
const HF_TOKEN = process.env.HF_TOKEN || '';

// Python executable (auto-detected)
const PYTHON = process.env.PYTHON || 'python3';

// Use Python downloader first
const USE_PYTHON_DOWNLOADER = process.env.USE_PYTHON_DOWNLOADER !== 'false';

// Download status constants
const DOWNLOAD_STATUS = {
  PENDING: 'pending',
  DOWNLOADING: 'downloading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

// Download method constants
const DOWNLOAD_METHOD = {
  PYTHON: 'python',
  NODE: 'node',
  UNKNOWN: 'unknown'
};

/**
 * In-memory download job tracker
 */
const downloadJobs = new Map();

/**
 * Check if Python is available
 */
async function checkPythonAvailable() {
  return new Promise((resolve) => {
    const python = spawn(PYTHON, ['--version'], { stdio: 'pipe' });
    python.on('error', () => resolve(false));
    python.on('close', (code) => resolve(code === 0));
    setTimeout(() => resolve(false), 5000); // Timeout after 5 seconds
  });
}

/**
 * Check if huggingface_hub is available in Python
 */
async function checkHuggingFaceHubAvailable() {
  return new Promise((resolve) => {
    const python = spawn(PYTHON, ['-c', 'from huggingface_hub import hf_hub_download; print("OK")'], {
      stdio: 'pipe',
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    let output = '';
    python.stdout.on('data', (data) => { output += data.toString(); });
    python.on('error', () => resolve(false));
    python.on('close', (code) => resolve(code === 0 && output.includes('OK')));
    setTimeout(() => resolve(false), 10000); // Timeout after 10 seconds
  });
}

// Cache Python availability checks
let pythonAvailable = null;
let hfHubAvailable = null;

/**
 * Get available download method
 */
async function getDownloadMethod() {
  if (!USE_PYTHON_DOWNLOADER) {
    return EasyDl ? DOWNLOAD_METHOD.NODE : DOWNLOAD_METHOD.UNKNOWN;
  }

  if (pythonAvailable === null) {
    pythonAvailable = await checkPythonAvailable();
  }
  if (hfHubAvailable === null) {
    hfHubAvailable = await checkHuggingFaceHubAvailable();
  }

  if (pythonAvailable && hfHubAvailable) {
    return DOWNLOAD_METHOD.PYTHON;
  }

  if (EasyDl) {
    return DOWNLOAD_METHOD.NODE;
  }

  return DOWNLOAD_METHOD.UNKNOWN;
}

/**
 * Format bytes to human readable
 */
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Format seconds to human readable
 */
function formatTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get HuggingFace file URL
 */
function getHuggingFaceFileUrl(repo, filename, revision = 'main') {
  return `https://huggingface.co/${encodeURIComponent(repo)}/resolve/${encodeURIComponent(revision)}/${encodeURIComponent(filename)}`;
}

/**
 * Download using Python huggingface_hub
 */
async function downloadWithPython(repo, files, destDir, onProgress, jobId) {
  const job = downloadJobs.get(jobId);
  if (!job) {
    throw new Error('Download job not found');
  }

  const results = [];
  const cacheDir = process.env.HF_HUB_CACHE || process.env.HUGGINGFACE_HUB_CACHE || HF_HUB_CACHE;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = basename(file.path);

    // Check for cancellation
    if (job.abortController && job.abortController.signal.aborted) {
      throw new Error('Download cancelled');
    }

    // Update job state
    job.currentFile = fileName;
    job.currentFileIndex = i;

    // Build Python command args
    const args = [
      PYTHON_SCRIPT,
      '--repo-id', repo,
      '--filename', file.path,
      '--revision', 'main'
    ];

    if (HF_TOKEN) {
      args.push('--token', HF_TOKEN);
    }

    if (cacheDir) {
      args.push('--cache-dir', cacheDir);
    }

    if (destDir) {
      args.push('--dest', destDir);
    }

    await new Promise((resolve, reject) => {
      const python = spawn(PYTHON, args, {
        env: { ...process.env, PYTHONIOENCODING: 'utf-8', HF_TOKEN: HF_TOKEN || '' }
      });

      let outputPath = null;
      let fileSize = 0;
      let lastProgress = { current: 0, total: 0 };

      // Parse JSON output from Python script
      python.stdout.on('data', (data) => {
        const lines = data.toString().split('\n').filter(l => l.trim());
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);

            switch (msg.type) {
              case 'start':
                onProgress({
                  jobId,
                  fileIndex: i,
                  totalFiles: files.length,
                  fileName,
                  fileProgress: 0,
                  overallProgress: (i / files.length) * 100,
                  status: 'starting'
                });
                break;

              case 'progress':
                lastProgress = {
                  current: msg.data.current || lastProgress.current,
                  total: msg.data.total || lastProgress.total
                };

                // Calculate overall progress
                const fileProgress = lastProgress.total > 0
                  ? (lastProgress.current / lastProgress.total) * 100
                  : 0;
                const overallProgress = ((i + fileProgress / 100) / files.length) * 100;

                job.files.set(fileName, {
                  size: lastProgress.total,
                  downloaded: lastProgress.current,
                  progress: fileProgress
                });

                job.progress = overallProgress;
                job.bytesDownloaded = calculateTotalDownloaded(job);
                job.totalBytes = calculateTotalSize(job);

                onProgress({
                  jobId,
                  fileIndex: i,
                  totalFiles: files.length,
                  fileName,
                  fileProgress,
                  overallProgress,
                  bytesDownloaded: job.bytesDownloaded,
                  totalBytes: job.totalBytes
                });
                break;

              case 'complete':
                outputPath = msg.data.file_path;
                fileSize = msg.data.file_size || 0;

                job.files.set(fileName, {
                  size: fileSize,
                  downloaded: fileSize,
                  progress: 100,
                  complete: true
                });

                results.push({
                  path: outputPath,
                  size: fileSize,
                  method: DOWNLOAD_METHOD.PYTHON
                });
                break;

              case 'error':
                reject(new Error(msg.data.message || 'Python download failed'));
                break;
            }
          } catch (e) {
            // Not a JSON line, ignore
          }
        }
      });

      python.stderr.on('data', (data) => {
        const msg = data.toString().trim();
        if (msg) {
          console.error(`[Python stderr] ${msg}`);
        }
      });

      python.on('error', (error) => {
        reject(new Error(`Python spawn error: ${error.message}`));
      });

      python.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Python process exited with code ${code}`));
        } else {
          resolve();
        }
      });
    }).then(() => {
      onProgress({
        jobId,
        fileIndex: i,
        totalFiles: files.length,
        fileName,
        fileComplete: true,
        message: `Completed ${fileName}`
      });
    }).catch((error) => {
      job.files.set(fileName, {
        error: error.message
      });
      throw error;
    });
  }

  return results;
}

/**
 * Download using Node.js easydl
 */
async function downloadWithNode(repo, files, destDir, onProgress, jobId) {
  if (!EasyDl) {
    throw new Error('easydl is not installed. Run: npm install easy-dl');
  }

  const job = downloadJobs.get(jobId);
  if (!job) {
    throw new Error('Download job not found');
  }

  const results = [];
  const cacheDir = NODE_HF_CACHE;

  // Ensure cache directory exists
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = basename(file.path);
    const destPath = join(destDir || DEFAULT_MODELS_DIR, fileName);

    // Update job state
    job.currentFile = fileName;
    job.currentFileIndex = i;

    // Build download URL
    const url = getHuggingFaceFileUrl(repo, file.path);

    onProgress({
      jobId,
      fileIndex: i,
      totalFiles: files.length,
      fileName,
      fileProgress: 0,
      overallProgress: (i / files.length) * 100,
      status: 'starting'
    });

    try {
      const dl = new EasyDl(url, destPath, {
        chunkSize: parseInt(process.env.DOWNLOAD_CHUNK_SIZE) || 10485760, // 10MB default
        maxRetry: parseInt(process.env.DOWNLOAD_MAX_RETRIES) || 3,
        connections: 1, // Single connection for HuggingFace
        headers: HF_TOKEN ? { 'Authorization': `Bearer ${HF_TOKEN}` } : {}
      });

      // Track progress
      dl.on('progress', (stats) => {
        const fileProgress = stats.percent || 0;
        const overallProgress = ((i + fileProgress / 100) / files.length) * 100;

        job.files.set(destPath, {
          size: stats.total,
          downloaded: stats.downloaded,
          progress: fileProgress
        });

        job.progress = overallProgress;
        job.bytesDownloaded = calculateTotalDownloaded(job);
        job.totalBytes = calculateTotalSize(job);

        onProgress({
          jobId,
          fileIndex: i,
          totalFiles: files.length,
          fileName,
          fileProgress,
          overallProgress,
          bytesDownloaded: job.bytesDownloaded,
          totalBytes: job.totalBytes,
          speed: formatBytes(stats.speed || 0) + '/s',
          eta: formatTime(stats.remaining || 0)
        });
      });

      // Wait for download
      const downloaded = await dl.wait();

      if (downloaded) {
        const fileSize = statSync(destPath).size;

        job.files.set(destPath, {
          size: fileSize,
          downloaded: fileSize,
          progress: 100,
          complete: true
        });

        results.push({
          path: destPath,
          size: fileSize,
          method: DOWNLOAD_METHOD.NODE
        });
      } else {
        throw new Error('Download incomplete');
      }

      onProgress({
        jobId,
        fileIndex: i,
        totalFiles: files.length,
        fileName,
        fileComplete: true,
        message: `Completed ${fileName}`
      });

    } catch (error) {
      job.files.set(destPath, {
        error: error.message
      });
      throw error;
    }
  }

  return results;
}

/**
 * Calculate total downloaded bytes across all files
 */
function calculateTotalDownloaded(job) {
  let total = 0;
  for (const file of job.files.values()) {
    total += file.downloaded || 0;
  }
  return total;
}

/**
 * Calculate total size across all files
 */
function calculateTotalSize(job) {
  let total = 0;
  for (const file of job.files.values()) {
    total += file.size || 0;
  }
  return total;
}

/**
 * Model Downloader Class
 */
class ModelDownloader {
  constructor(options = {}) {
    this.modelsDir = options.modelsDir || DEFAULT_MODELS_DIR;

    // Ensure models directory exists
    if (!existsSync(this.modelsDir)) {
      mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  /**
   * Download a model from HuggingFace
   */
  async downloadModel(repo, files, onProgress) {
    const jobId = randomUUID();

    // Initialize download job
    downloadJobs.set(jobId, {
      id: jobId,
      repo,
      status: DOWNLOAD_STATUS.PENDING,
      files: new Map(),
      progress: 0,
      bytesDownloaded: 0,
      totalBytes: 0,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
      error: null,
      method: DOWNLOAD_METHOD.UNKNOWN,
      abortController: new AbortController()
    });

    try {
      const job = downloadJobs.get(jobId);
      job.status = DOWNLOAD_STATUS.DOWNLOADING;

      // Determine download method
      const method = await getDownloadMethod();
      job.method = method;

      if (method === DOWNLOAD_METHOD.UNKNOWN) {
        throw new Error('No download method available. Please install Python with huggingface_hub ("pip install huggingface_hub") or install easydl ("npm install easy-dl").');
      }

      console.log(`Downloading ${repo} using method: ${method}`);

      // Prepare destination directory
      const destDir = files[0]?.dest || this.modelsDir;

      // Download files
      let results;
      if (method === DOWNLOAD_METHOD.PYTHON) {
        results = await downloadWithPython(repo, files, destDir, onProgress, jobId);
      } else {
        results = await downloadWithNode(repo, files, destDir, onProgress, jobId);
      }

      // Update job status to completed
      job.status = DOWNLOAD_STATUS.COMPLETED;
      job.progress = 100;
      job.completedAt = Date.now();

      return {
        jobId,
        repo,
        status: DOWNLOAD_STATUS.COMPLETED,
        method,
        files: results,
        totalSize: job.bytesDownloaded,
        duration: job.completedAt - job.startTime
      };

    } catch (error) {
      const job = downloadJobs.get(jobId);

      if (error.message === 'Download cancelled' || error.name === 'AbortError') {
        job.status = DOWNLOAD_STATUS.CANCELLED;
        job.error = 'Download was cancelled';
      } else {
        job.status = DOWNLOAD_STATUS.FAILED;
        job.error = error.message;
      }

      throw error;
    }
  }

  /**
   * Get download status
   */
  getDownloadStatus(jobId) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      return null;
    }

    // Calculate current progress
    let totalDownloaded = 0;
    let totalSize = 0;

    for (const [path, file] of job.files) {
      totalDownloaded += file.downloaded || 0;
      totalSize += file.size || 0;
    }

    return {
      id: job.id,
      repo: job.repo,
      status: job.status,
      method: job.method,
      progress: job.progress,
      bytesDownloaded: totalDownloaded,
      totalBytes: totalSize,
      speed: job.speed ? formatBytes(job.speed) + '/s' : '--',
      eta: job.eta ? formatTime(job.eta) : '--',
      files: Array.from(job.files.entries()).map(([path, file]) => ({
        path,
        size: file.size,
        downloaded: file.downloaded,
        progress: file.progress,
        complete: file.complete,
        error: file.error
      })),
      error: job.error,
      createdAt: job.startTime,
      completedAt: job.completedAt
    };
  }

  /**
   * Cancel a download
   */
  cancelDownload(jobId) {
    const job = downloadJobs.get(jobId);

    if (!job) {
      throw new Error('Download job not found');
    }

    if (job.status === DOWNLOAD_STATUS.COMPLETED) {
      throw new Error('Cannot cancel completed download');
    }

    // Abort the download
    if (job.abortController) {
      job.abortController.abort();
    }

    job.status = DOWNLOAD_STATUS.CANCELLED;
  }

  /**
   * Verify downloaded files
   */
  verifyFiles(files) {
    for (const file of files) {
      const destDir = file.dest || this.modelsDir;
      const fileName = basename(file.path);
      const filePath = join(destDir, fileName);

      if (!existsSync(filePath)) {
        return false;
      }

      const stats = statSync(filePath);
      if (stats.size === 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get list of downloaded models
   */
  getDownloadedModels() {
    const models = [];

    if (!existsSync(this.modelsDir)) {
      return models;
    }

    return models;
  }

  /**
   * Get all active download jobs
   */
  getAllJobs() {
    return Array.from(downloadJobs.values()).map(job => this.getDownloadStatus(job.id));
  }

  /**
   * Clean up completed/failed jobs
   */
  cleanupOldJobs(maxAge = 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    for (const [jobId, job] of downloadJobs) {
      const age = now - (job.completedAt || job.startTime);
      if (age > maxAge &&
          (job.status === DOWNLOAD_STATUS.COMPLETED ||
           job.status === DOWNLOAD_STATUS.FAILED ||
           job.status === DOWNLOAD_STATUS.CANCELLED)) {
        toDelete.push(jobId);
      }
    }

    for (const jobId of toDelete) {
      downloadJobs.delete(jobId);
    }

    return toDelete.length;
  }

  /**
   * Get download method info
   */
  async getMethodInfo() {
    const method = await getDownloadMethod();
    return {
      method,
      pythonAvailable: pythonAvailable,
      hfHubAvailable: hfHubAvailable,
      nodeAvailable: !!EasyDl
    };
  }
}

// Export singleton instance
const modelDownloader = new ModelDownloader();

// Export class and constants
export {
  ModelDownloader,
  modelDownloader,
  DOWNLOAD_STATUS,
  DOWNLOAD_METHOD
};

// Also export utility functions
export {
  formatBytes,
  formatTime,
  getHuggingFaceFileUrl,
  checkPythonAvailable,
  checkHuggingFaceHubAvailable,
  getDownloadMethod
};
