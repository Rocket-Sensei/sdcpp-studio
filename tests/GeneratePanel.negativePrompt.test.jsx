/**
 * Tests for GeneratePanel negative prompt support feature
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GeneratePanel } from '../frontend/src/components/GeneratePanel';

// Mock the useImageGeneration hook
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: vi.fn().mockResolvedValue({ success: true }),
    isLoading: false,
    error: null,
    result: null,
  }),
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

// Mock models data with supports_negative_prompt field
const mockModels = [
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
];

const mockOnModelsChange = vi.fn();

describe('GeneratePanel - Negative Prompt Support', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for upscalers and models
    global.fetch = vi.fn((url) => {
      if (url === '/sdapi/v1/upscalers') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve([{ name: 'RealESRGAN 4x+', scale: 4 }]),
        });
      }
      if (url === '/api/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: mockModels }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('Negative prompt visibility based on model support', () => {
    it('should hide negative prompt when no models selected', () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: [],
        onModelsChange: mockOnModelsChange,
      }));

      // Negative prompt should not be visible when no models are selected
      expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
    });

    it('should show negative prompt when SD1.5 model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should show negative prompt when Pony model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['cyberrealistic-pony'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should show negative prompt when SDXL model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should hide negative prompt when FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when another FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux-dev'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when Qwen model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['qwen-image'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when Qwen Image Edit model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['qwen-image-edit'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should show negative prompt when multiple models selected and at least one supports it', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned', 'flux1-schnell'],
        onModelsChange: mockOnModelsChange,
      }));

      // Even though FLUX doesn't support negative prompts, SD1.5 does
      // so the field should be visible
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should show negative prompt when Pony and Qwen models are both selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['cyberrealistic-pony', 'qwen-image'],
        onModelsChange: mockOnModelsChange,
      }));

      // Pony supports it, Qwen doesn't - should show because at least one supports
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should show negative prompt when SDXL and FLUX models are both selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['epicrealism-xl', 'flux1-schnell'],
        onModelsChange: mockOnModelsChange,
      }));

      // SDXL supports it, FLUX doesn't - should show
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should hide negative prompt when all selected models do not support it', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell', 'flux-dev', 'qwen-image'],
        onModelsChange: mockOnModelsChange,
      }));

      // All selected models don't support negative prompts
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt when two FLUX models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell', 'flux-dev'],
        onModelsChange: mockOnModelsChange,
      }));

      // Both FLUX models don't support negative prompts
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });

    it('should show negative prompt when all three supporting models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned', 'cyberrealistic-pony', 'epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
      }));

      // All support negative prompts
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should show negative prompt when model list includes all types but at least one supports it', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: [
          'v1-5-pruned',
          'cyberrealistic-pony',
          'epicrealism-xl',
          'flux1-schnell',
          'flux-dev',
          'qwen-image'
        ],
        onModelsChange: mockOnModelsChange,
      }));

      // At least one model (actually three) support negative prompts
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });
  });

  describe('Negative prompt interaction with mode switching', () => {
    it('should hide negative prompt in upscale mode even when SD1.5 model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      // First verify negative prompt is shown in image mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });

      // Switch to upscale mode
      fireEvent.click(screen.getByText('Upscale'));

      // Negative prompt should not be visible in upscale mode
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });
    });

    it('should hide negative prompt in upscale mode even when multiple supporting models are selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned', 'cyberrealistic-pony', 'epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
      }));

      // First verify negative prompt is shown in image mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });

      // Switch to upscale mode
      fireEvent.click(screen.getByText('Upscale'));

      // Negative prompt should not be visible in upscale mode
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });
    });

    it('should keep negative prompt hidden in image mode when FLUX model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
      }));

      // Verify negative prompt is not shown initially (image mode with FLUX)
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });

      // Switch to edit mode
      fireEvent.click(screen.getByText('Edit'));

      // Negative prompt should still not be visible
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });
    });

    it('should show negative prompt in image mode when SD1.5 model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      // Verify negative prompt is shown in image mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });

      // Switch to edit mode
      fireEvent.click(screen.getByText('Edit'));

      // Negative prompt should still be visible in edit mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });
    });

    it('should show negative prompt in edit mode when Pony model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['cyberrealistic-pony'],
        onModelsChange: mockOnModelsChange,
      }));

      // First verify negative prompt is shown in image mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });

      // Switch to edit mode
      fireEvent.click(screen.getByText('Edit'));

      // Negative prompt should still be visible in imagedit mode
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });
    });
  });

  describe('Negative prompt input functionality', () => {
    it('should allow typing in negative prompt when supporting model is selected', async () => {
      render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });

      const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
      fireEvent.change(negPromptInput, { target: { value: 'blurry, watermark, low quality' } });

      expect(negPromptInput).toHaveValue('blurry, watermark, low quality');
    });

    it('should apply negative prompt from settings when supporting model is selected', async () => {
      const settings = { negative_prompt: 'ugly, deformed, distorted' };

      render(React.createElement(GeneratePanel, {
        selectedModels: ['epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
        settings: settings,
      }));

      await waitFor(() => {
        const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
        expect(negPromptInput).toHaveValue('ugly, deformed, distorted');
      });
    });

    it('should not apply negative prompt from settings when non-supporting model is selected', async () => {
      const settings = { negative_prompt: 'ugly, deformed, distorted' };

      render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
        settings: settings,
      }));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/blurry, low quality/)).not.toBeInTheDocument();
      });
    });
  });

  describe('Model selection changes', () => {
    it('should show negative prompt after changing from non-supporting to supporting model', async () => {
      const { rerender } = render(React.createElement(GeneratePanel, {
        selectedModels: ['flux1-schnell'],
        onModelsChange: mockOnModelsChange,
      }));

      // Initially hidden with FLUX model
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });

      // Rerender with supporting model
      rerender(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      // Now should be visible
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });
    });

    it('should hide negative prompt after changing from supporting to non-supporting model', async () => {
      const { rerender } = render(React.createElement(GeneratePanel, {
        selectedModels: ['cyberrealistic-pony'],
        onModelsChange: mockOnModelsChange,
      }));

      // Initially visible with Pony model
      await waitFor(() => {
        expect(screen.getByText('Negative Prompt')).toBeInTheDocument();
      });

      // Rerender with non-supporting model
      rerender(React.createElement(GeneratePanel, {
        selectedModels: ['qwen-image'],
        onModelsChange: mockOnModelsChange,
      }));

      // Now should be hidden
      await waitFor(() => {
        expect(screen.queryByText('Negative Prompt')).not.toBeInTheDocument();
      });
    });

    it('should maintain negative prompt value when switching between supporting models', async () => {
      const { rerender } = render(React.createElement(GeneratePanel, {
        selectedModels: ['v1-5-pruned'],
        onModelsChange: mockOnModelsChange,
      }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });

      const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
      fireEvent.change(negPromptInput, { target: { value: 'test negative prompt' } });

      expect(negPromptInput).toHaveValue('test negative prompt');

      // Rerender with different supporting model
      rerender(React.createElement(GeneratePanel, {
        selectedModels: ['epicrealism-xl'],
        onModelsChange: mockOnModelsChange,
      }));

      // Value should be maintained
      await waitFor(() => {
        const newNegPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
        expect(newNegPromptInput).toHaveValue('test negative prompt');
      });
    });
  });
});
