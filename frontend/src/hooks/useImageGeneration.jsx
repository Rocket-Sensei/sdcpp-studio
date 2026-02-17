import { useState, useCallback } from "react";
import { authenticatedFetch } from "../utils/api";

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
        : params.mode === 'upscale'
        ? '/api/queue/upscale'
        : '/api/queue/generate';

      let body;
      let headers = {};

      if ((params.mode === 'edit' || params.mode === 'variation' || params.mode === 'upscale') && params.image) {
        const formData = new FormData();
        formData.append('image', params.image);

        // Upscale mode has different parameters
        if (params.mode === 'upscale') {
          formData.append('upscaler', params.upscaler || 'RealESRGAN 4x+');
          formData.append('resize_mode', String(params.resize_mode || 0));
          formData.append('upscale_factor', String(params.upscale_factor || 2.0));
          if (params.target_width) formData.append('target_width', String(params.target_width));
          if (params.target_height) formData.append('target_height', String(params.target_height));
        } else {
          // Edit and variation modes
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
          // Add strength parameter for variation mode (img2img)
          if (params.mode === 'variation' && params.strength !== undefined) {
            formData.append('strength', String(params.strength));
          }
        }

        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await authenticatedFetch(endpoint, {
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
        // Add strength parameter for variation mode (img2img)
        if (params.mode === 'variation' && params.strength !== undefined) {
          formData.append('strength', String(params.strength));
        }

        body = formData;
        // Don't set Content-Type, let browser set it with boundary
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(params);
      }

      const response = await authenticatedFetch(endpoint, {
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

export function useGenerations(options = {}) {
  const { pageSize = 20 } = options;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generations, setGenerations] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: 0,
    limit: pageSize,
    offset: 0,
    hasMore: false,
    totalPages: 0
  });

  const fetchGenerations = useCallback(async (page = 1) => {
    setIsLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * pageSize;
      const url = `/api/generations?limit=${pageSize}&offset=${offset}`;
      const response = await authenticatedFetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = await response.json();

      setGenerations(data.generations);
      setCurrentPage(page);
      setPagination({
        ...data.pagination,
        totalPages: Math.ceil(data.pagination.total / pageSize)
      });
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  const goToPage = useCallback((page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      fetchGenerations(page);
    }
  }, [fetchGenerations, pagination.totalPages]);

  const nextPage = useCallback(() => {
    if (currentPage < pagination.totalPages) {
      goToPage(currentPage + 1);
    }
  }, [currentPage, pagination.totalPages, goToPage]);

  const prevPage = useCallback(() => {
    if (currentPage > 1) {
      goToPage(currentPage - 1);
    }
  }, [currentPage, goToPage]);

  const deleteGeneration = useCallback(async (id) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      setGenerations((prev) => prev.filter((g) => g.id !== id));
      setPagination((prev) => ({ ...prev, total: prev.total - 1 }));
      // Refresh current page after deletion
      fetchGenerations(currentPage);
      return true;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [currentPage, fetchGenerations]);

  return {
    fetchGenerations,
    goToPage,
    nextPage,
    prevPage,
    deleteGeneration,
    isLoading,
    error,
    generations,
    pagination,
    currentPage
  };
}
