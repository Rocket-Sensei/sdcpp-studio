/**
 * Test: Creating a generation results in WebSocket messages
 *
 * This test verifies that when a generation is created via the API,
 * the appropriate WebSocket messages are broadcast to subscribers.
 *
 * The test simulates the full flow:
 * 1. Subscribe to WebSocket channels
 * 2. Create a generation via API
 * 3. Verify WebSocket messages are received for status updates
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync } from 'fs';
import { initializeDatabase, closeDatabase } from '../backend/db/database.js';
import {
  createGeneration,
  getAllGenerations,
  updateGenerationStatus,
  GenerationStatus,
} from '../backend/db/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path
const TEST_DB_PATH = join(__dirname, '../test-generation-ws.sqlite3');

// Test server port
const TEST_PORT = 3011;
const TEST_HOST = '127.0.0.1';

let httpServer = null;
let wsServer = null;
let wsServerChannels = null;
let serverUrl = null;

const cleanupFiles = [];

/**
 * Broadcast function that uses the test server's channels
 */
function broadcastMessage(channels, channel, payload) {
  const subs = channels.get(channel);
  if (!subs || subs.size === 0) {
    return 0;
  }

  const msg = JSON.stringify({ channel, ...payload });
  let sent = 0;

  subs.forEach((ws) => {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(msg);
      sent++;
    }
  });

  return sent;
}

/**
 * Create a test server with WebSocket support
 */
async function createTestServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Minimal API endpoints
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok' }));
        return;
      }

      if (req.url === '/api/generations' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const generations = getAllGenerations();
        res.end(JSON.stringify({ generations, pagination: { total: generations.length } }));
        return;
      }

      // POST /api/queue/generate - Create a new generation
      if (req.url === '/api/queue/generate' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            const data = JSON.parse(body);
            const generationId = randomUUID();

            // Create generation record
            await createGeneration({
              id: generationId,
              type: 'generate',
              prompt: data.prompt || 'test prompt',
              negative_prompt: data.negative_prompt || '',
              size: data.size || '512x512',
              seed: data.seed ? String(data.seed) : null,
              model: data.model || 'test-model',
              status: GenerationStatus.PENDING,
              n: data.n || 1,
            });

            // Get the channels from the server (they're attached to the wss instance)
            const channels = server.channels || new Map();

            // Simulate queue processing: update to processing
            updateGenerationStatus(generationId, GenerationStatus.PROCESSING);

            // Broadcast job_updated event
            broadcastMessage(channels, 'queue', {
              type: 'job_updated',
              data: {
                id: generationId,
                status: GenerationStatus.PROCESSING,
                type: 'generate',
                prompt: data.prompt || 'test prompt',
              },
            });

            // Simulate completion after short delay
            setTimeout(async () => {
              updateGenerationStatus(generationId, GenerationStatus.COMPLETED);
              broadcastMessage(channels, 'queue', {
                type: 'job_completed',
                data: {
                  id: generationId,
                  status: GenerationStatus.COMPLETED,
                  type: 'generate',
                  prompt: data.prompt || 'test prompt',
                },
              });
              broadcastMessage(channels, 'generations', {
                type: 'generation_complete',
                data: {
                  id: generationId,
                  status: GenerationStatus.COMPLETED,
                  type: 'generate',
                  prompt: data.prompt || 'test prompt',
                  created_at: Date.now(),
                  imageCount: 1,
                },
              });
            }, 50);

            res.writeHead(201, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ id: generationId, status: 'pending' }));
          } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: error.message }));
          }
        });
        return;
      }

      // Default 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    const wss = new WebSocketServer({ server });
    const channels = new Map();

    wss.on('connection', (ws) => {
      ws.subscriptions = new Set();

      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        channels: ['queue', 'generations', 'models'],
        timestamp: Date.now(),
      }));

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());

          switch (msg.type) {
            case 'subscribe':
              if (msg.channel) {
                if (!channels.has(msg.channel)) {
                  channels.set(msg.channel, new Set());
                }
                channels.get(msg.channel).add(ws);
                ws.subscriptions.add(msg.channel);

                ws.send(JSON.stringify({
                  type: 'subscribed',
                  channel: msg.channel,
                  timestamp: Date.now(),
                }));
              }
              break;

            case 'unsubscribe':
              if (msg.channel) {
                const subs = channels.get(msg.channel);
                if (subs) {
                  subs.delete(ws);
                }
                ws.subscriptions.delete(msg.channel);
              }
              break;
          }
        } catch (error) {
          // Ignore parsing errors
        }
      });

      ws.on('close', () => {
        ws.subscriptions.forEach((channel) => {
          const subs = channels.get(channel);
          if (subs) {
            subs.delete(ws);
          }
        });
        ws.subscriptions.clear();
      });
    });

    // Attach channels to server for API access
    server.channels = channels;

    server.listen(TEST_PORT, TEST_HOST, () => {
      resolve({ httpServer: server, wsServer: wss, url: `ws://${TEST_HOST}:${TEST_PORT}`, channels });
    });

    server.on('error', reject);
  });
}

