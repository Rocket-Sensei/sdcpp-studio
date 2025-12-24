/**
 * WebSocket Hook for SD-WebUI
 *
 * Provides real-time updates from the backend via WebSocket.
 *
 * Channels:
 * - 'queue': Job status updates
 * - 'generations': Generation completions
 * - 'models': Model status changes
 *
 * @example
 * const { lastMessage, sendMessage, isConnected } = useWebSocket();
 *
 * useEffect(() => {
 *   if (lastMessage?.type === 'job_completed') {
 *     fetchGenerations();
 *   }
 * }, [lastMessage]);
 */

import { useEffect, useCallback, useRef } from 'react';
import useReactWebSocket from 'react-use-websocket';

// ReadyState constants (matching react-use-websocket v4)
const ReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
};

// Determine WebSocket URL based on environment
const getWebSocketUrl = () => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = import.meta.env.VITE_WS_URL || window.location.host;
  return `${protocol}//${host}/ws`;
};

const WS_URL = getWebSocketUrl();

// Supported channels
export const WS_CHANNELS = {
  QUEUE: 'queue',
  GENERATIONS: 'generations',
  MODELS: 'models',
};

// Default reconnect interval (ms)
const RECONNECT_INTERVAL = 3000;

/**
 * WebSocket Hook
 *
 * @param {Object} options - Hook options
 * @param {Array<string>} options.channels - Channels to subscribe to (default: all)
 * @param {Function} options.onMessage - Callback for incoming messages
 * @param {Function} options.onConnectionChange - Callback for connection state changes
 * @param {number} options.reconnectInterval - Reconnect interval in ms
 * @returns {Object} WebSocket API
 */
export function useWebSocket(options = {}) {
  const {
    channels: initialChannels = Object.values(WS_CHANNELS),
    onMessage,
    onConnectionChange,
    reconnectInterval = RECONNECT_INTERVAL,
  } = options;

  const subscribedChannels = useRef(new Set());

  const { sendJsonMessage, lastJsonMessage, readyState, getWebSocket } = useReactWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval,
    retryOnError: true,
  });

  // Subscribe to a channel
  const subscribe = useCallback((channel) => {
    if (subscribedChannels.current.has(channel)) {
      return;
    }
    sendJsonMessage({ type: 'subscribe', channel });
    subscribedChannels.current.add(channel);
  }, [sendJsonMessage]);

  // Unsubscribe from a channel
  const unsubscribe = useCallback((channel) => {
    if (!subscribedChannels.current.has(channel)) {
      return;
    }
    sendJsonMessage({ type: 'unsubscribe', channel });
    subscribedChannels.current.delete(channel);
  }, [sendJsonMessage]);

  // Send a message to the server
  const sendMessage = useCallback((payload) => {
    sendJsonMessage({ type: 'message', payload });
  }, [sendJsonMessage]);

  // Subscribe to initial channels on connect
  useEffect(() => {
    if (readyState === ReadyState.OPEN) {
      initialChannels.forEach((channel) => {
        subscribe(channel);
      });
    }
  }, [readyState, initialChannels, subscribe]);

  // Handle connection state changes
  useEffect(() => {
    const isConnected = readyState === ReadyState.OPEN;
    onConnectionChange?.(isConnected);
  }, [readyState, onConnectionChange]);

  // Handle incoming messages
  useEffect(() => {
    if (lastJsonMessage) {
      onMessage?.(lastJsonMessage);
    }
  }, [lastJsonMessage, onMessage]);

  // Cleanup on unmount - unsubscribe from all channels
  useEffect(() => {
    return () => {
      subscribedChannels.current.forEach((channel) => {
        unsubscribe(channel);
      });
    };
  }, [unsubscribe]);

  return {
    // Connection state
    isConnected: readyState === ReadyState.OPEN,
    isConnecting: readyState === ReadyState.CONNECTING,
    // Last message received
    lastMessage: lastJsonMessage,
    // Actions
    sendMessage,
    subscribe,
    unsubscribe,
    // Raw WebSocket instance (for advanced usage)
    getWebSocket,
  };
}

/**
 * specialized hook for queue updates
 *
 * @param {Function} onJobUpdate - Callback when job status changes
 * @returns {Object} Hook API
 */
export function useQueueUpdates(onJobUpdate) {
  const { isConnected, lastMessage, subscribe, unsubscribe } = useWebSocket({
    channels: [WS_CHANNELS.QUEUE],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.QUEUE && onJobUpdate) {
        onJobUpdate(message);
      }
    },
  });

  return {
    isConnected,
    lastMessage,
    subscribe,
    unsubscribe,
  };
}

/**
 * Specialized hook for generation updates
 *
 * @param {Function} onGenerationComplete - Callback when generation completes
 * @returns {Object} Hook API
 */
export function useGenerationUpdates(onGenerationComplete) {
  const { isConnected, lastMessage } = useWebSocket({
    channels: [WS_CHANNELS.GENERATIONS],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.GENERATIONS && onGenerationComplete) {
        onGenerationComplete(message);
      }
    },
  });

  return {
    isConnected,
    lastMessage,
  };
}

/**
 * Specialized hook for model status updates
 *
 * @param {Function} onModelStatusChange - Callback when model status changes
 * @returns {Object} Hook API
 */
export function useModelStatusUpdates(onModelStatusChange) {
  const { isConnected, lastMessage } = useWebSocket({
    channels: [WS_CHANNELS.MODELS],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.MODELS && onModelStatusChange) {
        onModelStatusChange(message);
      }
    },
  });

  return {
    isConnected,
    lastMessage,
  };
}

export default useWebSocket;
