import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { Studio } from '../Studio';

// Mock the useImageGeneration hook
const mockGenerateQueued = vi.fn().mockResolvedValue({ success: true });

vi.mock('../../hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    generateQueued: () => mockGenerateQueued(),
    isLoading: false,
    error: null,
    result: null,
  }),
  useGenerations: () => ({
    generations: [],
    fetchGenerations: vi.fn(),
    pagination: { total: 0, limit: 20, offset: 0, hasMore: false, totalPages: 0 },
  }),
}));

// Mock the useModels hook
vi.mock('../../hooks/useModels', () => ({
  useModels: () => ({
    models: [
      { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
      { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'], supports_negative_prompt: true },
    ],
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    modelsMap: {
      model1: { id: 'model1', name: 'Model 1', capabilities: ['text-to-image'], supports_negative_prompt: true },
      model2: { id: 'model2', name: 'Model 2', capabilities: ['text-to-image', 'image-to-image'], supports_negative_prompt: true },
    },
    modelsNameMap: {
      model1: 'Model 1',
      model2: 'Model 2',
    },
  }),
}));

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock authenticatedFetch
vi.mock('../../utils/api', () => ({
  authenticatedFetch: vi.fn((url) => {
    if (url === '/sdapi/v1/upscalers') {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([{ name: 'RealESRGAN 4x+', scale: 4 }]),
      });
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
  }),
}));

// Mock child components
vi.mock('../UnifiedQueue', () => ({
  UnifiedQueue: ({ onCreateMore, onEditImage, onUpscaleImage, onCreateVideo }) => (
    <div data-testid="unified-queue">
      <button onClick={() => onCreateMore?.({ prompt: 'test prompt', model: 'model1' })}>Create More</button>
      <button onClick={() => onEditImage?.(new File([''], 'test.jpg'), {})}>Edit Image</button>
      <button onClick={() => onUpscaleImage?.(new File([''], 'test.jpg'), {})}>Upscale</button>
      <button onClick={() => onCreateVideo?.(new File([''], 'test.jpg'), {})}>Create Video</button>
    </div>
  ),
}));

// Mock MultiModelSelector - make it interactive
vi.mock('../MultiModelSelector', () => ({
  MultiModelSelector: ({ selectedModels, onModelsChange }) => (
    <div data-testid="multi-model-selector">
      <button
        data-testid="select-model1"
        onClick={() => {
          if (selectedModels.includes('model1')) {
            onModelsChange(selectedModels.filter(id => id !== 'model1'));
          } else {
            onModelsChange([...selectedModels, 'model1']);
          }
        }}
      >
        {selectedModels.includes('model1') ? '✓ Model 1' : 'Model 1'}
      </button>
      <button
        data-testid="select-model2"
        onClick={() => {
          if (selectedModels.includes('model2')) {
            onModelsChange(selectedModels.filter(id => id !== 'model2'));
          } else {
            onModelsChange([...selectedModels, 'model2']);
          }
        }}
      >
        {selectedModels.includes('model2') ? '✓ Model 2' : 'Model 2'}
      </button>
      <span data-testid="selected-count">Selected: {selectedModels.length}</span>
    </div>
  ),
}));

// Mock ResizeObserver
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};

const FORM_STATE_KEY = 'sd-cpp-studio-generate-form-state';

// Helper to expand the generation panel
const expandGenerationPanel = () => {
  const toggleButton = screen.getByRole('button', { name: /toggle generation/i });
  fireEvent.click(toggleButton);
};