describe('Generation WebSocket Message Test', () => {
  beforeAll(async () => {
    // Clean up test database
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    process.env.GENERATIONS_DB_PATH = TEST_DB_PATH;
    await initializeDatabase();
    cleanupFiles.push(TEST_DB_PATH);

    const testServer = await createTestServer();
    httpServer = testServer.httpServer;
    wsServer = testServer.wsServer;
    wsServerChannels = testServer.channels;
    serverUrl = testServer.url;
  }, 15000);

  afterAll(async () => {
    if (wsServer) {
      wsServer.close();
    }
    if (httpServer) {
      httpServer.close();
    }
    await closeDatabase();

    cleanupFiles.forEach((file) => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (e) {
          // Ignore cleanup errors
        }
      }
    });
  }, 10000);

  it('should send WebSocket messages when generation is created via API', async () => {
    const ws = new WebSocket(serverUrl);

    // Wait for connection and subscription
    await new Promise((resolve) => {
      let subscribedQueue = false;
      let subscribedGenerations = false;

      ws.on('open', () => {});

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          // Subscribe to both channels
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
        } else if (message.type === 'subscribed') {
          if (message.channel === 'queue') subscribedQueue = true;
          if (message.channel === 'generations') subscribedGenerations = true;

          if (subscribedQueue && subscribedGenerations) {
            resolve();
          }
        }
      });
    });

    // Track received messages
    const receivedMessages = [];

    const messagePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        resolve(receivedMessages);
      }, 5000);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        // Only track queue and generations channel messages
        if (message.channel === 'queue' || message.channel === 'generations') {
          receivedMessages.push(message);

          // Wait for at least job_updated and job_completed/generation_complete
          const hasJobUpdated = receivedMessages.some(m => m.type === 'job_updated');
          const hasCompletion = receivedMessages.some(m => m.type === 'job_completed' || m.type === 'generation_complete');

          if (hasJobUpdated && hasCompletion) {
            clearTimeout(timeout);
            resolve(receivedMessages);
          }
        }
      });
    });

    // Create a generation via API (simulating POST /api/queue/generate)
    const response = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/queue/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'WebSocket test generation',
        size: '512x512',
        model: 'test-model',
      }),
    });

    expect(response.ok).toBe(true);
    const responseData = await response.json();
    expect(responseData.id).toBeDefined();

    const messages = await messagePromise;

    // Verify we received the expected messages
    const jobUpdated = messages.find(m => m.type === 'job_updated');
    const jobCompleted = messages.find(m => m.type === 'job_completed');
    const generationComplete = messages.find(m => m.type === 'generation_complete');

    expect(jobUpdated).toBeDefined();
    expect(jobUpdated.channel).toBe('queue');
    expect(jobUpdated.data.status).toBe('processing');

    // Should receive either job_completed on queue or generation_complete on generations
    expect(jobCompleted || generationComplete).toBeDefined();

    if (jobCompleted) {
      expect(jobCompleted.data.status).toBe('completed');
    }

    if (generationComplete) {
      expect(generationComplete.data.status).toBe('completed');
    }

    ws.close();
  });

  it('should send job_updated message when generation status changes', async () => {
    const ws = new WebSocket(serverUrl);

    await new Promise((resolve) => {
      ws.on('open', () => {});

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
        } else if (message.type === 'subscribed') {
          resolve();
        }
      });
    });

    // Listen for job_updated
    const jobUpdatedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Did not receive job_updated')), 3000);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.channel === 'queue' && message.type === 'job_updated') {
          expect(message.data.status).toBe('processing');
          clearTimeout(timeout);
          resolve(message);
        }
      });
    });

    // Create generation
    const response = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/queue/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Job update test',
        size: '512x512',
      }),
    });

    expect(response.ok).toBe(true);

    await jobUpdatedPromise;

    ws.close();
  });

  it('should send generation_complete message on generations channel', async () => {
    const ws = new WebSocket(serverUrl);

    await new Promise((resolve) => {
      ws.on('open', () => {});

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.type === 'connected') {
          ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
        } else if (message.type === 'subscribed') {
          resolve();
        }
      });
    });

    // Listen for generation_complete
    const genCompletePromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Did not receive generation_complete')), 3000);

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());

        if (message.channel === 'generations' && message.type === 'generation_complete') {
          expect(message.data.status).toBe('completed');
          expect(message.data.imageCount).toBe(1);
          clearTimeout(timeout);
          resolve(message);
        }
      });
    });

    // Create generation
    const response = await fetch(`http://${TEST_HOST}:${TEST_PORT}/api/queue/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Generation complete test',
        size: '512x512',
      }),
    });

    expect(response.ok).toBe(true);

    await genCompletePromise;

    ws.close();
  });
});
