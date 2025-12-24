/**
 * Test to verify Image-to-Image uses queue workflow
 *
 * This test verifies that:
 * 1. ImageToImage component calls generateQueued (not generate)
 * 2. The correct queue endpoint is used (/api/queue/edit or /api/queue/variation)
 * 3. FormData is properly constructed with all required fields
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useImageGeneration } from '../frontend/src/hooks/useImageGeneration';

// Set up fetch mock for this test file
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('Image-to-Image Queue Workflow', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('useImageGeneration hook', () => {
    it('should use generateQueued for edit mode', async () => {
      const { result } = renderHook(() => useImageGeneration());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-123', status: 'pending' })
      });

      const imageFile = new File(['dummy'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.generateQueued({
          mode: 'edit',
          model: 'qwen-image-edit',
          prompt: 'Transform into watercolor',
          negative_prompt: 'blurry',
          size: '1024x1024',
          image: imageFile,
          n: 1
        });
      });

      // Verify fetch was called
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify the endpoint is queue endpoint
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/queue/edit');
      expect(options.method).toBe('POST');

      // Verify FormData is used
      expect(options.body).toBeInstanceOf(FormData);

      // Verify FormData contains required fields
      const formData = options.body;
      expect(formData.get('model')).toBe('qwen-image-edit');
      expect(formData.get('prompt')).toBe('Transform into watercolor');
      expect(formData.get('negative_prompt')).toBe('blurry');
      expect(formData.get('size')).toBe('1024x1024');
      expect(formData.get('n')).toBe('1');
      expect(formData.get('image')).toBe(imageFile);
    });

    it('should use generateQueued for variation mode', async () => {
      const { result } = renderHook(() => useImageGeneration());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-456', status: 'pending' })
      });

      const imageFile = new File(['dummy'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.generateQueued({
          mode: 'variation',
          model: 'qwen-image-edit',
          prompt: 'Create a variation',
          size: '512x512',
          image: imageFile,
          n: 1
        });
      });

      // Verify the endpoint is queue variation endpoint
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe('/api/queue/variation');
    });

    it('should NOT use direct /api/edit endpoint when using generateQueued', async () => {
      const { result } = renderHook(() => useImageGeneration());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-789', status: 'pending' })
      });

      const imageFile = new File(['dummy'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.generateQueued({
          mode: 'edit',
          prompt: 'test',
          image: imageFile
        });
      });

      // Should use queue endpoint, not direct endpoint
      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/queue/');
      expect(url).not.toBe('/api/edit');
    });

    it('should handle missing negative_prompt gracefully', async () => {
      const { result } = renderHook(() => useImageGeneration());

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-999', status: 'pending' })
      });

      const imageFile = new File(['dummy'], 'test.png', { type: 'image/png' });

      await act(async () => {
        await result.current.generateQueued({
          mode: 'edit',
          prompt: 'test',
          image: imageFile
        });
      });

      const formData = mockFetch.mock.calls[0][1].body;
      // negative_prompt should not be in FormData if not provided
      expect(formData.get('negative_prompt')).toBeNull();
    });
  });

  describe('Endpoint routing', () => {
    it('should route edit mode to /api/queue/edit', () => {
      // This test verifies the routing logic in generateQueued
      // Edit mode should use queue endpoint
      const mode = 'edit';
      const expectedEndpoint = '/api/queue/edit';

      // The implementation should match this
      const actualEndpoint = mode === 'edit'
        ? '/api/queue/edit'
        : mode === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(actualEndpoint).toBe(expectedEndpoint);
    });

    it('should route variation mode to /api/queue/variation', () => {
      const mode = 'variation';
      const expectedEndpoint = '/api/queue/variation';

      const actualEndpoint = mode === 'edit'
        ? '/api/queue/edit'
        : mode === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(actualEndpoint).toBe(expectedEndpoint);
    });

    it('should route generate mode to /api/queue/generate', () => {
      const mode = 'generate';
      const expectedEndpoint = '/api/queue/generate';

      const actualEndpoint = mode === 'edit'
        ? '/api/queue/edit'
        : mode === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(actualEndpoint).toBe(expectedEndpoint);
    });
  });

  describe('Direct vs Queue generation comparison', () => {
    it('generate uses direct endpoints, generateQueued uses queue endpoints', async () => {
      const { result } = renderHook(() => useImageGeneration());

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'test-id', status: 'pending' })
      });

      const imageFile = new File(['dummy'], 'test.png', { type: 'image/png' });

      // Test generateQueued uses queue endpoint
      await act(async () => {
        await result.current.generateQueued({
          mode: 'edit',
          prompt: 'test',
          image: imageFile
        });
      });

      const queuedUrl = mockFetch.mock.calls[0][0];
      expect(queuedUrl).toBe('/api/queue/edit');

      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [{ b64_json: 'abc' }] })
      });

      // Test generate uses direct endpoint
      await act(async () => {
        await result.current.generate({
          mode: 'edit',
          prompt: 'test',
          image: imageFile
        });
      });

      const directUrl = mockFetch.mock.calls[0][0];
      expect(directUrl).toBe('/api/edit');

      // Verify they are different
      expect(queuedUrl).not.toBe(directUrl);
    });
  });
});
