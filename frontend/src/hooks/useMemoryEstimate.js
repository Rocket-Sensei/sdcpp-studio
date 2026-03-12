import { useState, useEffect, useCallback } from 'react';
import { authenticatedFetch } from '../utils/api';

/**
 * Hook to fetch memory estimates for a model + settings
 */
export function useMemoryEstimate(modelId, width, height, flags) {
  const [estimate, setEstimate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchEstimate = useCallback(async () => {
    if (!modelId) {
      setEstimate(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        modelId,
        width: String(width || 1024),
        height: String(height || 1024),
      });

      if (flags) {
        if (flags.offloadToCpu !== undefined) params.set('offloadToCpu', flags.offloadToCpu ? '1' : '0');
        if (flags.clipOnCpu !== undefined) params.set('clipOnCpu', flags.clipOnCpu ? '1' : '0');
        if (flags.vaeOnCpu !== undefined) params.set('vaeOnCpu', flags.vaeOnCpu ? '1' : '0');
        if (flags.vaeTiling !== undefined) params.set('vaeTiling', flags.vaeTiling ? '1' : '0');
        if (flags.diffusionFa !== undefined) params.set('diffusionFa', flags.diffusionFa ? '1' : '0');
      }

      const response = await authenticatedFetch(`/api/memory/estimate?${params}`);
      if (!response.ok) throw new Error('Failed to fetch memory estimate');
      const data = await response.json();
      setEstimate(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [modelId, width, height, flags?.offloadToCpu, flags?.clipOnCpu, flags?.vaeOnCpu, flags?.vaeTiling, flags?.diffusionFa]);

  // Debounce the fetch
  useEffect(() => {
    const timer = setTimeout(fetchEstimate, 300);
    return () => clearTimeout(timer);
  }, [fetchEstimate]);

  return { estimate, loading, error, refetch: fetchEstimate };
}
