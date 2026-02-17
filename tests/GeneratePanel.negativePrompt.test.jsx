/**
 * Tests for GeneratePanel negative prompt support feature
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GeneratePanel } from '../frontend/src/components/GeneratePanel';

// Mock the useImageGeneration hook
const mockGenerateQueued = vi.fn().mockResolvedValue({ success: true });

vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: (args) => mockGenerateQueued(args),
    isLoading: false,
    error: null,
    result: null,
  }),
}));

// Mock the useModels hook with proper modelsMap that has supports_negative_prompt
// Create a factory function to allow dynamic model configuration
const createMockModels = (models) => ({
  models,
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  modelsMap: models.reduce((acc, model) => {
    acc[model.id] = model;
    return acc;
  }, {}),
  modelsNameMap: models.reduce((acc, model) => {
    acc[model.id] = model.name || model.id;
    return acc;
  }, {}),
});

// Default mock with models that have different support for negative prompts
vi.mock('../frontend/src/hooks/useModels', () => ({
  useModels: vi.fn(() => createMockModels([
    {
      id: 'v1-5-pruned',
      name: 'SD 1.5 Pruned',
      capabilities: ['text-to-image', 'image-to-image'],
      supports_negative_prompt: true,
    },
    {
      id: 'cyberrealistic-pony',
      name: 'CyberRealistic Pony',
      capabilities: ['text-to-image', 'image-to-image'],
      supports_negative_prompt: true,
    },
    {
      id: 'epicrealism-xl',
      name: 'EpicRealism XL',
      capabilities: ['text-to-image', 'image-to-image'],
      supports_negative_prompt: true,
    },
    {
      id: 'flux1-schnell',
      name: 'FLUX.1 Schnell',
      capabilities: ['text-to-image'],
      supports_negative_prompt: false,
    },
    {
      id: 'flux-dev',
      name: 'FLUX Dev',
      capabilities: ['text-to-image'],
      supports_negative_prompt: false,
    },
    {
      id: 'qwen-image',
      name: 'Qwen Image',
      capabilities: ['text-to-image'],
      supports_negative_prompt: false,
    },
    {
      id: 'qwen-image-edit',
      name: 'Qwen Image Edit',
      capabilities: ['text-to-image', 'image-to-image'],
      supports_negative_prompt: false,
    },
  ])),
}));

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock authenticatedFetch
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

// Mock UI components from shadcn/ui
vi.mock('../frontend/src/lib/utils', () => ({
  cn: (...classes) => classes.filter(Boolean).join(' '),
}));

// Mock child components
vi.mock('../frontend/src/components/settings/ImageSettings', () => ({
  ImageSettings: ({ negativePrompt, onNegativePromptChange, supportsNegativePrompt }) => (
    <div data-testid="image-settings">
      {supportsNegativePrompt && (
        <div>
          <label>Negative Prompt</label>
          <textarea
            data-testid="negative-prompt-input"
            value={negativePrompt || ''}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            placeholder="blurry, low quality, distorted, watermark..."
          />
        </div>
      )}
    </div>
  ),
}));

vi.mock('../frontend/src/components/settings/EditSettings', () => ({
  EditSettings: ({ negativePrompt, onNegativePromptChange, supportsNegativePrompt }) => (
    <div data-testid="edit-settings">
      <label>Source Image *</label>
      {supportsNegativePrompt && (
        <div>
          <label>Negative Prompt</label>
          <textarea
            data-testid="negative-prompt-input"
            value={negativePrompt || ''}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            placeholder="blurry, low quality, distorted, watermark..."
          />
        </div>
      )}
    </div>
  ),
}));

vi.mock('../frontend/src/components/settings/VideoSettings', () => ({
  VideoSettings: () => (
    <div data-testid="video-settings">
      <label>Start Frame Image (Optional)</label>
    </div>
  ),
}));

vi.mock('../frontend/src/components/settings/UpscaleSettings', () => ({
  UpscaleSettings: () => (
    <div data-testid="upscale-settings">
      <label>Resize Mode</label>
    </div>
  ),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] || null,
    setItem: (key, value) => { store[key] = value.toString(); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
  };
})();
global.localStorage = localStorageMock;

const mockOnModelsChange = vi.fn();
const mockOnOpenChange = vi.fn();

describe('GeneratePanel - Negative Prompt Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  describe('Negative prompt visibility based on model support', () => {
    it('should show negative prompt when SD1.5 model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should show negative prompt when Pony model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['cyberrealistic-pony'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should show negative prompt when SDXL model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should hide negative prompt when FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when another FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['flux-dev'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when Qwen model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['qwen-image'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when Qwen Image Edit model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['qwen-image-edit'],
        onModelsChange: mockOnModelsChange,
        mode: 'imgedit',
      }));

      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should show negative prompt when multiple models selected and at least one supports it', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned', 'flux1-schnell'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // Even though FLUX doesn't support negative prompts, SD1.5 does
      // so the field should be visible
      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should show negative prompt when Pony and Qwen models are both selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['cyberrealistic-pony', 'qwen-image'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // Pony supports it, Qwen doesn't - should show because at least one supports
      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should show negative prompt when SDXL and FLUX models are both selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['epicrealism-xl', 'flux1-schnell'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // SDXL supports it, FLUX doesn't - should show
      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should hide negative prompt when all selected models do not support it', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['flux1-schnell', 'flux-dev', 'qwen-image'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // All selected models don't support negative prompts
      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when two FLUX models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['flux1-schnell', 'flux-dev'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // Both FLUX models don't support negative prompts
      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should show negative prompt when all three supporting models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned', 'cyberrealistic-pony', 'epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // All support negative prompts
      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should show negative prompt when model list includes all types but at least one supports it', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: [
          'v1-5-pruned',
          'cyberrealistic-pony',
          'epicrealism-xl',
          'flux1-schnell',
          'flux-dev',
          'qwen-image'
        ],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      // At least one model (actually three) support negative prompts
      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });
  });

  describe('Negative prompt input functionality', () => {
    it('should allow typing in negative prompt when supporting model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });

      const negPromptInput = screen.getByTestId('negative-prompt-input');
      fireEvent.change(negPromptInput, { target: { value: 'blurry, watermark, low quality' } });

      expect(negPromptInput).toHaveValue('blurry, watermark, low quality');
    });

    it('should apply negative prompt from settings when supporting model is selected', async () => {
      const settings = { negative_prompt: 'ugly, deformed, distorted' };

      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
        mode: 'image',
        settings: settings,
      }));

      await waitFor(() => {
        const negPromptInput = screen.getByTestId('negative-prompt-input');
        expect(negPromptInput).toHaveValue('ugly, deformed, distorted');
      });
    });
  });

  describe('Edit mode negative prompt support', () => {
    it('should show negative prompt in edit mode when supporting model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['cyberrealistic-pony'],
        onModelsChange: mockOnModelsChange,
        mode: 'imgedit',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('edit-settings')).toBeInTheDocument();
        expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
      });
    });

    it('should hide negative prompt in edit mode when non-supporting model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['qwen-image-edit'],
        onModelsChange: mockOnModelsChange,
        mode: 'imgedit',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('edit-settings')).toBeInTheDocument();
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });
  });

  describe('Video mode negative prompt support', () => {
    it('should hide negative prompt in video mode when FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
        mode: 'video',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('video-settings')).toBeInTheDocument();
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt in video mode even when SD1.5 model is selected (VideoSettings does not support negative prompts)', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
        mode: 'video',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('video-settings')).toBeInTheDocument();
        // VideoSettings component doesn't have negative prompt support
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });
  });

  describe('Upscale mode', () => {
    it('should not show negative prompt in upscale mode even when SD1.5 model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
        mode: 'upscale',
      }));

      await waitFor(() => {
        expect(screen.getByTestId('upscale-settings')).toBeInTheDocument();
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });

    it('should not show negative prompt in upscale mode even when multiple supporting models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        open: true,
        onOpenChange: mockOnOpenChange,
        selectedModels: ['v1-5-pruned', 'cyberrealistic-pony', 'epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
        mode: 'upscale',
      }));

      await waitFor(() => {
        expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
      });
    });
  });
});
