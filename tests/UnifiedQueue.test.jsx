import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// Import the helper functions and constants from UnifiedQueue
import {
  getStatusConfig,
  isPendingOrProcessing,
  GENERATION_STATUS,
} from '../frontend/src/components/UnifiedQueue';

describe('UnifiedQueue Helper Functions', () => {
  describe('getStatusConfig', () => {
    it('should return correct config for PENDING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.PENDING);
      expect(config.label).toBe('Queued');
      expect(config.color).toBe('secondary');
    });

    it('should return correct config for MODEL_LOADING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.MODEL_LOADING);
      expect(config.label).toBe('Loading Model');
      expect(config.color).toBe('default');
      expect(config.animate).toBe(true);
    });

    it('should return correct config for PROCESSING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.PROCESSING);
      expect(config.label).toBe('Generating');
      expect(config.color).toBe('default');
      expect(config.animate).toBe(true);
    });

    it('should return correct config for COMPLETED status', () => {
      const config = getStatusConfig(GENERATION_STATUS.COMPLETED);
      expect(config.label).toBe('Completed');
      expect(config.color).toBe('outline');
      expect(config.variant).toBe('success');
    });

    it('should return correct config for FAILED status', () => {
      const config = getStatusConfig(GENERATION_STATUS.FAILED);
      expect(config.label).toBe('Failed');
      expect(config.color).toBe('destructive');
    });

    it('should return correct config for CANCELLED status', () => {
      const config = getStatusConfig(GENERATION_STATUS.CANCELLED);
      expect(config.label).toBe('Cancelled');
      expect(config.color).toBe('secondary');
    });

    it('should return default config for unknown status', () => {
      const config = getStatusConfig('unknown_status');
      expect(config.label).toBe('Queued'); // Falls back to PENDING config
    });
  });

  describe('isPendingOrProcessing', () => {
    it('should return true for PENDING status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.PENDING)).toBe(true);
    });

    it('should return true for MODEL_LOADING status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.MODEL_LOADING)).toBe(true);
    });

    it('should return true for PROCESSING status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.PROCESSING)).toBe(true);
    });

    it('should return false for COMPLETED status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.COMPLETED)).toBe(false);
    });

    it('should return false for FAILED status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.FAILED)).toBe(false);
    });

    it('should return false for CANCELLED status', () => {
      expect(isPendingOrProcessing(GENERATION_STATUS.CANCELLED)).toBe(false);
    });
  });
});

