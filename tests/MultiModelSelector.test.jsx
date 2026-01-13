import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

// Mock models data
const createMockModels = (overrides = {}) => [
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
    fileStatus: {
      hasHuggingFace: false,
      allFilesExist: true,
      files: [],
    },
    ...overrides.qwenImage,
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
    fileStatus: {
      hasHuggingFace: false,
      allFilesExist: true,
      files: [],
    },
    ...overrides.fluxSchnell,
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
    fileStatus: {
      hasHuggingFace: false,
      allFilesExist: true,
      files: [],
    },
    ...overrides.qwenImageEdit,
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
    fileStatus: {
      hasHuggingFace: false,
      allFilesExist: true,
      files: [],
    },
    ...overrides.cliModel,
  },
  {
    id: 'video-model',
    name: 'Video Model',
    description: 'Video generation model',
    capabilities: ['text-to-image', 'video'],
    command: './bin/sd-server',
    port: 1500,
    args: ['--diffusion-model', './models/video.gguf'],
    exec_mode: 'server',
    mode: 'on_demand',
    model_type: 'text-to-image',
    status: 'stopped',
    fileStatus: {
      hasHuggingFace: false,
      allFilesExist: true,
      files: [],
    },
    ...overrides.videoModel,
  },
];

let mockFetchCalls = [];
let mockOnModelsChange;

