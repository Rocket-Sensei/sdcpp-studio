import { useState, useCallback } from "react";

export function useImageGeneration() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  // Add job to queue (async)
  const generateQueued = useCallback(async (params) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = params.mode === 'edit'
        ? '/api/queue/edit'
        : params.mode === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      let body;
      let headers = {};

      if ((params.mode === 'edit' || params.mode === 'variation') && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);
        formData.append('model', params.model);
        formData.append('prompt', params.prompt);
        formData.append('n', params.n || 1);
        formData.append('size', params.size || '512x512');
        if (params.negative_prompt) {
          formData.append('negative_prompt', params.negative_prompt);
        }
        if (params.quality) formData.append('quality', params.quality);
        if (params.style) formData.append('style', params.style);
        if (params.seed) formData.append('seed', params.seed);

        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Synchronous generation (direct, not queued)
  const generate = useCallback(async (params) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const endpoint = params.mode === 'edit'
        ? '/api/edit'
        : params.mode === 'variation'
        ? '/api/variation'
        : '/api/generate';

      let body;
      let headers = {};

      if ((params.mode === 'edit' || params.mode === 'variation') && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);
        formData.append('model', params.model);
        formData.append('prompt', params.prompt);
        formData.append('n', params.n || 1);
        formData.append('size', params.size || '512x512');
        if (params.negative_prompt) {
          formData.append('negative_prompt', params.negative_prompt);
        }
        if (params.quality) formData.append('quality', params.quality);
        if (params.style) formData.append('style', params.style);
        if (params.seed) formData.append('seed', params.seed);

        body = formData;
        // Don't set Content-Type, let browser set it with boundary
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setResult(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { generate, generateQueued, isLoading, error, result };
}

export function useGenerations() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generations, setGenerations] = useState([]);

  const fetchGenerations = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/generations');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();
      setGenerations(data);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const deleteGeneration = useCallback(async (id) => {
    try {
      const response = await fetch(`/api/generations/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  return { fetchGenerations, deleteGeneration, isLoading, error, generations };
}
