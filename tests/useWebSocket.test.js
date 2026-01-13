import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket, WS_CHANNELS, useQueueUpdates, useGenerationUpdates, useModelStatusUpdates } from '../frontend/src/hooks/useWebSocket.js';

// Mock react-use-websocket
const mockReactWebSocket = vi.fn();
vi.mock('react-use-websocket', () => ({
  default: () => mockReactWebSocket(),
}));

// Mock window.location
const mockLocation = {
  protocol: 'http:',
  host: 'localhost:3000',
};

Object.defineProperty(window, 'location', {
  value: mockLocation,
  writable: true,
});

// Mock import.meta.env
const mockEnv = { VITE_WS_URL: undefined };
vi.stubGlobal('import.meta', { env: mockEnv });

describe('useWebSocket', () => {
  let mockSendJsonMessage;
  let mockGetWebSocket;

  beforeEach(() => {
    mockSendJsonMessage = vi.fn();
    mockGetWebSocket = vi.fn(() => ({ close: vi.fn() }));

    // Reset the mock implementation
    mockReactWebSocket.mockReturnValue({
      sendJsonMessage: mockSendJsonMessage,
      lastJsonMessage: null,
      readyState: 3, // CLOSED
      getWebSocket: mockGetWebSocket,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('WS_CHANNELS export', () => {
    it('should export QUEUE channel', () => {
      expect(WS_CHANNELS.QUEUE).toBe('queue');
    });

    it('should export GENERATIONS channel', () => {
      expect(WS_CHANNELS.GENERATIONS).toBe('generations');
    });

    it('should export MODELS channel', () => {
      expect(WS_CHANNELS.MODELS).toBe('models');
    });
  });

  describe('basic hook usage', () => {
    it('should return initial connection state', () => {
      const { result } = renderHook(() => useWebSocket());

      expect(result.current).toEqual({
        isConnected: false,
        isConnecting: false,
        lastMessage: null,
        sendMessage: expect.any(Function),
        subscribe: expect.any(Function),
        unsubscribe: expect.any(Function),
        getWebSocket: expect.any(Function),
      });
    });

    it('should use default channels when none specified', () => {
      const { result } = renderHook(() => useWebSocket());

      // Should have all channel methods
      expect(result.current.subscribe).toBeDefined();
      expect(result.current.unsubscribe).toBeDefined();
    });

    it('should use custom channels when specified', () => {
      const customChannels = ['queue'];
      const { result } = renderHook(() => useWebSocket({ channels: customChannels }));

      expect(result.current.subscribe).toBeDefined();
    });
  });

  describe('connection states', () => {
    it('should report isConnected when readyState is OPEN', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 1, // OPEN
        getWebSocket: mockGetWebSocket,
      });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(true);
      expect(result.current.isConnecting).toBe(false);
    });

    it('should report isConnecting when readyState is CONNECTING', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 0, // CONNECTING
        getWebSocket: mockGetWebSocket,
      });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(true);
    });

    it('should report disconnected when readyState is CLOSED', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 3, // CLOSED
        getWebSocket: mockGetWebSocket,
      });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
    });

    it('should report disconnected when readyState is CLOSING', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 2, // CLOSING
        getWebSocket: mockGetWebSocket,
      });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.isConnected).toBe(false);
      expect(result.current.isConnecting).toBe(false);
    });
  });

  describe('subscribe functionality', () => {
    it('should subscribe to a channel', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.subscribe('test-channel');
      });

      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        channel: 'test-channel',
      });
    });

    it('should not subscribe twice to the same channel', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.subscribe('test-channel');
        result.current.subscribe('test-channel');
      });

      expect(mockSendJsonMessage).toHaveBeenCalledTimes(1);
    });

    it('should subscribe to multiple channels', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.subscribe('channel1');
        result.current.subscribe('channel2');
        result.current.subscribe('channel3');
      });

      expect(mockSendJsonMessage).toHaveBeenCalledTimes(3);
      expect(mockSendJsonMessage).toHaveBeenNthCalledWith(1, {
        type: 'subscribe',
        channel: 'channel1',
      });
      expect(mockSendJsonMessage).toHaveBeenNthCalledWith(2, {
        type: 'subscribe',
        channel: 'channel2',
      });
      expect(mockSendJsonMessage).toHaveBeenNthCalledWith(3, {
        type: 'subscribe',
        channel: 'channel3',
      });
    });
  });

  describe('unsubscribe functionality', () => {
    it('should unsubscribe from a channel', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.subscribe('test-channel');
        result.current.unsubscribe('test-channel');
      });

      expect(mockSendJsonMessage).toHaveBeenLastCalledWith({
        type: 'unsubscribe',
        channel: 'test-channel',
      });
    });

    it('should not unsubscribe if not subscribed', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.unsubscribe('test-channel');
      });

      // Should not send unsubscribe message if not subscribed
      // But the function should not throw
      expect(mockSendJsonMessage).not.toHaveBeenCalled();
    });
  });

  describe('sendMessage functionality', () => {
    it('should send message with payload', () => {
      const { result } = renderHook(() => useWebSocket());

      const payload = { action: 'test', data: { id: 123 } };

      act(() => {
        result.current.sendMessage(payload);
      });

      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'message',
        payload,
      });
    });

    it('should send empty payload', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.sendMessage({});
      });

      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'message',
        payload: {},
      });
    });
  });

  describe('message handling', () => {
    it('should receive last message', () => {
      const testMessage = { channel: 'queue', type: 'job_updated', data: { id: 1 } };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.lastMessage).toEqual(testMessage);
    });

    it('should call onMessage callback when message received', () => {
      const onMessage = vi.fn();
      const testMessage = { channel: 'queue', data: 'test' };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket({ onMessage }));

      expect(onMessage).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('connection change callback', () => {
    it('should call onConnectionChange when connection state changes', () => {
      const onConnectionChange = vi.fn();

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 1, // OPEN
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket({ onConnectionChange }));

      expect(onConnectionChange).toHaveBeenCalledWith(true);
    });

    it('should call onConnectionChange with false when disconnected', () => {
      const onConnectionChange = vi.fn();

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 3, // CLOSED
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket({ onConnectionChange }));

      expect(onConnectionChange).toHaveBeenCalledWith(false);
    });
  });

  describe('auto-subscribe on connect', () => {
    it('should auto-subscribe to initial channels when connected', () => {
      const initialChannels = ['queue', 'generations'];

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 1, // OPEN
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket({ channels: initialChannels }));

      // Should have subscribed to both channels
      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        channel: 'queue',
      });
      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        channel: 'generations',
      });
    });
  });

  describe('cleanup on unmount', () => {
    it('should unsubscribe from all channels on unmount', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 1, // OPEN
        getWebSocket: mockGetWebSocket,
      });

      const { unmount } = renderHook(() => useWebSocket({
        channels: ['queue', 'generations', 'models'],
      }));

      // Wait for subscriptions
      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'subscribe',
        channel: 'queue',
      });

      mockSendJsonMessage.mockClear();

      unmount();

      // Should unsubscribe from subscribed channels
      expect(mockSendJsonMessage).toHaveBeenCalledWith({
        type: 'unsubscribe',
        channel: 'queue',
      });
    });
  });

  describe('custom reconnect interval', () => {
    it('should use custom reconnect interval', () => {
      const customInterval = 5000;

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 3,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket({ reconnectInterval: customInterval }));

      // The hook renders successfully with custom reconnect interval
      expect(mockReactWebSocket).toHaveBeenCalled();
    });

    it('should use default reconnect interval when not specified', () => {
      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: null,
        readyState: 3,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useWebSocket());

      // The hook renders successfully with default reconnect interval
      expect(mockReactWebSocket).toHaveBeenCalled();
    });
  });

  describe('useQueueUpdates', () => {
    it('should subscribe to queue channel', () => {
      const { result } = renderHook(() => useQueueUpdates(vi.fn()));

      expect(result.current.subscribe).toBeDefined();
      expect(result.current.unsubscribe).toBeDefined();
      expect(result.current.isConnected).toBe(false);
    });

    it('should call onJobUpdate when queue message received', () => {
      const onJobUpdate = vi.fn();
      const testMessage = { channel: 'queue', type: 'job_updated', data: { id: 1 } };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useQueueUpdates(onJobUpdate));

      expect(onJobUpdate).toHaveBeenCalledWith(testMessage);
    });

    it('should not call onJobUpdate for non-queue messages', () => {
      const onJobUpdate = vi.fn();
      const testMessage = { channel: 'models', type: 'model_changed', data: {} };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useQueueUpdates(onJobUpdate));

      // Should not be called because channel is not 'queue'
      expect(onJobUpdate).not.toHaveBeenCalled();
    });
  });

  describe('useGenerationUpdates', () => {
    it('should subscribe to generations channel', () => {
      const { result } = renderHook(() => useGenerationUpdates(vi.fn()));

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastMessage).toBeNull();
    });

    it('should call onGenerationComplete when generation message received', () => {
      const onGenerationComplete = vi.fn();
      const testMessage = {
        channel: 'generations',
        type: 'generation_completed',
        data: { id: 'gen-123' },
      };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useGenerationUpdates(onGenerationComplete));

      expect(onGenerationComplete).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('useModelStatusUpdates', () => {
    it('should subscribe to models channel', () => {
      const { result } = renderHook(() => useModelStatusUpdates(vi.fn()));

      expect(result.current.isConnected).toBe(false);
      expect(result.current.lastMessage).toBeNull();
    });

    it('should call onModelStatusChange when model status message received', () => {
      const onModelStatusChange = vi.fn();
      const testMessage = {
        channel: 'models',
        type: 'model_status_changed',
        data: { modelId: 'model-1', status: 'running' },
      };

      mockReactWebSocket.mockReturnValue({
        sendJsonMessage: mockSendJsonMessage,
        lastJsonMessage: testMessage,
        readyState: 1,
        getWebSocket: mockGetWebSocket,
      });

      renderHook(() => useModelStatusUpdates(onModelStatusChange));

      expect(onModelStatusChange).toHaveBeenCalledWith(testMessage);
    });
  });

  describe('getWebSocket', () => {
    it('should return raw WebSocket instance', () => {
      const mockWsInstance = { close: vi.fn(), send: vi.fn() };
      mockGetWebSocket.mockReturnValue(mockWsInstance);

      const { result } = renderHook(() => useWebSocket());

      const wsInstance = result.current.getWebSocket();
      expect(wsInstance).toEqual(mockWsInstance);
    });
  });
});
