/**
 * Global WebSocket Context
 *
 * Provides a single WebSocket connection for the entire application.
 * Multiple components can subscribe to different channels without creating new connections.
 */

import { createContext, useContext, useEffect, useCallback, useRef, useState } from 'react';
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
  GPU: 'gpu',
  TERMINAL: 'terminal',
};

// Default reconnect interval (ms)
const RECONNECT_INTERVAL = 3000;

// Create the WebSocket context
const WebSocketContext = createContext(null);

/**
 * Global WebSocket Provider
 *
 * Wraps the application and provides a single WebSocket connection
 * that can be shared across all components.
 */
export function WebSocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const listenersRef = useRef(new Map()); // channel -> Set of callbacks
  const connectionListenersRef = useRef(new Set()); // Connection state callbacks
  const mountId = useRef(Date.now()); // Track mount instances for debugging

  const { sendJsonMessage, lastJsonMessage, readyState, getWebSocket } = useReactWebSocket(WS_URL, {
    shouldReconnect: () => true,
    reconnectInterval: RECONNECT_INTERVAL,
    retryOnError: true,
  });

  // Log provider mount/remount for debugging
  useEffect(() => {
    console.log('[WS] WebSocketProvider mounted, mountId:', mountId.current);
    return () => {
      console.log('[WS] WebSocketProvider unmounted, mountId:', mountId.current);
    };
  }, []);

  // Track connection state
  useEffect(() => {
    const connected = readyState === ReadyState.OPEN;
    const connecting = readyState === ReadyState.CONNECTING;

    setIsConnected(connected);
    setIsConnecting(connecting);

    // Only log disconnection and connecting states (not connected, to reduce noise)
    if (!connected && !connecting) {
      console.log('[WS] Disconnected');
    } else if (connecting) {
      console.log('[WS] Connecting...');
    }

    // Notify connection state listeners
    connectionListenersRef.current.forEach((callback) => {
      callback(connected);
    });
  }, [readyState]);

  // Handle incoming messages
  useEffect(() => {
    if (lastJsonMessage) {
      const { channel, type } = lastJsonMessage;

      // Skip logging for 'subscribed' and 'connected' messages (too noisy)
      if (type !== 'subscribed' && type !== 'connected') {
        console.log('[WS] Received:', lastJsonMessage);
      }

      // Notify all listeners for this channel
      const channelListeners = listenersRef.current.get(channel);
      if (channelListeners) {
        channelListeners.forEach((callback) => {
          callback(lastJsonMessage);
        });
      }

      // Also notify global listeners (channel = null)
      const globalListeners = listenersRef.current.get(null);
      if (globalListeners) {
        globalListeners.forEach((callback) => {
          callback(lastJsonMessage);
        });
      }
    }
  }, [lastJsonMessage]);

  // Subscribe to a channel
  const subscribe = useCallback((channel, callback) => {
    // Add callback to listeners
    const isFirstSubscriber = !listenersRef.current.has(channel);
    if (isFirstSubscriber) {
      listenersRef.current.set(channel, new Set());
    }
    listenersRef.current.get(channel).add(callback);

    // Send subscription message to server only if we're the first subscriber
    if (isFirstSubscriber) {
      console.log('[WS] Subscribing to channel:', channel);
      sendJsonMessage({ type: 'subscribe', channel });
    }

    // Return unsubscribe function
    return () => {
      const channelListeners = listenersRef.current.get(channel);
      if (channelListeners) {
        channelListeners.delete(callback);
        if (channelListeners.size === 0) {
          console.log('[WS] Unsubscribing from channel:', channel);
          listenersRef.current.delete(channel);
          sendJsonMessage({ type: 'unsubscribe', channel });
        }
      }
    };
  }, [sendJsonMessage]);

  // Subscribe to connection state changes
  const onConnectionChange = useCallback((callback) => {
    connectionListenersRef.current.add(callback);

    // Return unsubscribe function
    return () => {
      connectionListenersRef.current.delete(callback);
    };
  }, []);

  // Send a message to the server
  const sendMessage = useCallback((payload) => {
    sendJsonMessage({ type: 'message', payload });
  }, [sendJsonMessage]);

  const value = {
    isConnected,
    isConnecting,
    subscribe,
    onConnectionChange,
    sendMessage,
    getWebSocket,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

/**
 * Hook to use the global WebSocket connection
 *
 * @param {Object} options - Hook options
 * @param {Array<string>} options.channels - Channels to subscribe to (default: none)
 * @param {Function} options.onMessage - Callback for incoming messages
 * @param {Function} options.onConnectionChange - Callback for connection state changes
 * @returns {Object} WebSocket API
 */
export function useWebSocket(options = {}) {
  const context = useContext(WebSocketContext);

  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }

  const { isConnected, isConnecting, subscribe, onConnectionChange, sendMessage, getWebSocket } = context;
  const { channels: initialChannels = [], onMessage, onConnectionChange: userConnectionCallback } = options;

  // Use a ref for the message callback to avoid re-subscribing when the callback changes
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Serialize channels to a string for stable dependency comparison
  const channelsKey = initialChannels.join(',');

  // Subscribe to channels
  useEffect(() => {
    const channels = channelsKey ? channelsKey.split(',') : [];
    const unsubscribers = [];

    const stableCallback = (message) => {
      if (onMessageRef.current) {
        onMessageRef.current(message);
      }
    };

    channels.forEach((channel) => {
      const unsubscribe = subscribe(channel, stableCallback);
      unsubscribers.push(unsubscribe);
    });

    // If no channels but onMessage is provided, listen to all messages
    if (channels.length === 0 && onMessageRef.current) {
      const unsubscribe = subscribe(null, stableCallback);
      unsubscribers.push(unsubscribe);
    }

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [subscribe, channelsKey]);

  // Subscribe to connection state changes
  const connectionCallbackRef = useRef(userConnectionCallback);
  connectionCallbackRef.current = userConnectionCallback;

  useEffect(() => {
    if (!connectionCallbackRef.current) return;

    const stableCallback = (connected) => {
      if (connectionCallbackRef.current) {
        connectionCallbackRef.current(connected);
      }
    };

    const unsubscribe = onConnectionChange(stableCallback);
    return unsubscribe;
  }, [onConnectionChange]);

  return {
    isConnected,
    isConnecting,
    sendMessage,
    subscribe,
    getWebSocket,
  };
}

/**
 * Specialized hook for queue updates
 *
 * @param {Function} onJobUpdate - Callback when job status changes
 * @returns {Object} Hook API
 */
export function useQueueUpdates(onJobUpdate) {
  return useWebSocket({
    channels: [WS_CHANNELS.QUEUE],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.QUEUE && onJobUpdate) {
        onJobUpdate(message);
      }
    },
  });
}

/**
 * Specialized hook for generation updates
 *
 * @param {Function} onGenerationComplete - Callback when generation completes
 * @returns {Object} Hook API
 */
export function useGenerationUpdates(onGenerationComplete) {
  return useWebSocket({
    channels: [WS_CHANNELS.GENERATIONS],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.GENERATIONS && onGenerationComplete) {
        onGenerationComplete(message);
      }
    },
  });
}

/**
 * Specialized hook for model status updates
 *
 * @param {Function} onModelStatusChange - Callback when model status changes
 * @returns {Object} Hook API
 */
export function useModelStatusUpdates(onModelStatusChange) {
  return useWebSocket({
    channels: [WS_CHANNELS.MODELS],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.MODELS && onModelStatusChange) {
        onModelStatusChange(message);
      }
    },
  });
}

/**
 * Specialized hook for terminal log updates
 *
 * @param {Function} onLog - Callback when terminal log received (receives the log data object)
 * @returns {Object} Hook API
 */
export function useTerminalLogs(onLog) {
  return useWebSocket({
    channels: [WS_CHANNELS.TERMINAL],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.TERMINAL && message.type === 'log' && onLog) {
        onLog(message.data);
      }
    },
  });
}

export default WebSocketContext;
