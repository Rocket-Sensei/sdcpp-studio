import { useState, useEffect } from 'react';
import { authenticatedFetch } from '../utils/api';

const DEFAULT_POLL_INTERVAL_MS = 2000;

/**
 * Hook to fetch and cache GPU information
 */
export function useGpuInfo(pollIntervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const [gpuInfo, setGpuInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchGpuInfo() {
      try {
        const response = await authenticatedFetch('/api/gpu-info');
        if (!response.ok) throw new Error('Failed to fetch GPU info');
        const data = await response.json();
        if (!cancelled) {
          setGpuInfo(data);
          setError(null);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setLoading(false);
        }
      }
    }

    fetchGpuInfo();
    const intervalId = setInterval(fetchGpuInfo, pollIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, [pollIntervalMs]);

  return { gpuInfo, loading, error };
}
