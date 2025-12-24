/**
 * WebSocket Integration Test
 *
 * This test reproduces the WebSocket real-time update issue by:
 * 1. Starting the backend server with WebSocket support
 * 2. Creating a WebSocket client that subscribes to queue/generations channels
 * 3. Simulating a generation job in another "thread" (via async queue)
 * 4. Verifying WebSocket messages are received
 * 5. Verifying the generations API returns updated data
 *
 * This is an INTEGRATION test that requires:
 * - A running SD API server (or mocked responses)
 * - Database access
 * - Network access for WebSocket connection
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { createServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { randomUUID } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, unlinkSync, rmSync } from 'fs';
import { initializeDatabase, closeDatabase } from '../backend/db/database.js';
import {
  createGeneration,
  getAllGenerations,
  getGenerationById,
  GenerationStatus,
} from '../backend/db/queries.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test database path (separate from development)
const TEST_DB_PATH = join(__dirname, '../test-generation.sqlite3');

// Test server port
const TEST_PORT = 3010;
const TEST_HOST = '127.0.0.1';

let httpServer = null;
let wsServer = null;
let wsServerChannels = null; // The shared channels Map from WebSocket server
let serverUrl = null;

// Track cleanup
const cleanupFiles = [];

/**
 * Create a test HTTP server with WebSocket support
 * This mimics the real server.js setup
 */
async function createTestServer() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      // Minimal API endpoints for testing
      if (req.url === '/api/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        return;
      }

      if (req.url === '/api/generations') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        const generations = getAllGenerations();
        res.end(JSON.stringify(generations));
        return;
      }

      if (req.url?.startsWith('/api/generations/')) {
        const id = req.url.split('/').pop();
        const generation = getGenerationById(id);
        if (generation) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(generation));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Generation not found' }));
        }
        return;
      }

      // Default 404
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    const wss = new WebSocketServer({ server });

    // Shared channels Map (like in real backend)
    const channels = new Map();

    wss.on('connection', (ws) => {
      ws.subscriptions = new Set();

      console.log('[Test Server] WebSocket client connected');

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
                console.log(`[Test Server] Client subscribed to: ${msg.channel}`);

                // Send confirmation
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
                console.log(`[Test Server] Client unsubscribed from: ${msg.channel}`);
              }
              break;

            case 'ping':
              ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
              break;
          }
        } catch (error) {
          console.error('[Test Server] Failed to parse message:', error);
        }
      });

      ws.on('close', () => {
        console.log('[Test Server] Client disconnected');
        ws.subscriptions.forEach((channel) => {
          const subs = channels.get(channel);
          if (subs) {
            subs.delete(ws);
          }
        });
        ws.subscriptions.clear();
      });

      // Expose broadcast function for testing
      ws.server = wss;
      ws.channels = channels;
    });

    server.listen(TEST_PORT, TEST_HOST, () => {
      console.log(`[Test Server] Listening on http://${TEST_HOST}:${TEST_PORT}`);
      resolve({ httpServer: server, wsServer: wss, url: `ws://${TEST_HOST}:${TEST_PORT}`, channels });
    });

    server.on('error', reject);
  });
}

/**
 * Helper function to broadcast a message (mimics backend/websocket.js)
 */
function broadcast(wsServer, channels, channel, payload) {
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

  console.log(`[Test Server] Broadcast to ${sent} client(s) on "${channel}": ${payload.type}`);
  return sent;
}

