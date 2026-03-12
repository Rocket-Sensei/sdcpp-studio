import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('gpuService');

let cachedGpuInfo = null;

async function getGpuInfoNvidiaSmi() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits'
    ]);

    const parts = stdout.trim().split(',').map(s => s.trim());
    if (parts.length < 3) {
      throw new Error('Unexpected nvidia-smi output format');
    }

    const name = parts[0];
    const vramTotalMB = parseInt(parts[1], 10);
    const driver = parts[2];

    let cudaVersion = null;
    try {
      const { stdout: cudaStdout } = await execFileAsync('nvidia-smi', [
        '--query-gpu=compute_cap',
        '--format=csv,noheader,nounits'
      ]);
      const computeCap = parseFloat(cudaStdout.trim());
      if (!isNaN(computeCap)) {
        cudaVersion = `${computeCap}.0`;
      }
    } catch {
      logger.debug('Could not determine CUDA version from compute capability');
    }

    return {
      available: true,
      name,
      vramTotalMB,
      driver,
      cudaVersion,
      method: 'nvidia-smi'
    };
  } catch (error) {
    logger.debug({ error }, 'nvidia-smi not available or failed');
    throw error;
  }
}

async function getGpuInfoGpustat() {
  try {
    const { stdout } = await execFileAsync('gpustat', ['--json']);

    const gpustatData = JSON.parse(stdout);
    if (!gpustatData.gpus || gpustatData.gpus.length === 0) {
      throw new Error('No GPUs found in gpustat output');
    }

    const gpu = gpustatData.gpus[0];
    return {
      available: true,
      name: gpu.name,
      vramTotalMB: gpu.memory.total,
      driver: gpustatData.driver_version || null,
      cudaVersion: null,
      method: 'gpustat'
    };
  } catch (error) {
    logger.debug({ error }, 'gpustat not available or failed');
    throw error;
  }
}

export async function getGpuInfo() {
  if (cachedGpuInfo !== null) {
    return cachedGpuInfo;
  }

  try {
    const gpuInfo = await getGpuInfoNvidiaSmi();
    cachedGpuInfo = gpuInfo;
    return gpuInfo;
  } catch {
    try {
      const gpuInfo = await getGpuInfoGpustat();
      cachedGpuInfo = gpuInfo;
      return gpuInfo;
    } catch {
      cachedGpuInfo = {
        available: false,
        name: 'Unknown GPU',
        vramTotalMB: null,
        driver: null,
        cudaVersion: null,
        method: 'none'
      };
      return cachedGpuInfo;
    }
  }
}
