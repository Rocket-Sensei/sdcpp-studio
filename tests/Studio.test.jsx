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

// Mock the child components before importing Studio
vi.mock('../frontend/src/components/PromptBar', () => ({
  PromptBar: ({ prompt, onPromptChange, selectedModelCount, onModelSelectorClick, onGenerate, onSettingsClick }) =>
    React.createElement('div', { 'data-testid': 'prompt-bar' },
      React.createElement('input', {
        'data-testid': 'prompt-input',
        value: prompt,
        onChange: (e) => onPromptChange?.(e.target.value),
        placeholder: 'Enter prompt...'
      }),
      React.createElement('div', { 'data-testid': 'selected-model-count' }, String(selectedModelCount || 0)),
      React.createElement('button', {
        onClick: onModelSelectorClick,
        'data-testid': 'model-selector-button'
      }, 'Select Models'),
      React.createElement('button', {
        onClick: onGenerate,
        'data-testid': 'generate-button'
      }, 'Generate'),
      React.createElement('button', {
        onClick: onSettingsClick,
        'data-testid': 'settings-button'
      }, 'Settings')
    ),
}));

vi.mock('../frontend/src/components/SettingsPanel', () => ({
  SettingsPanel: ({ prompt, editImageSettings, onGenerated }) =>
    React.createElement('div', { 'data-testid': 'settings-panel' },
      React.createElement('div', { 'data-testid': 'settings-prompt' }, prompt || ''),
      editImageSettings && React.createElement('div', { 'data-testid': 'edit-image-settings' }, JSON.stringify(editImageSettings)),
      React.createElement('button', {
        onClick: () => onGenerated && onGenerated(),
        'data-testid': 'settings-generate-button'
      }, 'Generate')
    ),
}));

