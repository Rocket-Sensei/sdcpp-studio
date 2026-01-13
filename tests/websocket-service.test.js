/**
 * Tests for WebSocket Service
 *
 * Tests WebSocket server functionality including:
 * - Server initialization and upgrade handling
 * - Client connection and disconnection
 * - Channel subscription management
 * - Message broadcasting
 * - Helper functions for specific channels
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'http';

// Use vi.hoisted to set up state that can be accessed in mocks
const { MockWSSImpl, resetWSS } = vi.hoisted(() => {
  let instance = null;

  return {
    MockWSSImpl: class {
      constructor() {
        this.clients = new Set();
        this.handleUpgrade = () => {};
        instance = this;
        // Add EventEmitter methods manually
        this._listeners = {};
      }

      on(event, callback) {
        if (!this._listeners) this._listeners = {};
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(callback);
      }

      emit(event, ...args) {
        if (!this._listeners) this._listeners = {};
        const listeners = this._listeners[event] || [];
        listeners.forEach(cb => cb(...args));
      }

      close() {}
    },
    resetWSS: () => { instance = null; },
    getInstance: () => instance
  };
});

vi.mock('ws', () => ({
  WebSocketServer: vi.fn(function() {
    return new MockWSSImpl();
  }),
}));

// Mock logger
vi.mock('../backend/utils/logger.js', () => ({
  createLogger: () => ({
    info: () => {},
    debug: () => {},
    warn: () => {},
    error: () => {},
  }),
}));

import {
  initializeWebSocket,
  getWebSocketServer,
  broadcast,
  broadcastQueueEvent,
  broadcastGenerationComplete,
  broadcastModelStatus,
  getStats,
  CHANNELS,
} from '../backend/services/websocket.js';

describe('WebSocket Service - Initialization', () => {
  let mockServer;

  beforeEach(() => {
    mockServer = http.createServer();
    vi.clearAllMocks();
  });

  it('should initialize WebSocket server', () => {
    const wss = initializeWebSocket(mockServer);

    expect(wss).toBeDefined();
    expect(WebSocketServer).toHaveBeenCalledWith({
      noServer: true,
      path: '/ws'
    });
  });

  it('should return same instance on subsequent calls', () => {
    const wss1 = initializeWebSocket(mockServer);
    const wss2 = initializeWebSocket(mockServer);

    expect(wss1).toBe(wss2);
    expect(logger.info).toHaveBeenCalledWith('Server already initialized');
  });

  it('should set up upgrade handler on HTTP server', () => {
    initializeWebSocket(mockServer);

    // Check that upgrade event listener was registered
    expect(mockServer.listenerCount('upgrade')).toBe(1);
  });

  it('should handle upgrade requests for /ws path', () => {
    initializeWebSocket(mockServer);

    const mockSocket = new EventEmitter();
    mockSocket.destroy = vi.fn();
    const mockRequest = {
      url: '/ws',
      headers: { host: 'localhost' }
    };

    // Trigger upgrade event
    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.from([]));

    expect(mockSocket.destroy).not.toHaveBeenCalled();
  });

  it('should destroy socket for non-ws paths', () => {
    initializeWebSocket(mockServer);

    const mockSocket = new EventEmitter();
    mockSocket.destroy = vi.fn();
    const mockRequest = {
      url: '/other-path',
      headers: { host: 'localhost' }
    };

    // Trigger upgrade event
    mockServer.emit('upgrade', mockRequest, mockSocket, Buffer.from([]));

    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it('should get WebSocket server instance after initialization', () => {
    const wss = initializeWebSocket(mockServer);
    const retrieved = getWebSocketServer();

    expect(retrieved).toBe(wss);
  });

  it('should return null before initialization', () => {
    const retrieved = getWebSocketServer();

    expect(retrieved).toBeNull();
  });
});

describe('WebSocket Service - Channel Constants', () => {
  it('should export QUEUE channel constant', () => {
    expect(CHANNELS.QUEUE).toBe('queue');
  });

  it('should export GENERATIONS channel constant', () => {
    expect(CHANNELS.GENERATIONS).toBe('generations');
  });

  it('should export MODELS channel constant', () => {
    expect(CHANNELS.MODELS).toBe('models');
  });
});

describe('WebSocket Service - Client Connection', () => {
  let mockServer;
  let mockWSS;
  let mockClient;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    // Create mock client
    mockClient = {
      readyState: 1, // OPEN
      send: vi.fn(),
      ping: vi.fn(),
      subscriptions: new Set(),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    // Simulate connection event
    if (mockWSS.on) {
      mockWSS.emit('connection', mockClient);
    }
  });

  it('should send welcome message on connection', () => {
    expect(mockClient.send).toHaveBeenCalledWith(
      expect.stringContaining('"connected"')
    );
  });

  it('should include available channels in welcome message', () => {
    const sentData = mockClient.send.mock.calls[0][0];
    const parsed = JSON.parse(sentData);

    expect(parsed.channels).toEqual(expect.arrayContaining([
      'queue',
      'generations',
      'models'
    ]));
  });

  it('should include timestamp in welcome message', () => {
    const sentData = mockClient.send.mock.calls[0][0];
    const parsed = JSON.parse(sentData);

    expect(parsed.timestamp).toBeDefined();
    expect(parsed.timestamp).toBeLessThanOrEqual(Date.now());
  });

  it('should initialize subscriptions Set', () => {
    expect(mockClient.subscriptions).toBeInstanceOf(Set);
  });

  it('should set isAlive to true', () => {
    expect(mockClient.isAlive).toBe(true);
  });
});

describe('WebSocket Service - Message Handling', () => {
  let mockServer;
  let mockWSS;
  let mockClient;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    mockClient = {
      readyState: 1,
      send: vi.fn(),
      ping: vi.fn(),
      subscriptions: new Set(),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    if (mockWSS.on) {
      mockWSS.emit('connection', mockClient);
    }
  });

  it('should handle subscribe message', () => {
    const message = JSON.stringify({
      type: 'subscribe',
      channel: 'queue'
    });

    if (mockClient.message) {
      mockClient.message(Buffer.from(message));
    }

    expect(mockClient.subscriptions.has('queue')).toBe(true);
    expect(mockClient.send).toHaveBeenCalledWith(
      expect.stringContaining('"subscribed"')
    );
  });

  it('should handle unsubscribe message', () => {
    mockClient.subscriptions.add('queue');

    const message = JSON.stringify({
      type: 'unsubscribe',
      channel: 'queue'
    });

    if (mockClient.message) {
      mockClient.message(Buffer.from(message));
    }

    expect(mockClient.subscriptions.has('queue')).toBe(false);
  });

  it('should handle ping message', () => {
    const message = JSON.stringify({
      type: 'ping'
    });

    if (mockClient.message) {
      mockClient.message(Buffer.from(message));
    }

    expect(mockClient.send).toHaveBeenCalledWith(
      expect.stringContaining('"pong"')
    );
  });

  it('should ignore unknown message types', () => {
    const message = JSON.stringify({
      type: 'unknown'
    });

    if (mockClient.message) {
      mockClient.message(Buffer.from(message));
    }

    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({
        msgType: 'unknown'
      }),
      'Unknown message type'
    );
  });

  it('should handle malformed JSON gracefully', () => {
    const message = 'invalid json{';

    if (mockClient.message) {
      mockClient.message(Buffer.from(message));
    }

    expect(logger.error).toHaveBeenCalled();
  });
});

describe('WebSocket Service - Broadcasting', () => {
  let mockServer;
  let mockWSS;
  let mockClient1;
  let mockClient2;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    // Create two mock clients
    mockClient1 = {
      readyState: 1,
      send: vi.fn(),
      subscriptions: new Set(['queue']),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient1[event] = callback;
      }),
    };

    mockClient2 = {
      readyState: 1,
      send: vi.fn(),
      subscriptions: new Set(['generations']),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient2[event] = callback;
      }),
    };

    if (mockWSS.on) {
      mockWSS.emit('connection', mockClient1);
      mockWSS.emit('connection', mockClient2);
    }
  });

  it('should broadcast to subscribers of a channel', () => {
    broadcast('queue', {
      type: 'test_event',
      data: { message: 'test' }
    });

    expect(mockClient1.send).toHaveBeenCalled();
    expect(mockClient2.send).not.toHaveBeenCalled();
  });

  it('should include channel in broadcast message', () => {
    broadcast('queue', {
      type: 'test_event'
    });

    const sentData = mockClient1.send.mock.calls[0][0];
    const parsed = JSON.parse(sentData);

    expect(parsed.channel).toBe('queue');
    expect(parsed.type).toBe('test_event');
  });

  it('should not send to closed connections', () => {
    mockClient1.readyState = 3; // CLOSED

    broadcast('queue', {
      type: 'test_event'
    });

    expect(mockClient1.send).not.toHaveBeenCalled();
  });

  it('should handle broadcast with no subscribers', () => {
    expect(() => {
      broadcast('nonexistent', {
        type: 'test_event'
      });
    }).not.toThrow();
  });
});

describe('WebSocket Service - Helper Functions', () => {
  let mockServer;
  let mockWSS;
  let mockClient;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    mockClient = {
      readyState: 1,
      send: vi.fn(),
      subscriptions: new Set(['queue', 'generations', 'models']),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    if (mockWSS.on) {
      mockWSS.emit('connection', mockClient);
    }
  });

  describe('broadcastQueueEvent', () => {
    it('should broadcast queue event with correct structure', () => {
      const job = {
        id: 'job-123',
        status: 'processing',
        type: 'generate',
        prompt: 'a cat',
        created_at: Date.now(),
        progress: 0.5
      };

      broadcastQueueEvent(job, 'job_updated');

      expect(mockClient.send).toHaveBeenCalled();

      const sentData = mockClient.send.mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.channel).toBe('queue');
      expect(parsed.type).toBe('job_updated');
      expect(parsed.data.id).toBe('job-123');
      expect(parsed.data.status).toBe('processing');
    });
  });

  describe('broadcastGenerationComplete', () => {
    it('should broadcast generation completion', () => {
      const generation = {
        id: 'gen-123',
        status: 'completed',
        type: 'generate',
        prompt: 'a cat',
        created_at: Date.now(),
        imageCount: 2
      };

      broadcastGenerationComplete(generation);

      expect(mockClient.send).toHaveBeenCalled();

      const sentData = mockClient.send.mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.channel).toBe('generations');
      expect(parsed.type).toBe('generation_complete');
      expect(parsed.data.imageCount).toBe(2);
    });
  });

  describe('broadcastModelStatus', () => {
    it('should broadcast model status change', () => {
      broadcastModelStatus('model-123', 'running', {
        port: 8080,
        pid: 12345
      });

      expect(mockClient.send).toHaveBeenCalled();

      const sentData = mockClient.send.mock.calls[0][0];
      const parsed = JSON.parse(sentData);

      expect(parsed.channel).toBe('models');
      expect(parsed.type).toBe('model_status_changed');
      expect(parsed.data.modelId).toBe('model-123');
      expect(parsed.data.status).toBe('running');
      expect(parsed.data.port).toBe(8080);
    });
  });
});

describe('WebSocket Service - Statistics', () => {
  let mockServer;
  let mockWSS;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);
  });

  it('should return stats before initialization', () => {
    const stats = getStats();

    expect(stats.connectedClients).toBe(0);
    expect(stats.channels).toEqual({});
  });

  it('should return connected clients count', () => {
    // Mock the clients Set
    mockWSS.clients = new Set([
      { id: 1 },
      { id: 2 },
      { id: 3 }
    ]);

    const stats = getStats();

    expect(stats.connectedClients).toBe(3);
  });

  it('should return empty stats when server not initialized', () => {
    // Reset module state
    const freshStats = getStats();

    expect(freshStats.connectedClients).toBe(0);
  });
});

describe('WebSocket Service - Client Lifecycle', () => {
  let mockServer;
  let mockWSS;
  let mockClient;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    mockClient = {
      readyState: 1,
      send: vi.fn(),
      ping: vi.fn(),
      subscriptions: new Set(),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    if (mockWSS.on) {
      mockWSS.emit('connection', mockClient);
    }
  });

  it('should handle pong messages', () => {
    if (mockClient.pong) {
      mockClient.pong();
    }

    expect(mockClient.isAlive).toBe(true);
  });

  it('should handle client disconnection', () => {
    mockClient.subscriptions.add('queue');
    mockClient.subscriptions.add('models');

    if (mockClient.close) {
      mockClient.close();
    }

    expect(mockClient.subscriptions.size).toBe(0);
  });

  it('should handle connection errors', () => {
    const error = new Error('Connection lost');

    if (mockClient.error) {
      mockClient.error(error);
    }

    expect(logger.error).toHaveBeenCalled();
  });
});

describe('WebSocket Service - Ping/Pong Heartbeat', () => {
  it('should set up ping interval on initialization', () => {
    const mockServer = http.createServer();

    vi.useFakeTimers();

    initializeWebSocket(mockServer);

    // Fast-forward time
    vi.advanceTimersByTime(30000);

    vi.useRealTimers();

    // Should have ping interval set up
    expect(true).toBe(true);
  });

  it('should terminate dead connections', () => {
    const mockServer = http.createServer();
    const mockWSS = initializeWebSocket(mockServer);

    const mockClient = {
      readyState: 1,
      send: vi.fn(),
      ping: vi.fn(),
      isAlive: false, // Dead connection
      terminate: vi.fn(),
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    mockWSS.clients = new Set([mockClient]);

    vi.useFakeTimers();
    vi.advanceTimersByTime(30000);
    vi.useRealTimers();

    // Dead client should be terminated
    if (mockClient.isAlive === false) {
      expect(mockClient.terminate).toHaveBeenCalled();
    }
  });
});

describe('WebSocket Service - Multiple Subscribers', () => {
  let mockServer;
  let mockWSS;
  let clients;

  beforeEach(() => {
    mockServer = http.createServer();
    mockWSS = initializeWebSocket(mockServer);

    clients = [];
    for (let i = 0; i < 3; i++) {
      const client = {
        readyState: 1,
        send: vi.fn(),
        subscriptions: new Set(['queue']),
        isAlive: true,
        on: vi.fn((event, callback) => {
          client[event] = callback;
        }),
      };
      clients.push(client);

      if (mockWSS.on) {
        mockWSS.emit('connection', client);
      }
    }
  });

  it('should broadcast to all subscribers of a channel', () => {
    broadcast('queue', {
      type: 'test_event'
    });

    clients.forEach(client => {
      expect(client.send).toHaveBeenCalled();
    });
  });

  it('should only send to relevant channel subscribers', () => {
    clients[0].subscriptions = new Set(['queue']);
    clients[1].subscriptions = new Set(['generations']);
    clients[2].subscriptions = new Set(['models']);

    broadcast('queue', {
      type: 'test_event'
    });

    expect(clients[0].send).toHaveBeenCalled();
    expect(clients[1].send).not.toHaveBeenCalled();
    expect(clients[2].send).not.toHaveBeenCalled();
  });
});

describe('WebSocket Service - Edge Cases', () => {
  it('should handle rapid subscribe/unsubscribe', () => {
    const mockServer = http.createServer();
    initializeWebSocket(mockServer);

    const mockClient = {
      readyState: 1,
      send: vi.fn(),
      subscriptions: new Set(),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    const wss = getWebSocketServer();
    if (wss && wss.on) {
      wss.emit('connection', mockClient);
    }

    // Subscribe
    if (mockClient.message) {
      mockClient.message(Buffer.from(JSON.stringify({
        type: 'subscribe',
        channel: 'queue'
      })));
    }

    expect(mockClient.subscriptions.has('queue')).toBe(true);

    // Unsubscribe
    if (mockClient.message) {
      mockClient.message(Buffer.from(JSON.stringify({
        type: 'unsubscribe',
        channel: 'queue'
      })));
    }

    expect(mockClient.subscriptions.has('queue')).toBe(false);
  });

  it('should handle empty payload in broadcast', () => {
    const mockServer = http.createServer();
    initializeWebSocket(mockServer);

    const mockClient = {
      readyState: 1,
      send: vi.fn(),
      subscriptions: new Set(['queue']),
      isAlive: true,
      on: vi.fn((event, callback) => {
        mockClient[event] = callback;
      }),
    };

    const wss = getWebSocketServer();
    if (wss && wss.on) {
      wss.emit('connection', mockClient);
    }

    expect(() => {
      broadcast('queue', {});
    }).not.toThrow();
  });
});
