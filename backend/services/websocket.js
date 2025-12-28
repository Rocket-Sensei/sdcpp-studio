/**
 * WebSocket Server for sd.cpp Studio
 *
 * Provides real-time pub-sub communication for:
 * - Queue updates (job status changes)
 * - Generation completions
 * - Model status changes
 *
 * Protocol:
 * - Client -> Server: { type: 'subscribe', channel: 'queue' }
 * - Client -> Server: { type: 'unsubscribe', channel: 'queue' }
 * - Server -> Client: { channel: 'queue', type: 'job_updated', data: {...} }
 */

import { WebSocketServer } from 'ws';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('websocket');

// Supported channels
export const CHANNELS = {
  QUEUE: 'queue',
  GENERATIONS: 'generations',
  MODELS: 'models',
};

// Channel subscriptions
const channels = new Map(); // channelName -> Set<ws>

let wss = null;

/**
 * Initialize the WebSocket server
 * @param {http.Server} server - HTTP server to attach to
 */
export function initializeWebSocket(server) {
  if (wss) {
    logger.info('Server already initialized');
    return wss;
  }

  wss = new WebSocketServer({ noServer: true, path: '/ws' });

  // Handle HTTP server upgrade event for WebSocket at /ws path
  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on('connection', (ws) => {
    ws.subscriptions = new Set();
    ws.isAlive = true;

    logger.info('Client connected');

    // Handle ping/pong for connection health
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(ws, msg);
      } catch (error) {
        logger.error({ error }, 'Failed to parse message');
      }
    });

    ws.on('close', () => {
      logger.info('Client disconnected');
      unsubscribeAll(ws);
    });

    ws.on('error', (error) => {
      logger.error({ error }, 'Connection error');
    });

    // Send welcome message
    sendToClient(ws, {
      type: 'connected',
      channels: Object.values(CHANNELS),
      timestamp: Date.now(),
    });
  });

  // Set up ping interval to detect dead connections
  const pingInterval = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (ws.isAlive === false) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on('close', () => {
    clearInterval(pingInterval);
  });

  logger.info('Server initialized');
  return wss;
}

/**
 * Get the WebSocket server instance
 * @returns {WebSocketServer|null}
 */
export function getWebSocketServer() {
  return wss;
}

/**
 * Handle incoming messages from clients
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} msg - Parsed message
 */
function handleMessage(ws, msg) {
  switch (msg.type) {
    case 'subscribe':
      if (msg.channel) {
        subscribe(ws, msg.channel);
      }
      break;
    case 'unsubscribe':
      if (msg.channel) {
        unsubscribe(ws, msg.channel);
      }
      break;
    case 'ping':
      sendToClient(ws, { type: 'pong', timestamp: Date.now() });
      break;
    default:
      logger.debug({ msgType: msg.type }, 'Unknown message type');
  }
}

/**
 * Subscribe a client to a channel
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} channel - Channel name
 */
function subscribe(ws, channel) {
  if (!channels.has(channel)) {
    channels.set(channel, new Set());
  }
  channels.get(channel).add(ws);
  ws.subscriptions.add(channel);
  logger.debug({ channel }, 'Client subscribed to channel');

  // Send confirmation
  sendToClient(ws, {
    type: 'subscribed',
    channel,
    timestamp: Date.now(),
  });
}

/**
 * Unsubscribe a client from a channel
 * @param {WebSocket} ws - WebSocket connection
 * @param {string} channel - Channel name
 */
function unsubscribe(ws, channel) {
  const subs = channels.get(channel);
  if (subs) {
    subs.delete(ws);
  }
  ws.subscriptions.delete(channel);
  logger.debug({ channel }, 'Client unsubscribed from channel');

  // Clean up empty channels
  if (subs && subs.size === 0) {
    channels.delete(channel);
  }
}

/**
 * Unsubscribe client from all channels
 * @param {WebSocket} ws - WebSocket connection
 */
function unsubscribeAll(ws) {
  ws.subscriptions.forEach((channel) => {
    const subs = channels.get(channel);
    if (subs) {
      subs.delete(ws);
      // Clean up empty channels
      if (subs.size === 0) {
        channels.delete(channel);
      }
    }
  });
  ws.subscriptions.clear();
}

/**
 * Send a message to a specific client
 * @param {WebSocket} ws - WebSocket connection
 * @param {Object} data - Data to send
 */
function sendToClient(ws, data) {
  if (ws.readyState === 1 /* OPEN */) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast a message to all subscribers of a channel
 * @param {string} channel - Channel name
 * @param {Object} payload - Message payload
 */
export function broadcast(channel, payload) {
  const subs = channels.get(channel);
  if (!subs || subs.size === 0) {
    return;
  }

  const msg = JSON.stringify({ channel, ...payload });
  let sent = 0;

  subs.forEach((ws) => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
      sent++;
    }
  });

  if (process.env.DEBUG === 'true' || process.env.NODE_ENV === 'development') {
    logger.debug({ sent, channel, type: payload.type }, 'Broadcast to clients');
  }
}

/**
 * Get statistics about the WebSocket server
 * @returns {Object} Statistics
 */
export function getStats() {
  const stats = {
    connectedClients: 0,
    channels: {},
  };

  if (!wss) {
    return stats;
  }

  stats.connectedClients = wss.clients.size;

  for (const [channel, subs] of channels.entries()) {
    stats.channels[channel] = subs.size;
  }

  return stats;
}

/**
 * Broadcast helper functions for specific channels
 */

/**
 * Broadcast queue job update
 * @param {Object} job - Job data
 * @param {string} eventType - Event type (e.g., 'job_created', 'job_updated', 'job_completed', 'job_failed')
 */
export function broadcastQueueEvent(job, eventType) {
  broadcast(CHANNELS.QUEUE, {
    type: eventType,
    data: {
      id: job.id,
      status: job.status,
      type: job.type,
      prompt: job.prompt,
      created_at: job.created_at,
      progress: job.progress,
      error: job.error,
    },
  });
}

/**
 * Broadcast generation completion
 * @param {Object} generation - Generation data
 */
export function broadcastGenerationComplete(generation) {
  broadcast(CHANNELS.GENERATIONS, {
    type: 'generation_complete',
    data: {
      id: generation.id,
      status: generation.status,
      type: generation.type,
      prompt: generation.prompt,
      created_at: generation.created_at,
      imageCount: generation.imageCount || 0,
    },
  });
}

/**
 * Broadcast model status change
 * @param {string} modelId - Model ID
 * @param {string} status - New status
 * @param {Object} extraData - Additional data (port, pid, etc.)
 */
export function broadcastModelStatus(modelId, status, extraData = {}) {
  broadcast(CHANNELS.MODELS, {
    type: 'model_status_changed',
    data: {
      modelId,
      status,
      ...extraData,
    },
  });
}

export default {
  initializeWebSocket,
  getWebSocketServer,
  broadcast,
  broadcastQueueEvent,
  broadcastGenerationComplete,
  broadcastModelStatus,
  getStats,
  CHANNELS,
};
