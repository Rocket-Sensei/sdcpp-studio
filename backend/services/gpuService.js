import { execFile } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);

const logger = createLogger('gpuService');

let cachedGpuInfo = null;

function parseCsvLine(line) {
  return line.split(',').map(part => part.trim());
}

function parseInteger(value) {
  const parsed = parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloatValue(value) {
  const parsed = parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : null;
}

async function getGpuInfoNvidiaSmi() {
  try {
    const { stdout } = await execFileAsync('nvidia-smi', [
      '--query-gpu=name,memory.total,driver_version',
      '--format=csv,noheader,nounits'
    ]);

    const parts = parseCsvLine(stdout.trim());
    if (parts.length < 3) {
      throw new Error('Unexpected nvidia-smi output format');
    }

    const name = parts[0];
    const vramTotalMB = parseInteger(parts[1]);
    const driver = parts[2];

    let cudaVersion = null;
    try {
      const { stdout: cudaStdout } = await execFileAsync('nvidia-smi', [
        '--query-gpu=compute_cap',
        '--format=csv,noheader,nounits'
      ]);
      const computeCap = parseFloatValue(cudaStdout.trim());
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
    const memory = gpu.memory || {};
    const vramTotalMB = parseInteger(gpu.memory?.total ?? gpu['memory.total'] ?? memory.total);
    return {
      available: true,
      name: gpu.name,
      vramTotalMB,
      driver: gpustatData.driver_version || null,
      cudaVersion: null,
      method: 'gpustat'
    };
  } catch (error) {
    logger.debug({ error }, 'gpustat not available or failed');
    throw error;
  }
}

async function getGpuUsageNvidiaSmi() {
  const { stdout } = await execFileAsync('nvidia-smi', [
    '--query-gpu=memory.total,memory.used,memory.free',
    '--format=csv,noheader,nounits'
  ]);

  const gpuLine = stdout
    .split('\n')
    .map(line => line.trim())
    .find(Boolean);

  if (!gpuLine) {
    throw new Error('No GPU memory data returned from nvidia-smi');
  }

  const [totalRaw, usedRaw, freeRaw] = parseCsvLine(gpuLine);
  const vramTotalMB = parseInteger(totalRaw);
  const vramUsedMB = parseInteger(usedRaw);
  const vramFreeMB = parseInteger(freeRaw);

  let processes = [];
  try {
    const { stdout: processStdout } = await execFileAsync('nvidia-smi', [
      '--query-compute-apps=pid,used_memory,process_name',
      '--format=csv,noheader,nounits'
    ]);

    const lines = processStdout
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .filter(line => !line.toLowerCase().includes('no running processes found'));

    processes = lines
      .map(line => {
        const parts = parseCsvLine(line);
        if (parts.length < 2) {
          return null;
        }

        const pid = parseInteger(parts[0]);
        const usedMB = parseInteger(parts[1]);
        const processName = parts.slice(2).join(', ') || null;

        if (!pid || usedMB === null) {
          return null;
        }

        return {
          pid,
          usedMB,
          processName
        };
      })
      .filter(Boolean);
  } catch (error) {
    logger.debug({ error }, 'Failed to query per-process GPU memory usage');
  }

  return {
    vramTotalMB,
    vramUsedMB,
    vramFreeMB,
    processes,
    usageMethod: 'nvidia-smi',
    usageTimestamp: Date.now()
  };
}

async function getGpuUsageGpustat() {
  const { stdout } = await execFileAsync('gpustat', ['--json']);
  const gpustatData = JSON.parse(stdout);
  const gpu = gpustatData?.gpus?.[0];

  if (!gpu) {
    throw new Error('No GPUs found in gpustat output');
  }

  const memory = gpu.memory || {};
  const vramTotalMB = parseInteger(gpu.memory?.total ?? gpu['memory.total'] ?? memory.total);
  const vramUsedMB = parseInteger(gpu.memory?.used ?? gpu['memory.used'] ?? memory.used);
  const vramFreeMB = vramTotalMB !== null && vramUsedMB !== null
    ? Math.max(0, vramTotalMB - vramUsedMB)
    : null;

  const rawProcesses = Array.isArray(gpu.processes) ? gpu.processes : [];
  const processes = rawProcesses
    .map(proc => {
      const pid = parseInteger(proc.pid);
      const usedMB = parseInteger(proc.gpu_memory_usage ?? proc.memory_used ?? proc.used_memory);

      if (!pid || usedMB === null) {
        return null;
      }

      return {
        pid,
        usedMB,
        processName: proc.command || proc.full_command || null
      };
    })
    .filter(Boolean);

  return {
    vramTotalMB,
    vramUsedMB,
    vramFreeMB,
    processes,
    usageMethod: 'gpustat',
    usageTimestamp: Date.now()
  };
}

async function getStaticGpuInfo() {
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

async function getDynamicGpuUsage() {
  try {
    return await getGpuUsageNvidiaSmi();
  } catch {
    try {
      return await getGpuUsageGpustat();
    } catch {
      return {
        vramTotalMB: null,
        vramUsedMB: null,
        vramFreeMB: null,
        processes: [],
        usageMethod: 'none',
        usageTimestamp: Date.now()
      };
    }
  }
}

export async function getGpuInfo(options = {}) {
  const { includeUsage = false } = options;
  const staticInfo = await getStaticGpuInfo();

  if (!includeUsage) {
    return staticInfo;
  }

  const usage = await getDynamicGpuUsage();
  return {
    ...staticInfo,
    vramTotalMB: staticInfo.vramTotalMB ?? usage.vramTotalMB,
    vramUsedMB: usage.vramUsedMB,
    vramFreeMB: usage.vramFreeMB,
    processes: usage.processes,
    usageMethod: usage.usageMethod,
    usageTimestamp: usage.usageTimestamp
  };
}
