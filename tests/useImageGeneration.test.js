import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useImageGeneration, useGenerations } from '../frontend/src/hooks/useImageGeneration.jsx';
import * as api from '../frontend/src/utils/api.js';

// Mock authenticatedFetch
const mockFetch = vi.fn();
vi.mock('../frontend/src/utils/api.js', () => ({
  authenticatedFetch: (...args) => mockFetch(...args),
}));

describe('useImageGeneration', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('generateQueued', () => {
    it('should send queued generation request', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123', status: 'pending' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'generate',
        prompt: 'A beautiful landscape',
        model: 'sd-cpp-local',
        n: 1,
        size: '512x512',
      };

      await act(async () => {
        const response = await result.current.generateQueued(params);
        expect(response).toEqual({ id: 'gen-123', status: 'pending' });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.result).toEqual({ id: 'gen-123', status: 'pending' });
    });

    it('should use correct endpoint for edit mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-edit-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Edit this image',
        image: new File([''], 'test.png', { type: 'image/png' }),
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/queue/edit',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use correct endpoint for variation mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-var-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Variation of image',
        image: new File([''], 'test.png', { type: 'image/png' }),
        model: 'sd-cpp-local',
        strength: 0.7,
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/queue/variation',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use default endpoint for generate mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'generate',
        prompt: 'Test prompt',
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/queue/generate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should include negative_prompt in FormData when provided', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Test',
        negative_prompt: 'blurry, low quality',
        image: new File([''], 'test.png'),
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('negative_prompt')).toBe('blurry, low quality');
    });

    it('should include strength parameter in variation mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        model: 'sd-cpp-local',
        strength: 0.5,
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('strength')).toBe('0.5');
    });

    it('should handle quality parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        quality: 'high',
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('quality')).toBe('high');
    });

    it('should handle style parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        style: 'vivid',
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('style')).toBe('vivid');
    });

    it('should handle seed parameter', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        seed: '12345',
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generateQueued(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('seed')).toBe('12345');
    });

    it('should set loading state during request', async () => {
      let resolveFetch;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      mockFetch.mockReturnValue(fetchPromise);

      const { result } = renderHook(() => useImageGeneration());

      act(() => {
        result.current.generateQueued({
          mode: 'generate',
          prompt: 'Test',
          model: 'sd-cpp-local',
        });
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ id: 'gen-123' }),
        });
        await fetchPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          try {
            await result.current.generateQueued({
              mode: 'generate',
              prompt: 'Test',
              model: 'sd-cpp-local',
            });
          } catch (error) {
            expect(error.message).toBe('Internal server error');
            throw error;
          }
        })
      ).rejects.toThrow('Internal server error');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle API errors with default message', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Unknown error' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          try {
            await result.current.generateQueued({
              mode: 'generate',
              prompt: 'Test',
              model: 'sd-cpp-local',
            });
          } catch (error) {
            throw error;
          }
        })
      ).rejects.toThrow();
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          await result.current.generateQueued({
            mode: 'generate',
            prompt: 'Test',
            model: 'sd-cpp-local',
          });
        })
      ).rejects.toThrow('Network error');

      // Error is set and then cleared in finally block
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle invalid JSON response', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('Invalid JSON');
        },
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          try {
            await result.current.generateQueued({
              mode: 'generate',
              prompt: 'Test',
              model: 'sd-cpp-local',
            });
          } catch (error) {
            expect(error.message).toBe('Unknown error');
            throw error;
          }
        })
      ).rejects.toThrow('Unknown error');
    });
  });

  describe('generate (synchronous)', () => {
    it('should send direct generation request', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-direct-123', status: 'completed' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'generate',
        prompt: 'A beautiful landscape',
        model: 'sd-cpp-local',
        n: 1,
        size: '512x512',
      };

      await act(async () => {
        const response = await result.current.generate(params);
        expect(response).toEqual({ id: 'gen-direct-123', status: 'completed' });
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
      expect(result.current.result).toEqual({ id: 'gen-direct-123', status: 'completed' });
    });

    it('should use correct endpoint for edit mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-edit-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'edit',
        prompt: 'Edit this image',
        image: new File([''], 'test.png', { type: 'image/png' }),
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generate(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/edit',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use correct endpoint for variation mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-var-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Variation of image',
        image: new File([''], 'test.png', { type: 'image/png' }),
        model: 'sd-cpp-local',
        strength: 0.7,
      };

      await act(async () => {
        await result.current.generate(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/variation',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should use correct endpoint for generate mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'generate',
        prompt: 'Test prompt',
        model: 'sd-cpp-local',
      };

      await act(async () => {
        await result.current.generate(params);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/generate',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should handle strength parameter in variation mode', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        model: 'sd-cpp-local',
        strength: 0.5,
      };

      await act(async () => {
        await result.current.generate(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('strength')).toBe('0.5');
    });

    it('should handle strength as 0', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        model: 'sd-cpp-local',
        strength: 0,
      };

      await act(async () => {
        await result.current.generate(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('strength')).toBe('0');
    });

    it('should not include strength when undefined', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ id: 'gen-123' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      const params = {
        mode: 'variation',
        prompt: 'Test',
        image: new File([''], 'test.png'),
        model: 'sd-cpp-local',
        strength: undefined,
      };

      await act(async () => {
        await result.current.generate(params);
      });

      const callArgs = mockFetch.mock.calls[0];
      const formData = callArgs[1].body;

      expect(formData.get('strength')).toBeNull();
    });

    it('should set loading state during request', async () => {
      let resolveFetch;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      mockFetch.mockReturnValue(fetchPromise);

      const { result } = renderHook(() => useImageGeneration());

      act(() => {
        result.current.generate({
          mode: 'generate',
          prompt: 'Test',
          model: 'sd-cpp-local',
        });
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ id: 'gen-123' }),
        });
        await fetchPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          try {
            await result.current.generate({
              mode: 'generate',
              prompt: 'Test',
              model: 'sd-cpp-local',
            });
          } catch (error) {
            expect(error.message).toBe('Internal server error');
            throw error;
          }
        })
      ).rejects.toThrow('Internal server error');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useImageGeneration());

      await expect(
        act(async () => {
          try {
            await result.current.generate({
              mode: 'generate',
              prompt: 'Test',
              model: 'sd-cpp-local',
            });
          } catch (error) {
            expect(error.message).toBe('Network error');
            throw error;
          }
        })
      ).rejects.toThrow('Network error');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('hook API', () => {
    it('should return correct API object', () => {
      const { result } = renderHook(() => useImageGeneration());

      expect(result.current).toEqual({
        generate: expect.any(Function),
        generateQueued: expect.any(Function),
        isLoading: false,
        error: null,
        result: null,
      });
    });
  });
});

