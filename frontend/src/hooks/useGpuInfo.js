import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { authenticatedFetch } from '../utils/api';
import { useWebSocket, WS_CHANNELS } from '../contexts/WebSocketContext';

const GPU_CHANNELS = ['gpu'];

export function useGpuInfo(pollIntervalMs = 2000) {
  const [gpuInfo, setGpuInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const initialFetchDone = useRef(false);

  const handleGpuMessage = useCallback((message) => {
    if (message.channel === 'gpu' && message.type === 'gpu_info' && message.data) {
      setGpuInfo(message.data);
      setError(null);
      setLoading(false);
    }
  }, []);

  const wsOptions = useMemo(() => ({
    channels: GPU_CHANNELS,
    onMessage: handleGpuMessage,
  }), [handleGpuMessage]);

  useWebSocket(wsOptions);

  useEffect(() => {
    if (initialFetchDone.current) {
      return;
    }

    async function fetchInitialGpuInfo() {
      try {
        const response = await authenticatedFetch('/api/gpu-info');
        if (!response.ok) throw new Error('Failed to fetch GPU info');
        const data = await response.json();
        if (!initialFetchDone.current) {
          setGpuInfo(data);
          setError(null);
          setLoading(false);
          initialFetchDone.current = true;
        }
      } catch (err) {
        if (!initialFetchDone.current) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchInitialGpuInfo();

    return () => {
      initialFetchDone.current = true;
    };
  }, []);

  return { gpuInfo, loading, error };
}
