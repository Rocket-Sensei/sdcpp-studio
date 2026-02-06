import { useState, useEffect, useCallback, useMemo } from "react";
import { authenticatedFetch } from "../utils/api";

/**
 * Shared hook for fetching and caching models data.
 * This prevents multiple components from making duplicate API requests.
 *
 * @returns {Object} { models: Array, isLoading: boolean, error: Error|null, refetch: function, modelsMap: Object, modelsNameMap: Object }
 */
let cachedModels = null;
let cacheTimestamp = null;
const CACHE_TTL = 30000; // 30 seconds

export function useModels() {
  const [models, setModels] = useState(cachedModels || []);
  const [isLoading, setIsLoading] = useState(!cachedModels);
  const [error, setError] = useState(null);

  const fetchModels = useCallback(async (forceRefresh = false) => {
    // Check cache
    const now = Date.now();
    if (!forceRefresh && cachedModels && cacheTimestamp && (now - cacheTimestamp) < CACHE_TTL) {
      setModels(cachedModels);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await authenticatedFetch("/api/models");
      if (response.ok) {
        const data = await response.json();
        const modelsList = data.models || [];

        // Update cache
        cachedModels = modelsList;
        cacheTimestamp = now;

        setModels(modelsList);
      } else {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
    } catch (err) {
      console.error("Failed to fetch models:", err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!cachedModels) {
      fetchModels();
    }
  }, [fetchModels]);

  // Create models map for easy lookup (memoized)
  const modelsMap = useMemo(() => {
    const map = {};
    models.forEach((model) => {
      map[model.id] = model;
    });
    return map;
  }, [models]);

  // Create ID to name map (memoized)
  const modelsNameMap = useMemo(() => {
    const map = {};
    models.forEach((model) => {
      map[model.id] = model.name || model.id;
    });
    return map;
  }, [models]);

  return {
    models,
    isLoading,
    error,
    refetch: () => fetchModels(true),
    modelsMap,
    modelsNameMap,
  };
}

export default useModels;