describe('useGenerations', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('fetchGenerations', () => {
    it('should fetch generations with default page', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [{ id: 'gen-1' }, { id: 'gen-2' }],
          pagination: { total: 2, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        const data = await result.current.fetchGenerations();
        expect(data.generations).toHaveLength(2);
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.generations).toHaveLength(2);
      expect(result.current.currentPage).toBe(1);
    });

    it('should fetch generations with custom page', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [{ id: 'gen-3' }],
          pagination: { total: 3, limit: 20, offset: 40 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(3);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations?limit=20&offset=40');
      expect(result.current.currentPage).toBe(3);
    });

    it('should use custom pageSize from options', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 0, limit: 50, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations({ pageSize: 50 }));

      await act(async () => {
        await result.current.fetchGenerations();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations?limit=50&offset=0');
      expect(result.current.pagination.limit).toBe(50);
    });

    it('should calculate totalPages correctly', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 45, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations();
      });

      expect(result.current.pagination.totalPages).toBe(3); // Math.ceil(45 / 20)
    });

    it('should set loading state during request', async () => {
      let resolveFetch;
      const fetchPromise = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      mockFetch.mockReturnValue(fetchPromise);

      const { result } = renderHook(() => useGenerations());

      act(() => {
        result.current.fetchGenerations();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ generations: [], pagination: { total: 0, limit: 20, offset: 0 } }),
        });
        await fetchPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle API errors', async () => {
      const mockResponse = {
        ok: false,
        status: 500,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await expect(
        act(async () => {
          try {
            await result.current.fetchGenerations();
          } catch (error) {
            expect(error.message).toBe('HTTP 500');
            throw error;
          }
        })
      ).rejects.toThrow('HTTP 500');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useGenerations());

      await expect(
        act(async () => {
          try {
            await result.current.fetchGenerations();
          } catch (error) {
            expect(error.message).toBe('Network error');
            throw error;
          }
        })
      ).rejects.toThrow('Network error');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });
  });

  describe('goToPage', () => {
    it('should navigate to valid page', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 60, limit: 20, offset: 20 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      // First fetch to set up pagination
      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 60, limit: 20, offset: 20 },
        }),
      });

      await act(async () => {
        await result.current.goToPage(2);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations?limit=20&offset=20');
      expect(result.current.currentPage).toBe(2);
    });

    it('should not navigate to page < 1', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 20, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      const callCount = mockFetch.mock.calls.length;

      await act(async () => {
        result.current.goToPage(0);
      });

      expect(mockFetch.mock.calls.length).toBe(callCount); // No new call
    });

    it('should not navigate to page > totalPages', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 20, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      const callCount = mockFetch.mock.calls.length;

      await act(async () => {
        result.current.goToPage(10);
      });

      expect(mockFetch.mock.calls.length).toBe(callCount); // No new call
    });
  });

  describe('nextPage', () => {
    it('should go to next page when available', async () => {
      const mockResponse = (offset) => ({
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 60, limit: 20, offset },
        }),
      });

      mockFetch.mockResolvedValue(mockResponse(0));

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      mockFetch.mockResolvedValue(mockResponse(20));

      await act(async () => {
        await result.current.nextPage();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations?limit=20&offset=20');
      expect(result.current.currentPage).toBe(2);
    });

    it('should not go beyond last page', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 20, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      const callCount = mockFetch.mock.calls.length;

      await act(async () => {
        result.current.nextPage();
      });

      expect(mockFetch.mock.calls.length).toBe(callCount); // No new call
    });
  });

  describe('prevPage', () => {
    it('should go to previous page when available', async () => {
      const mockResponse = (offset) => ({
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 60, limit: 20, offset },
        }),
      });

      mockFetch.mockResolvedValue(mockResponse(20));

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(2);
      });

      mockFetch.mockResolvedValue(mockResponse(0));

      await act(async () => {
        await result.current.prevPage();
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations?limit=20&offset=0');
      expect(result.current.currentPage).toBe(1);
    });

    it('should not go before first page', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          generations: [],
          pagination: { total: 20, limit: 20, offset: 0 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await act(async () => {
        await result.current.fetchGenerations(1);
      });

      const callCount = mockFetch.mock.calls.length;

      await act(async () => {
        result.current.prevPage();
      });

      expect(mockFetch.mock.calls.length).toBe(callCount); // No new call
    });
  });

  describe('deleteGeneration', () => {
    it('should delete a generation', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({ success: true }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      // First set up some generations
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          generations: [
            { id: 'gen-1' },
            { id: 'gen-2' },
            { id: 'gen-3' },
          ],
          pagination: { total: 3, limit: 20, offset: 0 },
        }),
      });

      await act(async () => {
        await result.current.fetchGenerations();
      });

      expect(result.current.generations).toHaveLength(3);

      // Mock delete and refetch
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            generations: [
              { id: 'gen-1' },
              { id: 'gen-3' },
            ],
            pagination: { total: 2, limit: 20, offset: 0 },
          }),
        });

      await act(async () => {
        const success = await result.current.deleteGeneration('gen-2');
        expect(success).toBe(true);
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/generations/gen-2', {
        method: 'DELETE',
      });
    });

    it('should handle delete errors', async () => {
      const mockResponse = {
        ok: false,
        status: 404,
      };
      mockFetch.mockResolvedValue(mockResponse);

      const { result } = renderHook(() => useGenerations());

      await expect(
        act(async () => {
          try {
            await result.current.deleteGeneration('gen-1');
          } catch (error) {
            expect(error.message).toBe('HTTP 404');
            throw error;
          }
        })
      ).rejects.toThrow('HTTP 404');

      // Error state is set and cleared
      expect(result.current.isLoading).toBe(false);
    });

    it('should handle network errors during delete', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useGenerations());

      await expect(
        act(async () => {
          try {
            await result.current.deleteGeneration('gen-1');
          } catch (error) {
            expect(error.message).toBe('Network error');
            throw error;
          }
        })
      ).rejects.toThrow('Network error');
    });
  });

  describe('hook API', () => {
    it('should return correct API object', () => {
      const { result } = renderHook(() => useGenerations());

      expect(result.current).toEqual({
        fetchGenerations: expect.any(Function),
        goToPage: expect.any(Function),
        nextPage: expect.any(Function),
        prevPage: expect.any(Function),
        deleteGeneration: expect.any(Function),
        isLoading: false,
        error: null,
        generations: [],
        pagination: expect.objectContaining({
          total: 0,
          limit: 20,
          offset: 0,
          hasMore: false,
          totalPages: 0,
        }),
        currentPage: 1,
      });
    });

    it('should return correct API object with custom pageSize', () => {
      const { result } = renderHook(() => useGenerations({ pageSize: 50 }));

      expect(result.current.pagination.limit).toBe(50);
    });
  });
});
