import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MultiModelSelector } from '../frontend/src/components/MultiModelSelector';

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

const mockOnModelsChange = vi.fn();

// Mock models data
const mockModels = [
  {
    id: 'qwen-image',
    name: 'Qwen Image',
    description: 'Advanced text-to-image model',
    capabilities: ['text-to-image'],
    command: './bin/sd-server',
    port: 1400,
    args: ['--diffusion-model', './models/qwen.gguf', '--steps', '9'],
    exec_mode: 'server',
    mode: 'on_demand',
    model_type: 'text-to-image',
    status: 'stopped',
  },
  {
    id: 'flux-schnell',
    name: 'FLUX.1 Schnell',
    description: 'Fast text-to-image model',
    capabilities: ['text-to-image'],
    command: './bin/sd-server',
    port: 1409,
    args: ['--diffusion-model', './models/flux.gguf', '--steps', '4'],
    exec_mode: 'server',
    mode: 'on_demand',
    model_type: 'text-to-image',
    status: 'running',
  },
  {
    id: 'qwen-image-edit',
    name: 'Qwen Image Edit',
    description: 'Image editing with instructions',
    capabilities: ['text-to-image', 'imgedit'],
    command: './bin/sd-server',
    port: 1401,
    args: ['--diffusion-model', './models/qwen-edit.gguf', '--llm', './models/llm.gguf'],
    exec_mode: 'server',
    mode: 'on_demand',
    model_type: 'imgedit',
    status: 'stopped',
  },
  {
    id: 'cli-model',
    name: 'CLI Model',
    description: 'CLI mode model',
    capabilities: ['text-to-image'],
    command: './bin/sd-cli',
    exec_mode: 'cli',
    mode: 'on_demand',
    model_type: 'text-to-image',
    status: 'stopped',
  },
];