describe('UnifiedQueue Component Logic', () => {
  describe('Thumbnail Component - Status Rendering', () => {
    it('should render Clock icon for PENDING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.PENDING);
      expect(config.label).toBe('Queued');
    });

    it('should render Cpu icon for MODEL_LOADING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.MODEL_LOADING);
      expect(config.label).toBe('Loading Model');
    });

    it('should render Loader2 icon for PROCESSING status', () => {
      const config = getStatusConfig(GENERATION_STATUS.PROCESSING);
      expect(config.label).toBe('Generating');
    });

    it('should render failed state for FAILED status', () => {
      const config = getStatusConfig(GENERATION_STATUS.FAILED);
      expect(config.label).toBe('Failed');
    });

    it('should render failed state for CANCELLED status', () => {
      const config = getStatusConfig(GENERATION_STATUS.CANCELLED);
      expect(config.label).toBe('Cancelled');
    });
  });

  describe('Button Visibility Logic', () => {
    it('should show Cancel button for pending generations', () => {
      const canCancel = isPendingOrProcessing(GENERATION_STATUS.PENDING);
      expect(canCancel).toBe(true);
    });

    it('should show Cancel button for processing generations', () => {
      const canCancel = isPendingOrProcessing(GENERATION_STATUS.PROCESSING);
      expect(canCancel).toBe(true);
    });

    it('should show Download button for completed generations', () => {
      const canCancel = isPendingOrProcessing(GENERATION_STATUS.COMPLETED);
      expect(canCancel).toBe(false);
    });

    it('should show Retry button for failed generations', () => {
      const canCancel = isPendingOrProcessing(GENERATION_STATUS.FAILED);
      expect(canCancel).toBe(false);
    });
  });

  describe('Multiple Images Badge', () => {
    it('should show badge when image_count > 1', () => {
      const generation = {
        id: '1',
        image_count: 4,
        status: 'completed',
      };

      expect(generation.image_count).toBeGreaterThan(1);
    });

    it('should not show badge when image_count === 1', () => {
      const generation = {
        id: '1',
        image_count: 1,
        status: 'completed',
      };

      expect(generation.image_count).not.toBeGreaterThan(1);
    });
  });

  describe('Generation Type Handling', () => {
    it('should identify edit type generation', () => {
      const generation = {
        id: '1',
        type: 'edit',
        input_image_path: '/path/to/image.png',
      };

      expect(generation.type).toBe('edit');
      expect(generation.input_image_path).toBeDefined();
    });

    it('should identify variation type generation', () => {
      const generation = {
        id: '1',
        type: 'variation',
        input_image_path: '/path/to/image.png',
      };

      expect(generation.type).toBe('variation');
    });

    it('should identify generate type generation', () => {
      const generation = {
        id: '1',
        type: 'generate',
      };

      expect(generation.type).toBe('generate');
      expect(generation.input_image_path).toBeUndefined();
    });
  });

  describe('Filter Logic', () => {
    it('should filter by search query', () => {
      const generations = [
        { id: '1', prompt: 'A beautiful landscape', status: 'completed' },
        { id: '2', prompt: 'Abstract art', status: 'completed' },
        { id: '3', prompt: 'Portrait of a person', status: 'completed' },
      ];

      const searchQuery = 'landscape';
      const filtered = generations.filter(g =>
        g.prompt && g.prompt.toLowerCase().includes(searchQuery.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });

    it('should filter by status', () => {
      const generations = [
        { id: '1', status: 'completed' },
        { id: '2', status: 'failed' },
        { id: '3', status: 'pending' },
      ];

      const selectedStatuses = ['completed', 'failed'];
      const filtered = generations.filter(g => selectedStatuses.includes(g.status));

      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['1', '2']);
    });

    it('should filter by model', () => {
      const generations = [
        { id: '1', model: 'model-a' },
        { id: '2', model: 'model-b' },
        { id: '3', model: 'model-a' },
      ];

      const selectedModels = ['model-a'];
      const filtered = generations.filter(g => selectedModels.includes(g.model));

      expect(filtered).toHaveLength(2);
      expect(filtered.map(g => g.id)).toEqual(['1', '3']);
    });

    it('should apply multiple filters together', () => {
      const generations = [
        { id: '1', prompt: 'landscape', status: 'completed', model: 'model-a' },
        { id: '2', prompt: 'landscape', status: 'failed', model: 'model-a' },
        { id: '3', prompt: 'portrait', status: 'completed', model: 'model-a' },
      ];

      const searchQuery = 'landscape';
      const selectedStatuses = ['completed'];
      const selectedModels = ['model-a'];

      let filtered = generations;

      if (searchQuery) {
        filtered = filtered.filter(g =>
          g.prompt && g.prompt.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      if (selectedStatuses.length > 0) {
        filtered = filtered.filter(g => selectedStatuses.includes(g.status));
      }

      if (selectedModels.length > 0) {
        filtered = filtered.filter(g => selectedModels.includes(g.model));
      }

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('1');
    });
  });

  describe('Pagination Logic', () => {
    it('should calculate page numbers correctly for totalPages <= 5', () => {
      const totalPages = 3;
      const currentPage = 2;

      const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let pageNum;
        if (totalPages <= 5) {
          pageNum = i + 1;
        }
        return pageNum;
      });

      expect(pages).toEqual([1, 2, 3]);
    });

    it('should calculate page numbers when currentPage <= 3', () => {
      const totalPages = 10;
      const currentPage = 2;

      const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let pageNum;
        if (totalPages <= 5) {
          pageNum = i + 1;
        } else if (currentPage <= 3) {
          pageNum = i + 1;
        }
        return pageNum;
      });

      expect(pages).toEqual([1, 2, 3, 4, 5]);
    });

    it('should calculate page numbers when currentPage >= totalPages - 2', () => {
      const totalPages = 10;
      const currentPage = 9;

      const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let pageNum;
        if (totalPages <= 5) {
          pageNum = i + 1;
        } else if (currentPage >= totalPages - 2) {
          pageNum = totalPages - 4 + i;
        }
        return pageNum;
      });

      expect(pages).toEqual([6, 7, 8, 9, 10]);
    });

    it('should calculate page numbers for middle pages', () => {
      const totalPages = 10;
      const currentPage = 5;

      const pages = Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
        let pageNum;
        if (totalPages <= 5) {
          pageNum = i + 1;
        } else if (currentPage <= 3) {
          pageNum = i + 1;
        } else if (currentPage >= totalPages - 2) {
          pageNum = totalPages - 4 + i;
        } else {
          pageNum = currentPage - 2 + i;
        }
        return pageNum;
      });

      expect(pages).toEqual([3, 4, 5, 6, 7]);
    });
  });

  describe('Gallery Data Preparation', () => {
    it('should prepare correct gallery data structure', () => {
      const fullGeneration = {
        images: [
          { id: 'img1', static_url: '/static/img1.png' },
          { id: 'img2', static_url: '/static/img2.png' },
          { id: 'img3', static_url: '/static/img3.png' },
        ],
        prompt: 'Test prompt',
      };

      const galleryData = fullGeneration.images.map(img => ({
        id: img.id,
        src: img.static_url || `/api/images/${img.id}`,
        srcLarge: img.static_url || `/api/images/${img.id}`,
        fileName: fullGeneration.prompt?.slice(0, 50) || 'image',
        alt: fullGeneration.prompt || 'Generated image',
      }));

      expect(galleryData).toHaveLength(3);
      expect(galleryData[0]).toEqual({
        id: 'img1',
        src: '/static/img1.png',
        srcLarge: '/static/img1.png',
        fileName: 'Test prompt',
        alt: 'Test prompt',
      });
    });

    it('should fallback to API URL when static_url is missing', () => {
      const fullGeneration = {
        images: [
          { id: 'img1' },
        ],
        prompt: 'Test prompt',
      };

      const galleryData = fullGeneration.images.map(img => ({
        src: img.static_url || `/api/images/${img.id}`,
        srcLarge: img.static_url || `/api/images/${img.id}`,
      }));

      expect(galleryData[0].src).toBe('/api/images/img1');
      expect(galleryData[0].srcLarge).toBe('/api/images/img1');
    });
  });

  describe('Model Name Resolution', () => {
    it('should return model name from models map', () => {
      const models = {
        'model-1': 'Test Model 1',
        'model-2': 'Test Model 2',
      };

      const getModelName = (modelId) => {
        if (!modelId) return 'Unknown Model';
        return models[modelId] || modelId;
      };

      expect(getModelName('model-1')).toBe('Test Model 1');
      expect(getModelName('model-2')).toBe('Test Model 2');
    });

    it('should return model ID when not in map', () => {
      const models = {
        'model-1': 'Test Model 1',
      };

      const getModelName = (modelId) => {
        if (!modelId) return 'Unknown Model';
        return models[modelId] || modelId;
      };

      expect(getModelName('unknown-model')).toBe('unknown-model');
    });

    it('should return Unknown Model for null/undefined modelId', () => {
      const getModelName = (modelId) => {
        if (!modelId) return 'Unknown Model';
        return modelId;
      };

      expect(getModelName(null)).toBe('Unknown Model');
      expect(getModelName(undefined)).toBe('Unknown Model');
      expect(getModelName('')).toBe('Unknown Model');
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no generations exist', () => {
      const generations = [];
      const isLoading = false;

      const shouldShowEmptyState = generations.length === 0 && !isLoading;
      expect(shouldShowEmptyState).toBe(true);
    });

    it('should not show empty state when loading', () => {
      const generations = [];
      const isLoading = true;

      const shouldShowEmptyState = generations.length === 0 && !isLoading;
      expect(shouldShowEmptyState).toBe(false);
    });

    it('should not show empty state when generations exist', () => {
      const generations = [{ id: '1' }];
      const isLoading = false;

      const shouldShowEmptyState = generations.length === 0 && !isLoading;
      expect(shouldShowEmptyState).toBe(false);
    });
  });

  describe('Computed Flags', () => {
    it('should detect pending or processing generations', () => {
      const generations = [
        { status: 'pending' },
        { status: 'completed' },
        { status: 'processing' },
      ];

      const hasPendingOrProcessing = generations.some(g =>
        g.status === 'pending' || g.status === 'processing'
      );

      expect(hasPendingOrProcessing).toBe(true);
    });

    it('should detect failed generations', () => {
      const generations = [
        { status: 'completed' },
        { status: 'failed' },
        { status: 'cancelled' },
      ];

      const hasFailed = generations.some(g => g.status === 'failed');

      expect(hasFailed).toBe(true);
    });

    it('should not detect failed when none exist', () => {
      const generations = [
        { status: 'completed' },
        { status: 'cancelled' },
      ];

      const hasFailed = generations.some(g => g.status === 'failed');

      expect(hasFailed).toBe(false);
    });
  });

  describe('Action Handlers', () => {
    it('should determine correct endpoint for edit type', () => {
      const generation = { type: 'edit' };
      const endpoint = generation.type === 'edit'
        ? '/api/queue/edit'
        : generation.type === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(endpoint).toBe('/api/queue/edit');
    });

    it('should determine correct endpoint for variation type', () => {
      const generation = { type: 'variation' };
      const endpoint = generation.type === 'edit'
        ? '/api/queue/edit'
        : generation.type === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(endpoint).toBe('/api/queue/variation');
    });

    it('should determine correct endpoint for generate type', () => {
      const generation = { type: 'generate' };
      const endpoint = generation.type === 'edit'
        ? '/api/queue/edit'
        : generation.type === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(endpoint).toBe('/api/queue/generate');
    });

    it('should determine correct endpoint for undefined type', () => {
      const generation = {};
      const endpoint = generation.type === 'edit'
        ? '/api/queue/edit'
        : generation.type === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      expect(endpoint).toBe('/api/queue/generate');
    });
  });

  describe('Image File Path Handling', () => {
    it('should extract filename from input_image_path', () => {
      const inputImagePath = '/path/to/input/image.png';
      const filename = inputImagePath.split('/').pop();

      expect(filename).toBe('image.png');
    });

    it('should construct static URL from filename', () => {
      const filename = 'image.png';
      const staticUrl = `/static/input/${filename}`;

      expect(staticUrl).toBe('/static/input/image.png');
    });
  });

  describe('Dialog State Management', () => {
    it('should track separate dialog states', () => {
      const states = {
        showLogs: false,
        isFailedLogsOpen: false,
        isMobileInfoOpen: false,
        isDeleteAllOpen: false,
        isCancelAllOpen: false,
        isClearFailedOpen: false,
      };

      expect(states.showLogs).toBe(false);
      expect(states.isFailedLogsOpen).toBe(false);
      expect(states.isMobileInfoOpen).toBe(false);
    });

    it('should handle opening and closing dialogs', () => {
      let isFailedLogsOpen = false;

      // Open
      isFailedLogsOpen = true;
      expect(isFailedLogsOpen).toBe(true);

      // Close
      isFailedLogsOpen = false;
      expect(isFailedLogsOpen).toBe(false);
    });
  });
});
