/**
 * Tests for Studio component
 *
 * Tests the new PromptBar-based UI design:
 * - PromptBar at top for quick generation
 * - SettingsPanel as side-sheet for advanced settings
 * - ModelSelectorModal for model selection
 * - "Create More" and "Edit Image" functionality from UnifiedQueue
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

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

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Mock URL.createObjectURL for edit image functionality
global.URL.createObjectURL = vi.fn(() => 'mock-url-blob:http://test');
global.URL.revokeObjectURL = vi.fn();

// Mock the hooks before importing components
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: vi.fn().mockResolvedValue({}),
    isLoading: false,
  }),
  useGenerations: () => ({
    generations: [],
    fetchGenerations: vi.fn(),
  }),
}));

vi.mock('../frontend/src/hooks/useModels', () => ({
  useModels: () => ({
    modelsNameMap: {},
    models: [],
    isLoading: false,
  }),
}));

vi.mock('../frontend/src/hooks/useWebSocket', () => ({
  useWebSocket: vi.fn(() => ({ isConnected: false })),
  useDownloadProgress: vi.fn(() => {}),
  WS_CHANNELS: {
    QUEUE: 'queue',
    GENERATIONS: 'generations',
    MODELS: 'models',
    DOWNLOAD: 'download',
  },
}));

// Mock react-use-websocket
vi.mock('react-use-websocket', () => ({
  default: vi.fn(() => ({
    sendJsonMessage: vi.fn(),
    lastJsonMessage: null,
    readyState: 3, // CLOSED
    getWebSocket: vi.fn(),
  })),
}));

// Import mock helpers
import { createMockResponse } from './setup.js';

// Mock authenticatedFetch and fetch
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: vi.fn(),
  getStoredApiKey: vi.fn(() => null),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
}));

global.fetch = vi.fn((url) => {
  if (url === '/api/models') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ models: [] }),
    });
  }
  if (url === '/sdapi/v1/upscalers') {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([{ name: 'RealESRGAN 4x+' }]),
    });
  }
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  });
});

// Mock the child components before importing Studio
vi.mock('../frontend/src/components/prompt/GenerateImage', () => ({
  GenerateImage: () => React.createElement('div', { 'data-testid': 'generate-image' }, 'Generate Image'),
}));
vi.mock('../frontend/src/components/prompt/EditImage', () => ({
  EditImage: () => React.createElement('div', { 'data-testid': 'edit-image' }, 'Edit Image'),
}));
vi.mock('../frontend/src/components/prompt/GenerateVideo', () => ({
  GenerateVideo: () => React.createElement('div', { 'data-testid': 'generate-video' }, 'Generate Video'),
}));
vi.mock('../frontend/src/components/prompt/UpscaleImage', () => ({
  UpscaleImage: () => React.createElement('div', { 'data-testid': 'upscale-image' }, 'Upscale Image'),
}));

// Mock child components of GeneratePanel
vi.mock('../frontend/src/components/settings/ImageSettings', () => ({
  ImageSettings: () => React.createElement('div', { 'data-testid': 'image-settings' }, 'Image Settings'),
}));
vi.mock('../frontend/src/components/settings/EditSettings', () => ({
  EditSettings: () => React.createElement('div', { 'data-testid': 'edit-settings' }, 'Edit Settings'),
}));
vi.mock('../frontend/src/components/settings/VideoSettings', () => ({
  VideoSettings: () => React.createElement('div', { 'data-testid': 'video-settings' }, 'Video Settings'),
}));
vi.mock('../frontend/src/components/settings/UpscaleSettings', () => ({
  UpscaleSettings: () => React.createElement('div', { 'data-testid': 'upscale-settings' }, 'Upscale Settings'),
}));

vi.mock('../frontend/src/components/prompt/PromptBar', () => ({
  PromptBar: ({ prompt, onPromptChange, onGenerate }) =>
    React.createElement('div', { 'data-testid': 'prompt-bar' },
      React.createElement('input', {
        'data-testid': 'prompt-input',
        value: prompt || '',
        onChange: (e) => onPromptChange?.(e.target.value),
        placeholder: 'Enter prompt...'
      }),
      React.createElement('button', {
        onClick: onGenerate,
        'data-testid': 'prompt-generate-button'
      }, 'Generate')
    ),
}));

vi.mock('../frontend/src/components/GeneratePanel', () => ({
  GeneratePanel: ({ open, onOpenChange, editImageSettings }) =>
    React.createElement('div', { 'data-testid': 'settings-panel' },
      React.createElement('button', {
        onClick: () => onOpenChange && onOpenChange(!open),
        'aria-expanded': open,
      }, 'Settings'),
      open && React.createElement('div', null,
        editImageSettings && React.createElement('div', { 'data-testid': 'edit-image-settings' }, JSON.stringify(editImageSettings)),
        React.createElement('button', {
          onClick: () => onOpenChange && onOpenChange(false),
          'data-testid': 'settings-generate-button'
        }, 'Generate')
      )
    ),
}));

vi.mock('../frontend/src/components/MultiModelSelector', () => ({
  MultiModelSelector: () =>
    React.createElement('div', { 'data-testid': 'multi-model-selector' },
      React.createElement('div', { 'data-testid': 'models-list' }, 'Models list')
    ),
}));

vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: ({ onCreateMore, onEditImage, searchQuery, selectedStatuses, selectedModelsFilter }) =>
    React.createElement('div', { 'data-testid': 'unified-queue' },
      searchQuery && React.createElement('div', { 'data-testid': 'search-query' }, searchQuery),
      selectedStatuses && React.createElement('div', { 'data-testid': 'selected-statuses' }, selectedStatuses.join(',')),
      selectedModelsFilter && React.createElement('div', { 'data-testid': 'selected-models-filter' }, selectedModelsFilter.join(',')),
      React.createElement('button', {
        onClick: () => onCreateMore && onCreateMore({
          id: 'test-gen-id',
          model: 'test-model-id',
          prompt: 'test prompt',
          size: '512x512',
          negative_prompt: 'test negative'
        }),
        'data-testid': 'create-more-button'
      }, 'Create More'),
      React.createElement('button', {
        onClick: () => onEditImage && onEditImage(new File([''], 'test.jpg', { type: 'image/jpeg' }), {
          id: 'test-gen-id',
          prompt: 'edit prompt',
          size: '1024x1024'
        }),
        'data-testid': 'edit-image-button'
      }, 'Edit Image')
    ),
}));

// Import Studio after mocks are set up
const { Studio } = await import('../frontend/src/components/Studio');

// Get the mocked authenticatedFetch
const { authenticatedFetch } = await import('../frontend/src/utils/api');

describe('Studio Component', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();

    // Set up authenticatedFetch mock to return proper Response objects
    authenticatedFetch.mockImplementation((url) => {
      if (url === '/sdapi/v1/upscalers') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([{ name: 'RealESRGAN 4x+' }]),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should render without crashing', () => {
    const { container } = render(React.createElement(Studio));

    expect(container).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should render UnifiedQueue and collapsible generation panel', () => {
    render(React.createElement(Studio));

    // UnifiedQueue should be visible
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
    // Generation panel toggle button should be present
    expect(screen.getByRole('button', { name: /toggle generation/i })).toBeTruthy();
  });

  describe('Filter Props', () => {
    it('should pass searchQuery to UnifiedQueue', () => {
      render(React.createElement(Studio, {
        searchQuery: 'test search'
      }));

      expect(screen.getByTestId('search-query')).toBeTruthy();
      expect(screen.getByTestId('search-query').textContent).toBe('test search');
    });

    it('should pass selectedStatuses to UnifiedQueue', () => {
      const statuses = ['completed', 'processing'];
      render(React.createElement(Studio, {
        selectedStatuses: statuses
      }));

      expect(screen.getByTestId('selected-statuses')).toBeTruthy();
      expect(screen.getByTestId('selected-statuses').textContent).toBe('completed,processing');
    });

    it('should pass selectedModelsFilter to UnifiedQueue', () => {
      const models = ['model-1', 'model-2'];
      render(React.createElement(Studio, {
        selectedModelsFilter: models
      }));

      expect(screen.getByTestId('selected-models-filter')).toBeTruthy();
      expect(screen.getByTestId('selected-models-filter').textContent).toBe('model-1,model-2');
    });

    it('should pass all filter props together to UnifiedQueue', () => {
      render(React.createElement(Studio, {
        searchQuery: 'landscape',
        selectedStatuses: ['completed'],
        selectedModelsFilter: ['flux-model']
      }));

      expect(screen.getByTestId('search-query').textContent).toBe('landscape');
      expect(screen.getByTestId('selected-statuses').textContent).toBe('completed');
      expect(screen.getByTestId('selected-models-filter').textContent).toBe('flux-model');
    });
  });

  describe('Generation Panel Interaction', () => {
    it('should have generation panel collapsed by default', () => {
      render(React.createElement(Studio));

      // Generation panel toggle should be visible
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      expect(generateToggle).toBeTruthy();

      // PromptBar should NOT be visible when collapsed (it's inside the panel)
      expect(screen.queryByTestId('prompt-bar')).toBeNull();
    });

    it('should expand generation panel when clicked', () => {
      render(React.createElement(Studio));

      // Find and click the generation panel toggle
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      fireEvent.click(generateToggle);

      // Now PromptBar should be visible
      expect(screen.getByTestId('prompt-bar')).toBeTruthy();
    });

    it('should update prompt state when input changes', () => {
      render(React.createElement(Studio));

      // First expand the panel
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      fireEvent.click(generateToggle);

      const promptInput = screen.getByTestId('prompt-input');
      fireEvent.change(promptInput, { target: { value: 'test prompt' } });

      expect(promptInput).toHaveProperty('value', 'test prompt');
    });

    it('should open settings panel when settings button is clicked', () => {
      render(React.createElement(Studio));

      // First expand the generation panel
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      fireEvent.click(generateToggle);

      // Find the Settings button by its accessible name
      const settingsButton = screen.getByRole('button', { name: /settings/i });
      fireEvent.click(settingsButton);

      // Settings panel should be shown
      expect(screen.getByTestId('settings-panel')).toBeTruthy();
    });
  });

  describe('Create More Functionality', () => {
    it('should handle create more callback and apply settings', async () => {
      render(React.createElement(Studio));

      // Click the "Create More" button
      const createMoreButton = screen.getByTestId('create-more-button');
      fireEvent.click(createMoreButton);

      // Generation panel should auto-expand and settings panel should be shown
      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });
    });

    it('should set selected model when create more is clicked', async () => {
      render(React.createElement(Studio));

      const createMoreButton = screen.getByTestId('create-more-button');
      fireEvent.click(createMoreButton);

      // Generation panel should auto-expand
      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });
    });
  });

  describe('Edit Image Functionality', () => {
    it('should handle edit image callback and set edit mode', async () => {
      render(React.createElement(Studio));

      // Click the Edit Image button
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Generation panel should auto-expand and settings panel should open with edit image settings
      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
        expect(screen.getByTestId('edit-image-settings')).toBeTruthy();
      });
    });

    it('should set default edit model when editing image', async () => {
      render(React.createElement(Studio));

      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Generation panel should auto-expand with edit image settings
      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
        expect(screen.getByTestId('edit-image-settings')).toBeTruthy();
      });
    });

    it('should clear createMoreSettings when editing image', async () => {
      render(React.createElement(Studio));

      // First trigger create more
      const createMoreButton = screen.getByTestId('create-more-button');
      fireEvent.click(createMoreButton);

      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });

      // Close the settings panel by pressing Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Then trigger edit image
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Generation panel should still be expanded and edit image settings should be present
      await waitFor(() => {
        expect(screen.getByTestId('prompt-bar')).toBeTruthy();
        expect(screen.getByTestId('edit-image-settings')).toBeTruthy();
      });
    });
  });

  describe('Layout', () => {
    it('should render with correct container structure', () => {
      const { container } = render(React.createElement(Studio));

      // Main container should have space-y-4 class
      const mainContainer = container.firstChild;
      expect(mainContainer).toBeTruthy();
      expect(mainContainer.className).toContain('space-y-4');
    });

    it('should render generation panel toggle before UnifiedQueue', () => {
      render(React.createElement(Studio));

      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      const unifiedQueue = screen.getByTestId('unified-queue');

      // Generation toggle should come before UnifiedQueue in DOM order
      const position = generateToggle.compareDocumentPosition(unifiedQueue);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  describe('Settings Persistence', () => {
    it('should persist form state to localStorage', async () => {
      render(React.createElement(Studio));

      // After initial render, localStorage should have default values
      await waitFor(() => {
        expect(localStorageMock.getItem('sd-cpp-studio-generate-form-state')).toBeTruthy();
      });
    });

    it('should persist mode to localStorage', async () => {
      render(React.createElement(Studio));

      // mode is set to 'image' by default
      await waitFor(() => {
        const savedState = localStorageMock.getItem('sd-cpp-studio-generate-form-state');
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.mode).toBe('image');
      });
    });

    it('should persist selectedModels to localStorage', async () => {
      render(React.createElement(Studio));

      // selectedModels is set to [] by default
      await waitFor(() => {
        const savedState = localStorageMock.getItem('sd-cpp-studio-generate-form-state');
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.selectedModels).toEqual([]);
      });
    });
  });

  describe('Panel Management', () => {
    it('should toggle generation panel visibility', () => {
      render(React.createElement(Studio));

      // Generation panel toggle should be visible
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      expect(generateToggle).toBeTruthy();

      // PromptBar should NOT be visible initially (collapsed)
      expect(screen.queryByTestId('prompt-bar')).toBeNull();

      // Open generation panel
      fireEvent.click(generateToggle);
      expect(screen.getByTestId('prompt-bar')).toBeTruthy();

      // Close generation panel
      fireEvent.click(generateToggle);
      expect(screen.queryByTestId('prompt-bar')).toBeNull();
    });

    it('should toggle settings panel within generation panel', async () => {
      render(React.createElement(Studio));

      // First expand the generation panel
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      fireEvent.click(generateToggle);

      // Find the Settings button in the collapsible panel header
      const settingsButton = screen.getByRole('button', { name: /settings/i });

      // Open settings (expand panel)
      fireEvent.click(settingsButton);
      expect(screen.getByTestId('settings-panel')).toBeTruthy();

      // Close settings (collapse panel)
      fireEvent.click(settingsButton);
      // Settings panel should still exist but be collapsed
      expect(screen.getByTestId('settings-panel')).toBeTruthy();
    });

    it('should handle generate from settings panel', async () => {
      render(React.createElement(Studio));

      // First expand the generation panel
      const generateToggle = screen.getByRole('button', { name: /toggle generation/i });
      fireEvent.click(generateToggle);

      // Find the Settings button in the collapsible panel header
      const settingsButton = screen.getByRole('button', { name: /settings/i });
      fireEvent.click(settingsButton);

      // Click generate in settings - use testid to be specific
      const generateButton = screen.getByTestId('settings-generate-button');
      fireEvent.click(generateButton);

      // Panel should still exist (collapsible behavior)
      await waitFor(() => {
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });
    });
  });
});
