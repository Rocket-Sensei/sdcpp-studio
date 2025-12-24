/**
 * Vitest WebSocket Tests
 *
 * Tests WebSocket functionality including:
 * - Module exports and structure
 * - Message protocol validation
 * - Channel constants
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read source files for static analysis
const getWebSocketSource = () => {
  return readFileSync(join(__dirname, '../backend/services/websocket.js'), 'utf-8');
};

const getUseWebSocketSource = () => {
  return readFileSync(join(__dirname, '../frontend/src/hooks/useWebSocket.js'), 'utf-8');
};

describe('WebSocket Backend Module', () => {
  const source = getWebSocketSource();

  it('should export broadcast function', () => {
    expect(source).toContain('export');
    expect(source).toContain('function broadcast');
    expect(source).toContain('broadcastQueueEvent');
  });

  it('should support queue channel', () => {
    expect(source).toMatch(/['"]queue['"]/);
  });

  it('should support generations channel', () => {
    expect(source).toMatch(/['"]generations['"]/);
  });

  it('should support models channel', () => {
    expect(source).toMatch(/['"]models['"]/);
  });

  it('should handle subscribe messages', () => {
    expect(source).toMatch(/['"]subscribe['"]/);
    expect(source).toContain('type');
  });

  it('should handle unsubscribe messages', () => {
    expect(source).toMatch(/['"]unsubscribe['"]/);
  });

  it('should handle ping/pong messages', () => {
    expect(source).toMatch(/['"]ping['"]/);
    expect(source).toMatch(/['"]pong['"]/);
  });

  it('should import WebSocket from ws package', () => {
    expect(source).toContain("from 'ws'");
    expect(source).toContain('WebSocketServer');
  });

  it('should define channels object', () => {
    expect(source).toContain('const channels');
    expect(source).toContain('new Map');
  });
});

describe('WebSocket Frontend Hook', () => {
  const source = getUseWebSocketSource();

  it('should export useWebSocket hook', () => {
    expect(source).toContain('export');
    expect(source).toContain('useWebSocket');
  });

  it('should export WS_CHANNELS constant', () => {
    expect(source).toContain('WS_CHANNELS');
    expect(source).toContain('QUEUE');
    expect(source).toContain('GENERATIONS');
    expect(source).toContain('MODELS');
  });

  it('should use react-use-websocket', () => {
    expect(source).toContain('react-use-websocket');
  });

  it('should handle onMessage callback', () => {
    expect(source).toContain('onMessage');
  });

  it('should handle onConnectionChange callback', () => {
    expect(source).toContain('onConnectionChange');
  });

  it('should return isConnected status', () => {
    expect(source).toContain('isConnected');
  });
});

describe('WebSocket Message Protocol', () => {
  const source = getWebSocketSource();

  it('should send welcome message with connected type', () => {
    expect(source).toMatch(/['"]connected['"]/);
    expect(source).toContain('channels');
    expect(source).toContain('timestamp');
  });

  it('should send subscribed confirmation', () => {
    expect(source).toMatch(/['"]subscribed['"]/);
    expect(source).toContain('channel');
  });

  it('should handle unsubscribe without confirmation', () => {
    // The unsubscribe function doesn't send a confirmation, it just cleans up
    expect(source).toContain('function unsubscribe');
    expect(source).toContain('ws.subscriptions.delete(channel)');
  });

  it('should format broadcast messages with channel, type, data', () => {
    expect(source).toContain('channel:');
    expect(source).toContain('type:');
    expect(source).toContain('data:');
  });
});

describe('WebSocket Integration Points', () => {
  it('should be integrated in server.js', () => {
    const serverSource = readFileSync(join(__dirname, '../backend/server.js'), 'utf-8');
    expect(serverSource).toContain('initializeWebSocket');
    expect(serverSource).toContain('http.createServer');
  });

  it('should be used in queueProcessor for job updates', () => {
    const queueSource = readFileSync(join(__dirname, '../backend/services/queueProcessor.js'), 'utf-8');
    expect(queueSource).toContain('broadcastQueueEvent');
    expect(queueSource).toContain('broadcastGenerationComplete');
  });

  it('should be used in modelManager for status updates', () => {
    const modelSource = readFileSync(join(__dirname, '../backend/services/modelManager.js'), 'utf-8');
    expect(modelSource).toContain('broadcastModelStatus');
  });

  it('should be used in UnifiedQueue for real-time updates', () => {
    const queueSource = readFileSync(join(__dirname, '../frontend/src/components/UnifiedQueue.jsx'), 'utf-8');
    expect(queueSource).toContain('useWebSocket');
    expect(queueSource).toContain('WS_CHANNELS');
    expect(queueSource).toContain('isConnected');
    // Should NOT have the old polling code
    expect(queueSource).not.toContain('setInterval(fetchGenerations, 3000)');
  });
});

describe('WebSocket Channel Types', () => {
  const backendSource = getWebSocketSource();
  const frontendSource = getUseWebSocketSource();

  it('should have consistent channel names between backend and frontend', () => {
    // Backend should have these channels
    expect(backendSource).toContain('queue');
    expect(backendSource).toContain('generations');
    expect(backendSource).toContain('models');

    // Frontend should reference these channels
    expect(frontendSource).toContain('QUEUE');
    expect(frontendSource).toContain('GENERATIONS');
    expect(frontendSource).toContain('MODELS');
  });
});
