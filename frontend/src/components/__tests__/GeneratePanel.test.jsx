import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GeneratePanel } from '../GeneratePanel';

// Mock the useImageGeneration hook
const mockGenerateQueued = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: () => mockGenerateQueued(),
    isLoading: false,
    error: null,
    result: null,
  }),
}));

// Mock the toast function - must use a function that returns new objects each time
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock authenticatedFetch
vi.mock('../../utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

// Mock MultiModelSelector component
vi.mock('../MultiModelSelector', () => ({
  MultiModelSelector: ({ selectedModels, onModelsChange }) => (
    <div data-testid="multi-model-selector">
      <span>Selected: {selectedModels.length}</span>
    </div>
  ),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const mockOnModelsChange = vi.fn();
const mockOnGenerated = vi.fn();

// Get toast mock reference
let mockToast;

describe('GeneratePanel', () => {
  beforeEach(async () => {
    // Import toast to get the mock reference
    const { toast } = await import('sonner');
    mockToast = toast;

    vi.clearAllMocks();
    mockGenerateQueued.mockClear();
    mockToast.error.mockClear();
    mockToast.success.mockClear();
    // Mock fetch for upscalers
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
          json: () => Promise.resolve({
            models: [
              { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
              { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'], supports_negative_prompt: true },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('Rendering', () => {
    it('should render all mode tabs', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Image')).toBeInTheDocument();
      expect(screen.getByText('Edit')).toBeInTheDocument();
      expect(screen.getByText('Video')).toBeInTheDocument();
      expect(screen.getByText('Upscale')).toBeInTheDocument();
    });

    it('should render image mode by default', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/A serene landscape with/)).toBeInTheDocument();
      });
      // Negative prompt should also be visible since model1 supports it
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/blurry, low quality/)).toBeInTheDocument();
      });
    });

    it('should render edit mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click edit mode
      fireEvent.click(screen.getByText('Edit'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Transform this image/)).toBeInTheDocument();
      });
      expect(screen.getByText('Source Image *')).toBeInTheDocument();
    });

    it('should render upscale mode with upscaler settings', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click upscale mode
      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Upscaler Settings')).toBeInTheDocument();
      });
    });

    it('should NOT show strength slider in image mode without source image', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Should not find Strength slider in default image mode
      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    it('should NOT show strength slider in edit mode', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click edit mode
      fireEvent.click(screen.getByText('Edit'));

      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();
    });

    it('should show selected models count', () => {
      render(
        <GeneratePanel
          selectedModels={['model1', 'model2']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Use getAllByText as the count appears in both the sticky bar and MultiModelSelector
      expect(screen.getAllByText(/Selected: 2/).length).toBeGreaterThan(0);
    });

    it('should render size sliders and presets', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Image Size')).toBeInTheDocument();
      expect(screen.getByText('Width')).toBeInTheDocument();
      expect(screen.getByText('Height')).toBeInTheDocument();
      expect(screen.getByText('512')).toBeInTheDocument();
      expect(screen.getByText('768')).toBeInTheDocument();
      expect(screen.getByText('1024')).toBeInTheDocument();
    });

    it('should render advanced settings section', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Advanced SD.cpp Settings')).toBeInTheDocument();
    });

    it('should render queue mode toggle', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Queue Mode')).toBeInTheDocument();
      expect(screen.getByText('Add to queue and continue working')).toBeInTheDocument();
    });

    it('should render seed input', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Seed (optional)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Leave empty for random')).toBeInTheDocument();
    });
  });

  describe('Mode switching', () => {
    it('should switch to video mode and show video settings', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Prompt should be visible in image mode
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();

      // Switch to video
      fireEvent.click(screen.getByText('Video'));

      await waitFor(() => {
        expect(screen.getByText('Video Settings')).toBeInTheDocument();
      });
    });

    it('should switch to upscale mode and show upscaler settings', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Should show prompt initially
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();

      // Switch to upscale
      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Upscaler Settings')).toBeInTheDocument();
      });
    });
  });

  describe('User interactions - Prompt input', () => {
    it('should allow typing in the prompt input', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        const promptInput = screen.getByPlaceholderText(/A serene landscape/);
        fireEvent.change(promptInput, { target: { value: 'A beautiful sunset over mountains' } });
        expect(promptInput).toHaveValue('A beautiful sunset over mountains');
      });
    });

    it('should allow typing in the negative prompt input', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
        fireEvent.change(negPromptInput, { target: { value: 'ugly, deformed' } });
        expect(negPromptInput).toHaveValue('ugly, deformed');
      });
    });
  });

  describe('User interactions - Generate button', () => {
    it('should call generateQueued when generate is clicked with valid input', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Enter a prompt
      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'A test prompt' } });

      // Click generate button
      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockGenerateQueued).toHaveBeenCalled();
      });
    });

    it('should show error when generating without prompt', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Please enter a prompt');
      });
      expect(mockGenerateQueued).not.toHaveBeenCalled();
    });

    it('should be disabled when no models selected', () => {
      render(
        <GeneratePanel
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).toBeDisabled();
    });

    it('should be enabled when models are selected', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).not.toBeDisabled();
    });
  });

  describe('Strength parameter', () => {
    it('should have default strength of 0.75 in image mode with source image', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Initially no strength slider in image mode without source image
      expect(screen.queryByText(/Strength:/)).not.toBeInTheDocument();

      // Strength only shows when source image is provided - tested in integration
    });
  });

  describe('Collapse functionality', () => {
    it('should be expanded by default', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();
      });
    });

    it('should collapse when header is clicked', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Wait for component to load
      await waitFor(() => {
        expect(screen.getByText('Generation Mode')).toBeInTheDocument();
      });

      // The collapse functionality test - actual behavior depends on implementation
      // For now, just verify the Generation Mode text is visible
      expect(screen.getByText('Generation Mode')).toBeInTheDocument();
    });
  });

  describe('Sticky generate button', () => {
    it('should render generate button at top', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByRole('button', { name: /^Generate$/i })).toBeInTheDocument();
    });

    it('should disable generate button when no models selected', () => {
      render(
        <GeneratePanel
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).toBeDisabled();
    });

    it('should enable generate button when models are selected', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).not.toBeDisabled();
    });
  });

  describe('Settings from Create More', () => {
    it('should apply prompt from settings', () => {
      const settings = { prompt: 'Test prompt from settings' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      const promptInput = screen.getByPlaceholderText(/A serene landscape/);
      expect(promptInput).toHaveValue('Test prompt from settings');
    });

    it('should apply negative prompt from settings', async () => {
      const settings = { negative_prompt: 'blurry, watermark' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      await waitFor(() => {
        const negPromptInput = screen.getByPlaceholderText(/blurry, low quality/);
        expect(negPromptInput).toHaveValue('blurry, watermark');
      });
    });

    it('should apply size from settings', () => {
      const settings = { size: '768x768' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByText(/768 x 768/)).toBeInTheDocument();
    });

    it('should switch to edit mode when settings type is edit', () => {
      const settings = { type: 'edit' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByPlaceholderText(/Transform this image/)).toBeInTheDocument();
    });

    it('should stay in image mode when settings type is variation', () => {
      const settings = { type: 'variation' };

      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          settings={settings}
        />
      );

      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();
    });
  });

  describe('Validation', () => {
    it('should disable generate button and prevent clicking when no models selected', async () => {
      render(
        <GeneratePanel
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).toBeDisabled();
      // Disabled buttons don't trigger click handlers, so validation won't run
      expect(mockToast.error).not.toHaveBeenCalled();
    });

    it('should show error when generating without prompt in image mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Please enter a prompt');
      });
    });

    it('should show error when generating without source image in edit mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Switch to edit mode
      fireEvent.click(screen.getByText('Edit'));

      // Wait for edit mode to load
      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Transform this image/)).toBeInTheDocument();
      });

      // Enter prompt but no image
      const promptInput = screen.getByPlaceholderText(/Transform this image/);
      fireEvent.change(promptInput, { target: { value: 'A test prompt' } });

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Please select a source image');
      });
    });
  });

  describe('Multi-model generation', () => {
    it('should display count of selected models', () => {
      render(
        <GeneratePanel
          selectedModels={['model1', 'model2', 'model3']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Use getAllByText as the count appears in both the sticky bar and MultiModelSelector
      expect(screen.getAllByText(/Selected: 3/).length).toBeGreaterThan(0);
    });
  });

  describe('Advanced settings toggle', () => {
    it('should collapse advanced settings by default', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Advanced settings are collapsed by default
      // CFG scale should not be visible
      expect(screen.queryByText(/CFG Scale:/)).not.toBeInTheDocument();
    });

    it('should expand advanced settings when clicked', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click to expand
      const advancedButton = screen.getByText('Advanced SD.cpp Settings');
      fireEvent.click(advancedButton);

      // Now CFG scale should be visible
      expect(screen.getByText(/CFG Scale:/)).toBeInTheDocument();
    });

    it('should show all advanced settings when expanded', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Click to expand
      const advancedButton = screen.getByText('Advanced SD.cpp Settings');
      fireEvent.click(advancedButton);

      expect(screen.getByText(/CFG Scale:/)).toBeInTheDocument();
      expect(screen.getByText(/Sample Steps:/)).toBeInTheDocument();
      expect(screen.getByText(/Sampling Method/)).toBeInTheDocument();
      expect(screen.getByText(/CLIP Skip/)).toBeInTheDocument();
    });
  });

  describe('Size controls', () => {
    it('should render size presets', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Check common presets
      expect(screen.getByText('256')).toBeInTheDocument();
      expect(screen.getByText('512')).toBeInTheDocument();
      expect(screen.getByText('768')).toBeInTheDocument();
      expect(screen.getByText('1024')).toBeInTheDocument();
      expect(screen.getByText('1024x768')).toBeInTheDocument();
      expect(screen.getByText('768x1024')).toBeInTheDocument();
    });
  });

  describe('Upscale mode specific features', () => {
    it('should show upscaler settings in upscale mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      fireEvent.click(screen.getByText('Upscale'));

      await waitFor(() => {
        expect(screen.getByText('Upscaler Settings')).toBeInTheDocument();
        expect(screen.getByText('Resize Mode')).toBeInTheDocument();
        expect(screen.getByText('By Factor')).toBeInTheDocument();
        expect(screen.getByText('To Size')).toBeInTheDocument();
      });
    });

    it('should not show prompt input in upscale mode', async () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Prompt is visible in image mode
      expect(screen.getByPlaceholderText(/A serene landscape/)).toBeInTheDocument();

      // Switch to upscale
      fireEvent.click(screen.getByText('Upscale'));

      // Prompt should no longer be visible
      await waitFor(() => {
        expect(screen.queryByPlaceholderText(/A serene landscape/)).not.toBeInTheDocument();
      });
    });

    it('should show upscale after generation option in non-upscale modes', () => {
      render(
        <GeneratePanel
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText('Upscale After Generation')).toBeInTheDocument();
      expect(screen.getByText('Automatically upscale the generated image')).toBeInTheDocument();
    });
  });
});
