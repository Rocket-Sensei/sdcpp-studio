import { createLogger } from '../utils/logger.js';
import { modelManager } from './modelManager.js';
import { processTracker } from './processTracker.js';
import { getGpuInfo } from './gpuService.js';
import { broadcastGpuInfo, CHANNELS } from './websocket.js';
import os from 'os';

const logger = createLogger('gpuBroadcaster');

let broadcasterInterval = null;

function roundTo1(value) {
  return Math.round(value * 10) / 10;
}

function mbToGb(valueMB) {
  if (!Number.isFinite(valueMB) || valueMB < 0) {
    return 0;
  }
  return roundTo1(valueMB / 1024);
}

function bytesToMb(valueBytes) {
  if (!Number.isFinite(valueBytes) || valueBytes < 0) {
    return 0;
  }
  return Math.round(valueBytes / (1024 * 1024));
}

function isVideoModel(model) {
  const modelType = String(model?.model_type || '').toLowerCase();
  const capabilities = Array.isArray(model?.capabilities)
    ? model.capabilities.map(cap => String(cap).toLowerCase())
    : [];

  return modelType.includes('video') || capabilities.some(cap => cap.includes('video'));
}

function isLlmModel(model) {
  const modelType = String(model?.model_type || '').toLowerCase();
  const capabilities = Array.isArray(model?.capabilities)
    ? model.capabilities.map(cap => String(cap).toLowerCase())
    : [];

  return modelType.includes('llm') || capabilities.some(cap => cap.includes('llm') || cap.includes('chat') || cap.includes('text-generation'));
}

function classifySystemProcess(name) {
  const value = String(name || '').toLowerCase();
  if (value.includes('llama') || value.includes('llm') || value.includes('ollama')) {
    return 'llm';
  }
  return 'system';
}

async function getGpuInfoForBroadcast() {
  const gpuInfo = await getGpuInfo({ includeUsage: true });

  const breakdownMB = {
    image: 0,
    video: 0,
    llm: 0,
    system: 0,
  };

  const trackedByPid = new Map();
  for (const processInfo of processTracker.getAllProcesses()) {
    if (processInfo?.pid) {
      trackedByPid.set(processInfo.pid, processInfo);
    }
  }

  const processBreakdown = Array.isArray(gpuInfo.processes)
    ? gpuInfo.processes.map(proc => {
        const usedMB = Math.max(0, Number(proc?.usedMB) || 0);
        const tracked = trackedByPid.get(proc.pid);

        let category = 'system';
        if (tracked?.modelId) {
          const model = modelManager.getModel(tracked.modelId);
          if (isVideoModel(model)) {
            category = 'video';
          } else if (isLlmModel(model)) {
            category = 'llm';
          } else {
            category = 'image';
          }
        } else {
          category = classifySystemProcess(proc.processName);
        }

        breakdownMB[category] += usedMB;

        return {
          pid: proc.pid,
          name: proc.processName,
          category,
          usedMB,
          usedGB: mbToGb(usedMB),
        };
      })
    : [];

  const vramUsedMB = Number.isFinite(gpuInfo.vramUsedMB) ? gpuInfo.vramUsedMB : null;
  if (vramUsedMB !== null) {
    const categorizedMB = breakdownMB.image + breakdownMB.video + breakdownMB.llm + breakdownMB.system;
    if (categorizedMB < vramUsedMB) {
      breakdownMB.system += (vramUsedMB - categorizedMB);
    }
  }

  const totalRamBytes = os.totalmem();
  const freeRamBytes = os.freemem();
  const usedRamBytes = Math.max(0, totalRamBytes - freeRamBytes);
  const totalRamMB = bytesToMb(totalRamBytes);
  const freeRamMB = bytesToMb(freeRamBytes);
  const usedRamMB = bytesToMb(usedRamBytes);

  return {
    ...gpuInfo,
    vram: {
      totalGB: mbToGb(gpuInfo.vramTotalMB),
      usedGB: mbToGb(gpuInfo.vramUsedMB),
      freeGB: mbToGb(gpuInfo.vramFreeMB),
    },
    ram: {
      totalMB: totalRamMB,
      freeMB: freeRamMB,
      usedMB: usedRamMB,
      totalGB: mbToGb(totalRamMB),
      freeGB: mbToGb(freeRamMB),
      usedGB: mbToGb(usedRamMB),
    },
    breakdownMB,
    breakdownGB: {
      image: mbToGb(breakdownMB.image),
      video: mbToGb(breakdownMB.video),
      llm: mbToGb(breakdownMB.llm),
      system: mbToGb(breakdownMB.system),
    },
    processBreakdown,
  };
}

async function broadcastGpuUpdate() {
  try {
    const gpuData = await getGpuInfoForBroadcast();
    broadcastGpuInfo(gpuData);
  } catch (error) {
    logger.error({ error }, 'Error broadcasting GPU info');
  }
}

export function startGpuBroadcaster(intervalMs = 2000) {
  if (broadcasterInterval) {
    logger.info('GPU broadcaster already running');
    return;
  }

  logger.info({ intervalMs }, 'Starting GPU broadcaster');

  broadcastGpuUpdate();

  broadcasterInterval = setInterval(broadcastGpuUpdate, intervalMs);
}

export function stopGpuBroadcaster() {
  if (broadcasterInterval) {
    clearInterval(broadcasterInterval);
    broadcasterInterval = null;
    logger.info('GPU broadcaster stopped');
  }
}

export function getGpuBroadcasterStatus() {
  return {
    running: broadcasterInterval !== null,
  };
}

export default {
  startGpuBroadcaster,
  stopGpuBroadcaster,
  getGpuBroadcasterStatus,
};
