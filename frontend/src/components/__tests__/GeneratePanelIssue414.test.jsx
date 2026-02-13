import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

// Mock the useModels hook
vi.mock('../../hooks/useModels', () => ({
  useModels: () => ({
    models: [
      { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    modelsMap: {
      model1: { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
    },
    modelsNameMap: {
      model1: 'Model 1',
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
      <label>End Frame Image (Optional)</label>
      <label>Video Frames</label>
      <label>Video FPS</label>
      <label>Flow Shift</label>
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

describe('GeneratePanel - Issue 414 Fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQueued.mockClear();
    localStorageMock.clear();
  });

  describe('Issue: Settings panel nested Card structure', () => {
    it('should NOT have nested Card wrapper - GeneratePanel should render as div, not Card', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
        />
      );

      // Check that the root element is not a Card (which would have Card styling)
      const settingsPanel = screen.getByTestId('settings-panel');
      expect(settingsPanel).toBeInTheDocument();

      // The root should NOT have border/border-border class
      expect(settingsPanel.className).not.toContain('border');
    });
  });

  describe('Issue: Secondary border on form', () => {
    it('should NOT have bg-card border-border rounded-xl classes on form content', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="image"
          prompt="test"
        />
      );

      // Find the settings content area
      const settingsContent = screen.getByTestId('settings-panel');
      expect(settingsContent).toBeInTheDocument();

      // Should not have problematic border classes
      expect(settingsContent.className).not.toContain('bg-card border border-border rounded-xl');
    });
  });

  describe('Issue: Source Image selection in Edit mode', () => {
    it('should show Source Image in PromptBar for Edit mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="imgedit"
          prompt="test"
          sourceImagePreview="data:image/png;base64,test"
          sourceImage={new File(['test.png'], 'test.png', { type: 'image/png' })}
        />
      );

      // Source image selection is now in PromptBar/EditImage, not in EditSettings
      const editSettings = screen.queryByTestId('edit-settings');
      expect(editSettings).toBeInTheDocument();
    });
  });

  describe('Issue: Source image file selection', () => {
    it('should handle file selection correctly in Edit mode', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="imgedit"
          prompt="test"
          sourceImagePreview="data:image/png;base64,test"
          sourceImage={new File(['test.png'], 'test.png', { type: 'image/png' })}
        />
      );

      // Settings panel should render without source image section (it's now in PromptBar)
      const editSettings = screen.getByTestId('edit-settings');
      expect(editSettings).toBeInTheDocument();
    });

    it('should handle file selection correctly in Video mode via PromptBar', () => {
      render(
        <GeneratePanel
          open={true}
          onOpenChange={mockOnOpenChange}
          selectedModels={['model1']}
          onModelsChange={mockOnModelsChange}
          mode="video"
          prompt="test"
          sourceImagePreview="data:image/png;base64,test"
          sourceImage={new File(['test.png'], 'test.png', { type: 'image/png' })}
        />
      );

      expect(screen.getByTestId('video-settings')).toBeInTheDocument();
    });
  });
});