describe('MultiModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock fetch for models
    global.fetch = vi.fn((url) => {
      if (url === '/api/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: mockModels }),
        });
      }
      if (url.startsWith('/api/models/') && url.endsWith('/files/status')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            allFilesExist: true,
            files: [
              { fileName: 'model.gguf', exists: true },
              { fileName: 'vae.safetensors', exists: true },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  describe('Rendering', () => {
    it('should render all models when no filter applied', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });
    });

    it('should filter models by capability (text-to-image)', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          filterCapabilities={['text-to-image']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });
    });

    it('should filter models by capability (imgedit)', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          filterCapabilities={['imgedit']}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
      });
    });

    it('should filter models by mode (image)', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="image"
        />
      );

      await waitFor(() => {
        // All text-to-image models support both T2I and I2I
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });
    });

    it('should filter models by mode (imgedit) - instruction-based models only', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="imgedit"
        />
      );

      await waitFor(() => {
        // qwen-image-edit has --llm arg and 'edit' in id
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
      });
    });

    it('should show no models for upscale mode', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="upscale"
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/No models configured for upscale mode/)).toBeInTheDocument();
      });
    });

    it('should show loading state while fetching', () => {
      global.fetch = vi.fn(() => new Promise(() => {})); // Never resolves

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      expect(screen.getByText(/Loading models\.\.\./)).toBeInTheDocument();
    });

    it('should show selected count', async () => {
      render(
        <MultiModelSelector
          selectedModels={['qwen-image', 'flux-schnell']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/Selected: 2\/4/)).toBeInTheDocument();
      });
    });

    it('should show correct status indicators', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument();
        expect(screen.getAllByText('Stopped').length).toBeGreaterThan(0);
      });
    });

    it('should show CLI badge for CLI mode models', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        const cliBadges = screen.getAllByText('CLI');
        expect(cliBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Model selection', () => {
    it('should handle model selection toggle', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);

      // Click first checkbox - should add qwen-image to selection
      mockOnModelsChange.mockClear();
      fireEvent.click(checkboxes[0]);
      // Verify the callback was called with the model added
      expect(mockOnModelsChange).toHaveBeenCalledWith(['qwen-image']);
    });

    it('should select all models', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Select All')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByText('Select All');
      fireEvent.click(selectAllButton);

      expect(mockOnModelsChange).toHaveBeenCalledWith([
        'qwen-image',
        'flux-schnell',
        'qwen-image-edit',
        'cli-model',
      ]);
    });

    it('should deselect all models', async () => {
      render(
        <MultiModelSelector
          selectedModels={['qwen-image', 'flux-schnell']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Deselect All')).toBeInTheDocument();
      });

      const deselectAllButton = screen.getByText('Deselect All');
      fireEvent.click(deselectAllButton);

      expect(mockOnModelsChange).toHaveBeenCalledWith([]);
    });

    it('should disable Select All when all models are selected', async () => {
      render(
        <MultiModelSelector
          selectedModels={['qwen-image', 'flux-schnell', 'qwen-image-edit', 'cli-model']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        const selectAllButton = screen.getByText('Select All');
        expect(selectAllButton).toBeDisabled();
      });
    });

    it('should disable Deselect All when no models are selected', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        const deselectAllButton = screen.getByText('Deselect All');
        expect(deselectAllButton).toBeDisabled();
      });
    });
  });

  describe('Model controls', () => {
    it('should call onStart when clicking load button', async () => {
      const { toast } = await import('sonner');
      let startCalled = false;

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [mockModels[0]] }),
          });
        }
        if (url === '/api/models/qwen-image/start') {
          startCalled = true;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      // Find the play button (title attribute)
      const playButtons = screen.getAllByTitle('Start model');
      expect(playButtons.length).toBeGreaterThan(0);
      fireEvent.click(playButtons[0]);

      await waitFor(() => {
        expect(startCalled).toBe(true);
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should call onStop when clicking unload button', async () => {
      const { toast } = await import('sonner');
      let stopCalled = false;

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [mockModels[1]] }),
          });
        }
        if (url === '/api/models/flux-schnell/stop') {
          stopCalled = true;
          return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
      });

      // Find the stop button (title attribute)
      const stopButtons = screen.getAllByTitle('Stop model');
      expect(stopButtons.length).toBeGreaterThan(0);
      fireEvent.click(stopButtons[0]);

      await waitFor(() => {
        expect(stopCalled).toBe(true);
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should show download button for models with missing files', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: [{
                ...mockModels[0],
                huggingface: { repo: 'test/repo', files: [] },
              }],
            }),
          });
        }
        if (url.includes('/files/status')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              allFilesExist: false,
              files: [{ fileName: 'model.gguf', exists: false }],
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Download')).toBeInTheDocument();
      });
    });
  });

  describe('Expand/collapse functionality', () => {
    it('should expand model when clicking expand button', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      // Initially description should not be visible
      expect(screen.queryByText('Description:')).not.toBeInTheDocument();

      // Click expand button (chevron right)
      const expandButtons = screen.getAllByRole('button');
      const chevronButton = expandButtons.find(btn => btn.querySelector('svg'));
      if (chevronButton) {
        fireEvent.click(chevronButton);

        // Now description should be visible
        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
        });
      }
    });

    it('should collapse model when clicking collapse button', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      // Expand first
      const expandButtons = screen.getAllByRole('button');
      const chevronButton = expandButtons.find(btn => btn.querySelector('svg'));
      if (chevronButton) {
        fireEvent.click(chevronButton);

        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
        });

        // Collapse
        fireEvent.click(chevronButton);

        await waitFor(() => {
          expect(screen.queryByText('Description:')).not.toBeInTheDocument();
        });
      }
    });

    it('should show model details when expanded', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const expandButtons = screen.getAllByRole('button');
      const chevronButton = expandButtons.find(btn => btn.querySelector('svg'));
      if (chevronButton) {
        fireEvent.click(chevronButton);

        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
          expect(screen.getByText('Port:')).toBeInTheDocument();
          expect(screen.getByText('Mode:')).toBeInTheDocument();
          expect(screen.getByText('Type:')).toBeInTheDocument();
        });
      }
    });
  });

  describe('Empty states', () => {
    it('should show no models available message when models list is empty', async () => {
      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      }));

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText(/No models configured/)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should show error toast when model start fails', async () => {
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [mockModels[0]] }),
          });
        }
        if (url.includes('/start')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Failed to start model' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const playButtons = screen.getAllByTitle('Start model');
      fireEvent.click(playButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });

    it('should show error toast when model stop fails', async () => {
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ models: [mockModels[1]] }),
          });
        }
        if (url.includes('/stop')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Internal Server Error',
            json: () => Promise.resolve({ error: 'Failed to stop model' }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
      });

      const stopButtons = screen.getAllByTitle('Stop model');
      fireEvent.click(stopButtons[0]);

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });
});