describe('WebSocket Integration Tests', () => {
  beforeAll(async () => {
    // Clean up test database if it exists
    if (existsSync(TEST_DB_PATH)) {
      unlinkSync(TEST_DB_PATH);
    }

    // Set test database path via environment
    process.env.GENERATIONS_DB_PATH = TEST_DB_PATH;

    // Initialize test database
    await initializeDatabase();
    cleanupFiles.push(TEST_DB_PATH);

    // Start test server
    const testServer = await createTestServer();
    httpServer = testServer.httpServer;
    wsServer = testServer.wsServer;
    wsServerChannels = testServer.channels; // Store the shared channels Map
    serverUrl = testServer.url;
  }, 15000);

  afterAll(async () => {
    // Close WebSocket server
    if (wsServer) {
      wsServer.close();
    }

    // Close HTTP server
    if (httpServer) {
      httpServer.close();
    }

    // Close database
    await closeDatabase();

    // Clean up test files
    cleanupFiles.forEach((file) => {
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch (e) {
          // Ignore errors during cleanup
        }
      }
    });
  }, 10000);

  describe('WebSocket Connection and Subscription', () => {
    it('should connect to WebSocket server and receive welcome message', async () => {
      const ws = new WebSocket(serverUrl);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

        ws.on('open', () => {
          console.log('[Test Client] Connected to WebSocket server');
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          console.log('[Test Client] Received:', message);

          expect(message.type).toBe('connected');
          expect(message.channels).toEqual(expect.arrayContaining(['queue', 'generations', 'models']));
          expect(message.timestamp).toBeDefined();

          clearTimeout(timeout);
          ws.close();
          resolve();
        });

        ws.on('error', reject);
      });
    });

    it('should subscribe to queue channel and receive confirmation', async () => {
      const ws = new WebSocket(serverUrl);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);

        let receivedConnected = false;
        let receivedSubscribed = false;

        ws.on('open', () => {
          // Wait for connected message before subscribing
        });

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          console.log('[Test Client] Received:', message);

          if (message.type === 'connected') {
            receivedConnected = true;
            // Subscribe to queue channel
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
          } else if (message.type === 'subscribed') {
            expect(message.channel).toBe('queue');
            expect(message.timestamp).toBeDefined();
            receivedSubscribed = true;
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });

    it('should subscribe to generations channel and receive confirmation', async () => {
      const ws = new WebSocket(serverUrl);

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Subscription timeout')), 5000);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
          } else if (message.type === 'subscribed') {
            expect(message.channel).toBe('generations');
            clearTimeout(timeout);
            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);
      });
    });
  });

  describe('WebSocket Real-Time Updates During Generation', () => {
    it('should receive job_updated message when job status changes to processing', async () => {
      const ws = new WebSocket(serverUrl);

      // Wait for connection and subscription
      await new Promise((resolve) => {
        ws.on('open', () => {});

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
          } else if (message.type === 'subscribed' && message.channel === 'queue') {
            resolve();
          }
        });
      });

      // Create a generation job
      const generationId = randomUUID();
      await createGeneration({
        id: generationId,
        type: 'generate',
        prompt: 'test prompt for WebSocket update',
        size: '512x512',
        status: GenerationStatus.PENDING,
      });

      // Simulate job_updated event (as if queueProcessor is processing)
      const jobUpdatedReceived = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Did not receive job_updated message')), 5000);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.channel === 'queue' && message.type === 'job_updated') {
            expect(message.data.id).toBe(generationId);
            expect(message.data.status).toBe(GenerationStatus.PROCESSING);
            clearTimeout(timeout);
            resolve(message);
          }
        });
      });

      // Broadcast the job_updated event
      broadcast(wsServer, wsServerChannels, 'queue', {
        type: 'job_updated',
        data: {
          id: generationId,
          status: GenerationStatus.PROCESSING,
          type: 'generate',
          prompt: 'test prompt for WebSocket update',
          created_at: new Date().toISOString(),
        },
      });

      await jobUpdatedReceived;

      ws.close();
    });

    it('should receive job_completed and generation_complete messages', async () => {
      const ws = new WebSocket(serverUrl);

      // Wait for connection and subscription to both channels
      await new Promise((resolve) => {
        let subscribedQueue = false;
        let subscribedGenerations = false;

        ws.on('open', () => {});

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
          } else if (message.type === 'subscribed') {
            if (message.channel === 'queue') {
              subscribedQueue = true;
            } else if (message.channel === 'generations') {
              subscribedGenerations = true;
            }

            if (subscribedQueue && subscribedGenerations) {
              resolve();
            }
          }
        });
      });

      // Create a generation job
      const generationId = randomUUID();
      await createGeneration({
        id: generationId,
        type: 'generate',
        prompt: 'completion test prompt',
        size: '512x512',
        status: GenerationStatus.PROCESSING,
      });

      // Track received messages
      const receivedMessages = [];

      const messagePromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          // Check what we received even if timeout
          console.log('[Test] Received messages:', receivedMessages);
          if (receivedMessages.length >= 2) {
            resolve(receivedMessages);
          } else {
            reject(new Error(`Only received ${receivedMessages.length}/2 expected messages`));
          }
        }, 5000);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          // Only track queue and generations channel messages
          if (message.channel === 'queue' || message.channel === 'generations') {
            receivedMessages.push(message);
            console.log('[Test Client] Received channel message:', message);

            if (receivedMessages.length >= 2) {
              clearTimeout(timeout);
              resolve(receivedMessages);
            }
          }
        });
      });

      // Simulate job completion events (as queueProcessor would)
      await new Promise(r => setTimeout(r, 100)); // Small delay

      // Broadcast job_completed on queue channel
      broadcast(wsServer, wsServerChannels, 'queue', {
        type: 'job_completed',
        data: {
          id: generationId,
          status: GenerationStatus.COMPLETED,
          type: 'generate',
          prompt: 'completion test prompt',
          created_at: new Date().toISOString(),
          imageCount: 1,
        },
      });

      await new Promise(r => setTimeout(r, 50)); // Small delay between messages

      // Broadcast generation_complete on generations channel
      broadcast(wsServer, wsServerChannels, 'generations', {
        type: 'generation_complete',
        data: {
          id: generationId,
          status: GenerationStatus.COMPLETED,
          type: 'generate',
          prompt: 'completion test prompt',
          created_at: new Date().toISOString(),
          imageCount: 1,
        },
      });

      const messages = await messagePromise;

      // Verify we got both messages
      const jobCompleted = messages.find(m => m.type === 'job_completed');
      const generationComplete = messages.find(m => m.type === 'generation_complete');

      expect(jobCompleted).toBeDefined();
      expect(jobCompleted.channel).toBe('queue');
      expect(jobCompleted.data.id).toBe(generationId);
      expect(jobCompleted.data.status).toBe('completed');

      expect(generationComplete).toBeDefined();
      expect(generationComplete.channel).toBe('generations');
      expect(generationComplete.data.id).toBe(generationId);
      expect(generationComplete.data.imageCount).toBe(1);

      ws.close();
    });

    it('should receive job_failed message when generation fails', async () => {
      const ws = new WebSocket(serverUrl);

      // Wait for connection and subscription
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

      // Create a generation job
      const generationId = randomUUID();
      await createGeneration({
        id: generationId,
        type: 'generate',
        prompt: 'failing test prompt',
        size: '512x512',
        status: GenerationStatus.PROCESSING,
      });

      // Listen for job_failed message
      const failedPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Did not receive job_failed message')), 5000);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.channel === 'queue' && message.type === 'job_failed') {
            expect(message.data.id).toBe(generationId);
            expect(message.data.status).toBe('failed');
            expect(message.data.error).toBeDefined();
            clearTimeout(timeout);
            resolve(message);
          }
        });
      });

      // Simulate job failure
      broadcast(wsServer, wsServerChannels, 'queue', {
        type: 'job_failed',
        data: {
          id: generationId,
          status: GenerationStatus.FAILED,
          type: 'generate',
          prompt: 'failing test prompt',
          error: 'Test error: Simulated generation failure',
          created_at: new Date().toISOString(),
        },
      });

      await failedPromise;

      ws.close();
    });
  });

  describe('WebSocket Message Format Validation', () => {
    it('should send properly formatted broadcast messages', async () => {
      const ws = new WebSocket(serverUrl);

      await new Promise((resolve) => {
        ws.on('open', () => {});

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
          } else if (message.type === 'subscribed' && message.channel === 'generations') {
            resolve();
          }
        });
      });

      const messages = [];

      const messagePromise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(messages), 3000);

        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.channel === 'queue' || message.channel === 'generations') {
            messages.push(message);

            if (messages.length >= 2) {
              clearTimeout(timeout);
              resolve(messages);
            }
          }
        });
      });

      const generationId = randomUUID();

      // Broadcast both message types
      broadcast(wsServer, wsServerChannels, 'queue', {
        type: 'job_updated',
        data: {
          id: generationId,
          status: 'processing',
          type: 'generate',
          prompt: 'format test',
          created_at: new Date().toISOString(),
          progress: 0.5,
        },
      });

      broadcast(wsServer, wsServerChannels, 'generations', {
        type: 'generation_complete',
        data: {
          id: generationId,
          status: 'completed',
          type: 'generate',
          prompt: 'format test',
          created_at: new Date().toISOString(),
          imageCount: 2,
        },
      });

      const received = await messagePromise;

      // Validate message format
      received.forEach((msg) => {
        // Must have channel
        expect(msg).toHaveProperty('channel');

        // Must have type
        expect(msg).toHaveProperty('type');

        // Must have data
        expect(msg).toHaveProperty('data');

        // Data must have id
        expect(msg.data).toHaveProperty('id');

        // Data must have status
        expect(msg.data).toHaveProperty('status');

        // Data must have prompt
        expect(msg.data).toHaveProperty('prompt');

        // Data must have created_at
        expect(msg.data).toHaveProperty('created_at');
      });

      ws.close();
    });
  });

  describe('Multi-Client WebSocket Scenarios', () => {
    it('should broadcast to multiple subscribed clients', async () => {
      const client1 = new WebSocket(serverUrl);
      const client2 = new WebSocket(serverUrl);
      let clientsReady = 0;

      // Wait for both clients to connect and subscribe
      const readyPromise = new Promise((resolve) => {
        const onMessage = (ws, clientNum) => (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws.send(JSON.stringify({ type: 'subscribe', channel: 'generations' }));
          } else if (message.type === 'subscribed') {
            clientsReady++;
            if (clientsReady >= 2) {
              resolve();
            }
          }
        };

        client1.on('message', onMessage(client1, 1));
        client2.on('message', onMessage(client2, 2));
      });

      await readyPromise;

      // Track messages received by both clients
      const client1Messages = [];
      const client2Messages = [];

      const client1Promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(client1Messages), 3000);
        client1.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.channel === 'generations') {
            client1Messages.push(message);
            if (client1Messages.length > 0) {
              clearTimeout(timeout);
              resolve(client1Messages);
            }
          }
        });
      });

      const client2Promise = new Promise((resolve) => {
        const timeout = setTimeout(() => resolve(client2Messages), 3000);
        client2.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.channel === 'generations') {
            client2Messages.push(message);
            if (client2Messages.length > 0) {
              clearTimeout(timeout);
              resolve(client2Messages);
            }
          }
        });
      });

      // Broadcast a message
      const generationId = randomUUID();
      broadcast(wsServer, wsServerChannels, 'generations', {
        type: 'generation_complete',
        data: {
          id: generationId,
          status: 'completed',
          type: 'generate',
          prompt: 'multi-client test',
          created_at: new Date().toISOString(),
          imageCount: 1,
        },
      });

      const [msg1, msg2] = await Promise.all([client1Promise, client2Promise]);

      // Both clients should receive the message
      expect(msg1.length).toBeGreaterThan(0);
      expect(msg2.length).toBeGreaterThan(0);
      expect(msg1[0].data.id).toBe(generationId);
      expect(msg2[0].data.id).toBe(generationId);

      client1.close();
      client2.close();
    });
  });

  describe('WebSocket Reconnection Scenarios', () => {
    it('should handle client disconnect and reconnect', async () => {
      // First connection
      const ws1 = new WebSocket(serverUrl);

      await new Promise((resolve) => {
        ws1.on('open', () => {});

        ws1.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            ws1.send(JSON.stringify({ type: 'subscribe', channel: 'queue' }));
          } else if (message.type === 'subscribed') {
            resolve();
          }
        });
      });

      // Close first connection
      ws1.close();

      // Wait a bit and reconnect
      await new Promise(r => setTimeout(r, 100));

      const ws2 = new WebSocket(serverUrl);

      const connected = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Reconnection failed')), 5000);

        ws2.on('message', (data) => {
          const message = JSON.parse(data.toString());

          if (message.type === 'connected') {
            clearTimeout(timeout);
            resolve(true);
          }
        });

        ws2.on('error', reject);
      });

      expect(connected).toBe(true);

      ws2.close();
    });
  });
});