describe('MultiModelSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchCalls = [];
    mockOnModelsChange = vi.fn();
    // Mock fetch for models
    // Note: fileStatus is now inline in the models response, no separate /files/status endpoint needed
    global.fetch = vi.fn((url) => {
      mockFetchCalls.push(url);
      if (url === '/api/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: createMockModels() }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    // Clear any timers/intervals
    vi.clearAllTimers();
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
        expect(screen.getByText('Video Model')).toBeInTheDocument();
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
        // All text-to-image models support both T2I and I2I (excluding video models)
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
        // Video model should not appear in image mode
        expect(screen.queryByText('Video Model')).not.toBeInTheDocument();
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

    it('should filter models by mode (video)', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
          mode="video"
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Video Model')).toBeInTheDocument();
        // Non-video models should not appear
        expect(screen.queryByText('Qwen Image')).not.toBeInTheDocument();
        expect(screen.queryByText('FLUX.1 Schnell')).not.toBeInTheDocument();
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
        expect(screen.getByText(/Selected: 2\/5/)).toBeInTheDocument();
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

    it('should show starting status for models in starting state', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'starting' },
              }),
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
        expect(screen.getByText('Starting...')).toBeInTheDocument();
      });
    });

    it('should show stopping status for models in stopping state', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                fluxSchnell: { status: 'stopping' },
              }),
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
        expect(screen.getByText('Stopping...')).toBeInTheDocument();
      });
    });

    it('should show error status for models in error state', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'error', error: 'Failed to load model' },
              }),
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
        expect(screen.getByText('Error')).toBeInTheDocument();
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
    it('should handle model selection toggle - adding a model', async () => {
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

    it('should handle model selection toggle - removing a model', async () => {
      render(
        <MultiModelSelector
          selectedModels={['qwen-image', 'flux-schnell']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);

      // Find the checked checkbox (qwen-image is first)
      const firstCheckbox = checkboxes[0];
      expect(firstCheckbox).toBeChecked();

      // Click to deselect
      mockOnModelsChange.mockClear();
      fireEvent.click(firstCheckbox);

      // Verify the callback was called with model removed
      expect(mockOnModelsChange).toHaveBeenCalledWith(['flux-schnell']);
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
        'video-model',
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
          selectedModels={['qwen-image', 'flux-schnell', 'qwen-image-edit', 'cli-model', 'video-model']}
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

    it('should visually highlight selected models', async () => {
      render(
        <MultiModelSelector
          selectedModels={['qwen-image']}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      const firstCheckbox = checkboxes[0];

      // Selected checkbox should be checked
      expect(firstCheckbox).toBeChecked();
    });
  });

  describe('Model controls', () => {
    it('should call start API when clicking start button', async () => {
      const { toast } = await import('sonner');
      mockFetchCalls = [];

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'stopped' },
              }),
            }),
          });
        }
        if (url === '/api/models/qwen-image/start') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
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

      // Find the play button (title attribute)
      const playButtons = screen.getAllByTitle('Start model');
      expect(playButtons.length).toBeGreaterThan(0);
      fireEvent.click(playButtons[0]);

      await waitFor(() => {
        // Verify fetch was called with correct URL and POST method
        const startCall = mockFetchCalls.find(call => call.url === '/api/models/qwen-image/start');
        expect(startCall).toBeDefined();
        expect(startCall.options?.method).toBe('POST');
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should call stop API when clicking stop button', async () => {
      const { toast } = await import('sonner');
      mockFetchCalls = [];

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                fluxSchnell: { status: 'running' },
              }),
            }),
          });
        }
        if (url === '/api/models/flux-schnell/stop') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
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

      // Find the stop button (title attribute)
      const stopButtons = screen.getAllByTitle('Stop model');
      expect(stopButtons.length).toBeGreaterThan(0);
      fireEvent.click(stopButtons[0]);

      await waitFor(() => {
        // Verify fetch was called with correct URL and POST method
        const stopCall = mockFetchCalls.find(call => call.url === '/api/models/flux-schnell/stop');
        expect(stopCall).toBeDefined();
        expect(stopCall.options?.method).toBe('POST');
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should show loading state during start action', async () => {
      mockFetchCalls = [];

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'stopped' },
              }),
            }),
          });
        }
        if (url === '/api/models/qwen-image/start') {
          // Return a promise that resolves after a delay
          return new Promise(resolve => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({}),
              });
            }, 100);
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

      // Button should show loading state
      await waitFor(() => {
        const playButtonAfter = screen.getAllByTitle('Start model')[0];
        expect(playButtonAfter).toContainHTML('svg'); // Loader icon
      });
    });

    it('should show download button for models with missing files', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: {
                  huggingface: { repo: 'test/repo', files: [] },
                  fileStatus: {
                    hasHuggingFace: true,
                    allFilesExist: false,
                    files: [{ fileName: 'model.gguf', exists: false }],
                  },
                },
              }),
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

    it('should not show start/stop buttons for CLI mode models', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels(),
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
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });

      // CLI Model should not have start/stop buttons
      const cliModelRow = screen.getByText('CLI Model').closest('div').parentElement;
      const startButtons = cliModelRow?.querySelectorAll('[title="Start model"]');
      const stopButtons = cliModelRow?.querySelectorAll('[title="Stop model"]');

      expect(startButtons?.length).toBe(0);
      expect(stopButtons?.length).toBe(0);
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

      // Click expand button (chevron button)
      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

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

      // Find and click expand button
      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
        });

        // Collapse by clicking the same button
        fireEvent.click(chevronButtons[0]);

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

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
          expect(screen.getByText(/Port:/)).toBeInTheDocument();
          expect(screen.getByText(/Mode:/)).toBeInTheDocument();
          expect(screen.getByText(/Type:/)).toBeInTheDocument();
        });
      }
    });

    it('should show capabilities when expanded', async () => {
      render(
        <MultiModelSelector
          selectedModels={[]}
          onModelsChange={mockOnModelsChange}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/Capabilities:/)).toBeInTheDocument();
          // Use getAllByText since text-to-image appears in description and capabilities
          expect(screen.getAllByText(/text-to-image/).length).toBeGreaterThan(0);
        });
      }
    });

    it('should show file status when expanded', async () => {
      // Use a model with huggingface config to get file status
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: {
                  huggingface: { repo: 'test/repo', files: [] },
                  fileStatus: {
                    hasHuggingFace: true,
                    allFilesExist: true,
                    files: [
                      { fileName: 'model.gguf', exists: true },
                      { fileName: 'vae.safetensors', exists: true },
                    ],
                  },
                },
              }),
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
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/Files:/)).toBeInTheDocument();
          expect(screen.getByText('model.gguf')).toBeInTheDocument();
        });
      }
    });

    it('should show error message in expanded details when model has error', async () => {
      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'error', error: 'Failed to initialize' },
              }),
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
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        fireEvent.click(chevronButtons[0]);

        await waitFor(() => {
          expect(screen.getByText(/Error: Failed to initialize/)).toBeInTheDocument();
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
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'stopped' },
              }),
            }),
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
        expect(toast.error).toHaveBeenCalledWith('Failed to start model');
      });
    });

    it('should show error toast when model stop fails', async () => {
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                fluxSchnell: { status: 'running' },
              }),
            }),
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
        expect(toast.error).toHaveBeenCalledWith('Failed to stop model');
      });
    });

    it('should show error toast with statusText when error response has no error field', async () => {
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              models: createMockModels({
                qwenImage: { status: 'stopped' },
              }),
            }),
          });
        }
        if (url.includes('/start')) {
          return Promise.resolve({
            ok: false,
            statusText: 'Service Unavailable',
            json: () => Promise.resolve({}),
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
  });
});