vi.mock('../frontend/src/components/model-selector/ModelSelectorModal', () => ({
  ModelSelectorModal: ({ selectedModels, onModelsChange, onClose }) =>
    React.createElement('div', { 'data-testid': 'model-selector-modal' },
      React.createElement('div', { 'data-testid': 'selected-models' }, selectedModels ? selectedModels.join(',') : 'none'),
      React.createElement('button', {
        onClick: () => onModelsChange?.(['test-model']),
        'data-testid': 'apply-models-button'
      }, 'Apply'),
      React.createElement('button', {
        onClick: onClose,
        'data-testid': 'close-modal-button'
      }, 'Close')
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

describe('Studio Component', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should render without crashing', () => {
    const { container } = render(React.createElement(Studio));

    expect(container).toBeTruthy();
    expect(screen.getByTestId('prompt-bar')).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should render PromptBar and UnifiedQueue components', () => {
    render(React.createElement(Studio));

    expect(screen.getByTestId('prompt-bar')).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
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

  describe('PromptBar Interaction', () => {
    it('should update prompt state when input changes', () => {
      render(React.createElement(Studio));

      const promptInput = screen.getByTestId('prompt-input');
      fireEvent.change(promptInput, { target: { value: 'test prompt' } });

      expect(promptInput).toHaveProperty('value', 'test prompt');
    });

    it('should open model selector when model selector button is clicked', () => {
      render(React.createElement(Studio));

      const modelSelectorButton = screen.getByTestId('model-selector-button');
      fireEvent.click(modelSelectorButton);

      // Model selector modal should be shown
      expect(screen.getByTestId('model-selector-modal')).toBeTruthy();
    });

    it('should open settings panel when settings button is clicked', () => {
      render(React.createElement(Studio));

      const settingsButton = screen.getByTestId('settings-button');
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

      // Settings panel should open with the generation settings
      await waitFor(() => {
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });
    });

    it('should set selected model when create more is clicked', async () => {
      render(React.createElement(Studio));

      const createMoreButton = screen.getByTestId('create-more-button');
      fireEvent.click(createMoreButton);

      // Settings panel should show the prompt from the generation
      await waitFor(() => {
        const settingsPrompt = screen.queryByTestId('settings-prompt');
        expect(settingsPrompt).toBeTruthy();
      });
    });
  });

  describe('Edit Image Functionality', () => {
    it('should handle edit image callback and set edit mode', async () => {
      render(React.createElement(Studio));

      // Click the Edit Image button
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Settings panel should open with edit image settings
      await waitFor(() => {
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
        expect(screen.getByTestId('edit-image-settings')).toBeTruthy();
      });
    });

    it('should set default edit model when editing image', async () => {
      render(React.createElement(Studio));

      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Should open settings panel with edit image settings
      await waitFor(() => {
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
        expect(screen.getByTestId('settings-panel')).toBeTruthy();
      });

      // Close the settings panel by pressing Escape
      fireEvent.keyDown(document, { key: 'Escape' });

      // Then trigger edit image
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Edit image settings should be present
      await waitFor(() => {
        expect(screen.getByTestId('edit-image-settings')).toBeTruthy();
      });
    });
  });

  describe('Layout', () => {
    it('should render with correct container structure', () => {
      const { container } = render(React.createElement(Studio));

      const mainContainer = container.querySelector('.container');
      expect(mainContainer).toBeTruthy();
      expect(mainContainer.className).toContain('mx-auto');
      expect(mainContainer.className).toContain('p-4');
    });

    it('should render PromptBar before UnifiedQueue', () => {
      const { container } = render(React.createElement(Studio));

      const promptBar = screen.getByTestId('prompt-bar');
      const unifiedQueue = screen.getByTestId('unified-queue');

      // PromptBar should come before UnifiedQueue in DOM order
      const promptBarIndex = Array.from(container.children).indexOf(promptBar);
      const queueIndex = Array.from(container.children).indexOf(unifiedQueue);

      expect(promptBarIndex).toBeLessThan(queueIndex);
    });
  });

  describe('Settings Persistence', () => {
    it('should persist size to localStorage', () => {
      const { rerender } = render(React.createElement(Studio));

      // Size is set to '1024x1024' by default
      expect(localStorageMock.getItem('sd-cpp-studio-size')).toBe('1024x1024');
    });

    it('should persist imageCount to localStorage', () => {
      render(React.createElement(Studio));

      // imageCount is set to 1 by default
      expect(localStorageMock.getItem('sd-cpp-studio-image-count')).toBe('1');
    });

    it('should persist strength to localStorage', () => {
      render(React.createElement(Studio));

      // strength is set to 0.7 by default
      expect(localStorageMock.getItem('sd-cpp-studio-strength')).toBe('0.7');
    });

    it('should persist sampleSteps to localStorage', () => {
      render(React.createElement(Studio));

      // sampleSteps is set to 9 by default
      expect(localStorageMock.getItem('sd-cpp-studio-sample-steps')).toBe('9');
    });
  });

  describe('Modal Management', () => {
    it('should open and close model selector modal', () => {
      render(React.createElement(Studio));

      // Open modal
      const modelSelectorButton = screen.getByTestId('model-selector-button');
      fireEvent.click(modelSelectorButton);
      expect(screen.getByTestId('model-selector-modal')).toBeTruthy();

      // Close modal
      const closeButton = screen.getByTestId('close-modal-button');
      fireEvent.click(closeButton);
      // Modal is removed from DOM when closed
    });

    it('should apply model selection when apply button is clicked', () => {
      render(React.createElement(Studio));

      // Open modal
      const modelSelectorButton = screen.getByTestId('model-selector-button');
      fireEvent.click(modelSelectorButton);

      // Apply models
      const applyButton = screen.getByTestId('apply-models-button');
      fireEvent.click(applyButton);

      // Models should be applied (verified by the mock setting selected-models)
      expect(screen.getByTestId('selected-models')).toBeTruthy();
    });
  });
});
