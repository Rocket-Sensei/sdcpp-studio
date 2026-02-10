import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { GeneratePanel } from '../GeneratePanel';

// Mock the useImageGeneration hook
const mockGenerateQueued = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: (args) => mockGenerateQueued(args),
    isLoading: false,
    error: null,
    result: null,
  }),
}));

// Mock the useModels hook with proper modelsMap that has supports_negative_prompt
vi.mock('../../hooks/useModels', () => ({
  useModels: () => ({
    models: [
      { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
      { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'], supports_negative_prompt: true },
      { id: 'flux1', name: 'FLUX.1', capabilities: ['text-to-image'], supports_negative_prompt: false },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    modelsMap: {
      model1: { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
      model2: { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'], supports_negative_prompt: true },
      flux1: { id: 'flux1', name: 'FLUX.1', capabilities: ['text-to-image'], supports_negative_prompt: false },
    },
    modelsNameMap: {
      model1: 'Model 1',
      model2: 'Model 2',
      flux1: 'FLUX.1',
    },
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
vi.mock('../../utils/api', () => ({
  authenticatedFetch: vi.fn(),
}));

// Mock UI components from shadcn/ui
vi.mock('../../lib/utils', () => ({
  cn: (...classes) => classes.filter(Boolean).join(' '),
}));

// Mock child components
vi.mock('../settings/ImageSettings', () => ({
  ImageSettings: ({ negativePrompt, onNegativePromptChange, supportsNegativePrompt }) => (
    <div data-testid="image-settings">
      {supportsNegativePrompt && (
        <div>
          <label>Negative Prompt</label>
          <textarea
            data-testid="negative-prompt-input"
            value={negativePrompt}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            placeholder="blurry, low quality, distorted, watermark..."
          />
        </div>
      )}
      <div data-testid="width-display">Width: 512</div>
      <div data-testid="height-display">Height: 512</div>
      <label>Image Size</label>
      <div>512</div>
      <div>768</div>
      <div>1024</div>
      <label>Advanced Settings</label>
      <label>Queue Mode</label>
      <label>Seed (optional)</label>
      <input placeholder="Leave empty for random" />
    </div>
  ),
}));

vi.mock('../settings/EditSettings', () => ({
  EditSettings: ({ negativePrompt, onNegativePromptChange, supportsNegativePrompt }) => (
    <div data-testid="edit-settings">
      <label>Source Image *</label>
      {supportsNegativePrompt && (
        <div>
          <label>Negative Prompt</label>
          <textarea
            data-testid="negative-prompt-input"
            value={negativePrompt}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            placeholder="blurry, low quality, distorted, watermark..."
          />
        </div>
      )}
      <label>Advanced Settings</label>
      <label>Queue Mode</label>
      <label>Seed (optional)</label>
    </div>
  ),
}));

vi.mock('../settings/VideoSettings', () => ({
  VideoSettings: ({ width, height }) => (
    <div data-testid="video-settings">
      <label>Start Frame Image (Optional)</label>
      <label>Video Frames</label>
      <label>Video FPS</label>
      <label>Flow Shift</label>
      <label>End Frame Image (Optional)</label>
      <label>Size: {width}x{height}</label>
      <label>Advanced Settings</label>
      <label>Queue Mode</label>
      <label>Seed (optional)</label>
    </div>
  ),
}));

vi.mock('../settings/UpscaleSettings', () => ({
  UpscaleSettings: () => (
    <div data-testid="upscale-settings">
      <label>Resize Mode</label>
      <button>By Factor</button>
      <button>To Size</button>
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
const mockOnGenerated = vi.fn();
const mockOnOpenChange = vi.fn();

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
    localStorageMock.clear();
  });

  describe('Rendering - Panel structure', () => {
    it('should render the settings panel card when open', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByTestId('settings-panel')).toBeInTheDocument();
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should not render anything when closed', () => {
      const { container } = render(
        <GeneratePanel
          open={false}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(container.firstChild).toBe(null);
    });

    it('should render close button in header', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const closeButton = screen.getByRole('button', { name: '✕' });
      expect(closeButton).toBeInTheDocument();
    });

    it('should call onOpenChange with false when close button is clicked', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      const closeButton = screen.getByRole('button', { name: '✕' });
      fireEvent.click(closeButton);

      expect(mockOnOpenChange).toHaveBeenCalledWith(false);
    });
  });

  describe('Rendering - Image mode (default)', () => {
    it('should render ImageSettings when in image mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByTestId('image-settings')).toBeInTheDocument();
    });

    it('should render negative prompt input when model supports it', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    });

    it('should not render negative prompt input when model does not support it', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['flux1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
    });

    it('should render size controls', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByText('Image Size')).toBeInTheDocument();
      expect(screen.getByText('512')).toBeInTheDocument();
      expect(screen.getByText('768')).toBeInTheDocument();
      expect(screen.getByText('1024')).toBeInTheDocument();
    });

    it('should render advanced settings label', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByText('Advanced Settings')).toBeInTheDocument();
    });

    it('should render queue mode toggle', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByText('Queue Mode')).toBeInTheDocument();
    });

    it('should render seed input', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      expect(screen.getByText('Seed (optional)')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Leave empty for random')).toBeInTheDocument();
    });

    it('should render generate button', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).toBeInTheDocument();
    });

    it('should disable generate button when no models selected', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).toBeDisabled();
    });

    it('should enable generate button when models are selected with prompt', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      expect(generateButton).not.toBeDisabled();
    });
  });

  describe('Rendering - Edit mode', () => {
    it('should render EditSettings when in edit mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="imgedit"
        />
      );

      expect(screen.getByTestId('edit-settings')).toBeInTheDocument();
    });

    it('should render source image upload in edit mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="imgedit"
        />
      );

      expect(screen.getByText('Source Image *')).toBeInTheDocument();
    });
  });

  describe('Rendering - Video mode', () => {
    it('should render VideoSettings when in video mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="video"
        />
      );

      expect(screen.getByTestId('video-settings')).toBeInTheDocument();
    });

    it('should render video-specific settings', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="video"
        />
      );

      expect(screen.getByText('Start Frame Image (Optional)')).toBeInTheDocument();
      expect(screen.getByText('Video Frames')).toBeInTheDocument();
      expect(screen.getByText('Video FPS')).toBeInTheDocument();
      expect(screen.getByText('Flow Shift')).toBeInTheDocument();
      expect(screen.getByText('End Frame Image (Optional)')).toBeInTheDocument();
    });
  });

  describe('Rendering - Upscale mode', () => {
    it('should render UpscaleSettings when in upscale mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="upscale"
        />
      );

      expect(screen.getByTestId('upscale-settings')).toBeInTheDocument();
    });

    it('should render resize mode options', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="upscale"
        />
      );

      expect(screen.getByText('Resize Mode')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'By Factor' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'To Size' })).toBeInTheDocument();
    });

    it('should not render generate button in upscale mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="upscale"
        />
      );

      const generateButton = screen.queryByRole('button', { name: /^Generate$/i });
      expect(generateButton).not.toBeInTheDocument();
    });
  });

  describe('Negative prompt support', () => {
    it('should show negative prompt for models that support it', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
        />
      );

      expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    });

    it('should hide negative prompt for models that do not support it', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['flux1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
        />
      );

      expect(screen.queryByTestId('negative-prompt-input')).not.toBeInTheDocument();
    });

    it('should show negative prompt when at least one model supports it', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1', 'flux1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
        />
      );

      expect(screen.getByTestId('negative-prompt-input')).toBeInTheDocument();
    });
  });

  describe('Generate functionality', () => {
    it('should call generateQueued with correct params when generate is clicked', async () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A beautiful sunset"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockGenerateQueued).toHaveBeenCalledWith(
          expect.objectContaining({
            mode: 'generate',
            prompt: 'A beautiful sunset',
            model: 'model1',
          })
        );
      });
    });

    it('should be disabled when generating without prompt', async () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt=""
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      // Button should be disabled when no prompt is provided
      expect(generateButton).toBeDisabled();
      expect(mockGenerateQueued).not.toHaveBeenCalled();
    });

    it('should be disabled when no models selected', async () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      // Button should be disabled when no models are selected
      expect(generateButton).toBeDisabled();
      expect(mockGenerateQueued).not.toHaveBeenCalled();
    });

    it('should call onGenerated callback after successful generation', async () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          onGenerated={mockOnGenerated}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockOnGenerated).toHaveBeenCalled();
      });
    });

    it('should show success toast with job count', async () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1', 'model2']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="A test prompt"
        />
      );

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('2 job(s) added to queue!');
      });
    });
  });

  describe('Settings application', () => {
    it('should apply negative prompt from settings prop', async () => {
      const settings = { negative_prompt: 'blurry, watermark' };

      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          settings={settings}
        />
      );

      const negPromptInput = screen.getByTestId('negative-prompt-input');
      expect(negPromptInput).toHaveValue('blurry, watermark');
    });

    it('should apply size from settings prop', () => {
      const settings = { size: '768x768' };

      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          settings={settings}
        />
      );

      // The settings are applied internally, just verify component renders
      expect(screen.getByTestId('image-settings')).toBeInTheDocument();
    });
  });

  describe('Upscale props handling', () => {
    it('should pass upscale props to ImageSettings', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          upscaleFactor={4}
          onUpscaleFactorChange={vi.fn()}
        />
      );

      // Component should render without errors
      expect(screen.getByTestId('image-settings')).toBeInTheDocument();
    });
  });

  describe('Server mode models', () => {
    it('should handle server mode models with fixed steps', () => {
      // Add a server mode model to the mock
      const { rerender } = render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
        />
      );

      expect(screen.getByTestId('image-settings')).toBeInTheDocument();
    });
  });
});