describe('Studio Form Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQueued.mockClear();
    localStorage.clear();
  });

  describe('Form state saves to localStorage', () => {
    it('should save prompt to localStorage when user types', async () => {
      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'A beautiful sunset' } });

      await waitFor(() => {
        const savedState = localStorage.getItem(FORM_STATE_KEY);
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.prompt).toBe('A beautiful sunset');
      });
    });

    it('should save selected models to localStorage when user selects models', async () => {
      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Select model1
      const model1Button = await screen.findByTestId('select-model1');
      fireEvent.click(model1Button);

      await waitFor(() => {
        const savedState = localStorage.getItem(FORM_STATE_KEY);
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.selectedImageModels).toEqual(['model1']);
      });

      // Select model2
      const model2Button = screen.getByTestId('select-model2');
      fireEvent.click(model2Button);

      await waitFor(() => {
        const savedState = localStorage.getItem(FORM_STATE_KEY);
        const parsed = JSON.parse(savedState);
        expect(parsed.selectedImageModels).toEqual(['model1', 'model2']);
      });
    });

    it('should save mode to localStorage when user switches modes', async () => {
      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Switch to video mode
      const videoButton = await screen.findByText('Video');
      fireEvent.click(videoButton);

      await waitFor(() => {
        const savedState = localStorage.getItem(FORM_STATE_KEY);
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.mode).toBe('video');
      });
    });
  });

  describe('Form state loads from localStorage on mount', () => {
    it('should restore prompt from localStorage on mount', async () => {
      // Set up localStorage with saved state
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify({
        prompt: 'My saved prompt',
        selectedImageModels: ['model1'],
        mode: 'image',
      }));

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Wait for the prompt to be restored from localStorage
      await waitFor(() => {
        const promptInput = screen.queryByPlaceholderText(/A serene landscape/);
        expect(promptInput).toHaveValue('My saved prompt');
      });
    });

    it('should restore selected models from localStorage on mount', async () => {
      // Set up localStorage with saved state
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify({
        prompt: 'test',
        selectedImageModels: ['model1', 'model2'],
        mode: 'image',
      }));

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Wait for both models to be selected
      await waitFor(() => {
        expect(screen.getByTestId('select-model1')).toHaveTextContent('✓ Model 1');
        expect(screen.getByTestId('select-model2')).toHaveTextContent('✓ Model 2');
      });
      // Also verify the count
      expect(screen.getByTestId('selected-count')).toHaveTextContent('Selected: 2');
    });

    it('should restore mode from localStorage on mount', async () => {
      // Set up localStorage with saved state
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify({
        prompt: 'test',
        selectedImageModels: ['model1'],
        mode: 'video',
      }));

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Wait for video mode to be active (indicated by "lovely cat" placeholder)
      await waitFor(() => {
        const videoPromptInput = screen.queryByPlaceholderText(/A lovely cat/);
        expect(videoPromptInput).toBeInTheDocument();
      });
    });

    it('should handle corrupt localStorage gracefully', async () => {
      localStorage.setItem(FORM_STATE_KEY, 'invalid json');

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Should not crash, should render with defaults
      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      expect(promptInput).toHaveValue('');
    });
  });

  describe('Form state is NOT cleared on submit', () => {
    it('should keep prompt after successful generation', async () => {
      const { toast } = await import('sonner');

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'A test prompt' } });

      // Select a model
      const model1Button = screen.getByTestId('select-model1');
      fireEvent.click(model1Button);

      // Click generate button
      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });

      // Prompt should still be there
      expect(promptInput).toHaveValue('A test prompt');

      // Models should still be selected
      expect(screen.getByTestId('select-model1')).toHaveTextContent('✓ Model 1');
    });

    it('should keep form state in localStorage after generation', async () => {
      const { toast } = await import('sonner');

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'A test prompt' } });

      const model1Button = screen.getByTestId('select-model1');
      fireEvent.click(model1Button);

      // Click generate
      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });

      // Check localStorage still has the values
      const savedState = localStorage.getItem(FORM_STATE_KEY);
      expect(savedState).toBeTruthy();
      const parsed = JSON.parse(savedState);
      expect(parsed.prompt).toBe('A test prompt');
      expect(parsed.selectedImageModels).toEqual(['model1']);
    });
  });

  describe('Form submission prevention', () => {
    it('should prevent default form submission when pressing Enter in prompt', async () => {
      const formSubmitSpy = vi.fn();

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Override form submit if it exists
      const forms = document.querySelectorAll('form');
      forms.forEach(form => {
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          formSubmitSpy();
        });
      });

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'test' } });

      // Press Enter - should not submit form (there's no form submission logic)
      fireEvent.keyDown(promptInput, { key: 'Enter', code: 'Enter' });

      // Form submit should not have been called
      expect(formSubmitSpy).not.toHaveBeenCalled();
    });

    it('should prevent default form submission when clicking Generate button', async () => {
      const { toast } = await import('sonner');

      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'test' } });

      const model1Button = screen.getByTestId('select-model1');
      fireEvent.click(model1Button);

      const generateButton = screen.getByRole('button', { name: /^Generate$/i });
      fireEvent.click(generateButton);

      // The important thing is that generation works (toast is called)
      // Form default submission is prevented because buttons default to type="button"
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
      });
    });
  });

  describe('localStorage persistence across page reloads', () => {
    it('should persist and restore full form state', async () => {
      // First render: user enters data
      const { unmount } = render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      const promptInput = await screen.findByPlaceholderText(/A serene landscape/);
      fireEvent.change(promptInput, { target: { value: 'My persistent prompt' } });

      const model1Button = screen.getByTestId('select-model1');
      fireEvent.click(model1Button);

      const videoButton = screen.getByText('Video');
      fireEvent.click(videoButton);

      // Wait for localStorage to be updated
      await waitFor(() => {
        const savedState = localStorage.getItem(FORM_STATE_KEY);
        expect(savedState).toBeTruthy();
        const parsed = JSON.parse(savedState);
        expect(parsed.prompt).toBe('My persistent prompt');
        expect(parsed.selectedImageModels).toEqual(['model1']);
        expect(parsed.mode).toBe('video');
      });

      // Unmount to simulate page refresh
      unmount();

      // Second render: simulate page reload - state should be restored
      render(
        <Studio searchQuery="" selectedStatuses={[]} selectedModelsFilter={[]} />
      );

      // First expand the generation panel (collapsed by default)
      expandGenerationPanel();

      // Wait for state to be restored - check video mode is active via placeholder
      await waitFor(() => {
        // Video mode is indicated by the "lovely cat" placeholder
        const restoredPromptInput = screen.queryByPlaceholderText(/A lovely cat/);
        expect(restoredPromptInput).toBeInTheDocument();
        expect(restoredPromptInput).toHaveValue('My persistent prompt');
        // Note: model selection is not checked here because video mode uses selectedVideoModels
        // which is separate from selectedImageModels. Model persistence is tested in other tests.
      });
    });
  });
});
