import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
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

// Mock authenticatedFetch
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: vi.fn((url, options) => global.fetch(url, options)),
  getStoredApiKey: vi.fn(() => null),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
}));

// Mock the toast function
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
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

// Mock useMemoryEstimate hook
vi.mock('../frontend/src/hooks/useMemoryEstimate', () => ({
  useMemoryEstimate: vi.fn(() => ({
    estimate: {
      cli: { usage: { peakVramMB: 2662 } },
      availableVramMB: 6800,
    },
    loading: false,
    error: null,
    refetch: vi.fn(),
  })),
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
    capabilities: ['text-to-image', 'video'],
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
    localStorageMock.clear();

    // Mock fetch for models (v1 API - OpenRouter format)
    global.fetch = vi.fn((url) => {
      mockFetchCalls.push(url);
      if (url === '/api/v1/models') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            object: 'list',
            data: createMockModels()
          }),
        });
      }
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('Rendering', () => {
    it('should render all models when no filter applied', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
        expect(screen.getByText('Video Model')).toBeInTheDocument();
      });
    });

    it('should filter models by capability (text-to-image)', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            filterCapabilities: ['text-to-image'],
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });
    });

    it('should filter models by capability (imgedit)', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            filterCapabilities: ['imgedit'],
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
      });
    });

    it('should filter models by mode (image)', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            mode: 'image',
          })
        );
      });

      await waitFor(() => {
        // All text-to-image models support both T2I and I2I (excluding video models)
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
        // CLI Model has video capability so it's excluded from image mode
        expect(screen.queryByText('CLI Model')).not.toBeInTheDocument();
        // Video model should not appear in image mode
        expect(screen.queryByText('Video Model')).not.toBeInTheDocument();
      });
    });

    it('should filter models by mode (imgedit) - instruction-based models only', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            mode: 'imgedit',
          })
        );
      });

      await waitFor(() => {
        // qwen-image-edit has --llm arg and 'edit' in id
        expect(screen.getByText('Qwen Image Edit')).toBeInTheDocument();
      });
    });

    it('should filter models by mode (video)', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            mode: 'video',
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Video Model')).toBeInTheDocument();
        // Non-video models should not appear
        expect(screen.queryByText('Qwen Image')).not.toBeInTheDocument();
        expect(screen.queryByText('FLUX.1 Schnell')).not.toBeInTheDocument();
      });
    });

    it('should show no models for upscale mode', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
            mode: 'upscale',
          })
        );
      });

      // MultiModelSelector returns null for upscale mode
      await waitFor(() => {
        expect(screen.queryByText(/No models configured for upscale mode/)).not.toBeInTheDocument();
      });
    });

    it('should show loading state while fetching', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn(() => new Promise(() => {})); // Never resolves

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      expect(screen.getByText(/Loading models\.\.\./)).toBeInTheDocument();
    });

    it('should show selected count', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image', 'flux-schnell'],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        // Format is: selectedCount/totalCount
        // All 5 models are shown when no mode filter is applied
        expect(screen.getByText('2/5')).toBeInTheDocument();
      });
    });

    it('should show correct status indicators', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Running')).toBeInTheDocument();
        expect(screen.getAllByText('Stopped').length).toBeGreaterThan(0);
      });
    });

    it('should show starting status for models in starting state', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
                qwenImage: { status: 'starting' },
              }),
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Starting...')).toBeInTheDocument();
      });
    });

    it('should show stopping status for models in stopping state', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
                fluxSchnell: { status: 'stopping' },
              }),
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Stopping...')).toBeInTheDocument();
      });
    });

    it('should show error status for models in error state', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
                qwenImage: { status: 'error', error: 'Failed to load model' },
              }),
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Error')).toBeInTheDocument();
      });
    });

    it('should show CLI badge for CLI mode models', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        const cliBadges = screen.getAllByText('CLI');
        expect(cliBadges.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Model selection', () => {
    it('should handle model selection toggle - adding a model', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const checkboxes = screen.getAllByRole('checkbox');
      expect(checkboxes.length).toBeGreaterThan(0);

      // Click first checkbox - should add qwen-image to selection
      mockOnModelsChange.mockClear();
      await act(async () => {
        fireEvent.click(checkboxes[0]);
      });

      // Verify the callback was called with the model added
      expect(mockOnModelsChange).toHaveBeenCalledWith(['qwen-image']);
    });

    it('should handle model selection toggle - removing a model', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image', 'flux-schnell'],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

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
      await act(async () => {
        fireEvent.click(firstCheckbox);
      });

      // Verify the callback was called with model removed
      expect(mockOnModelsChange).toHaveBeenCalledWith(['flux-schnell']);
    });

    it('should select all models', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      const selectAllButton = screen.getByText('All');
      await act(async () => {
        fireEvent.click(selectAllButton);
      });

      // Should select all visible models (excluding video when no mode is set)
      expect(mockOnModelsChange).toHaveBeenCalled();
    });

    it('should deselect all models', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image', 'flux-schnell'],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('None')).toBeInTheDocument();
      });

      const deselectAllButton = screen.getByText('None');
      await act(async () => {
        fireEvent.click(deselectAllButton);
      });

      expect(mockOnModelsChange).toHaveBeenCalledWith([]);
    });

    it('should disable Select All when all models are selected', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image', 'flux-schnell', 'qwen-image-edit', 'cli-model', 'video-model'],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        const selectAllButton = screen.getByText('All');
        expect(selectAllButton).toBeDisabled();
      });
    });

    it('should disable Deselect All when no models are selected', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        const deselectAllButton = screen.getByText('None');
        expect(deselectAllButton).toBeDisabled();
      });
    });

    it('should visually highlight selected models', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image'],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

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
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');
      const { toast } = await import('sonner');
      mockFetchCalls = [];

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
                qwenImage: { status: 'stopped' },
              }),
            }),
          });
        }
        if (url === '/api/v1/models/qwen-image/start') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      // Find the play/configure button (title attribute)
      const playButtons = screen.getAllByTitle('Configure and start server');
      expect(playButtons.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(playButtons[0]);
      });

      // Wait for modal to appear and click the "Start Server" button in the modal
      await waitFor(() => {
        expect(screen.getByText('Server Configuration')).toBeInTheDocument();
      });

      const startServerButton = screen.getByText('Start Server');
      await act(async () => {
        fireEvent.click(startServerButton);
      });

      await waitFor(() => {
        // Verify fetch was called with correct URL and POST method
        const startCall = mockFetchCalls.find(call => call.url === '/api/v1/models/qwen-image/start');
        expect(startCall).toBeDefined();
        expect(startCall.options?.method).toBe('POST');
        // Now sends default steps in body: {"steps":9}
        expect(startCall.options?.body).toContain('"steps":9');
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should call stop API when clicking stop button', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');
      const { toast } = await import('sonner');
      mockFetchCalls = [];

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
                fluxSchnell: { status: 'running' },
              }),
            }),
          });
        }
        if (url === '/api/v1/models/flux-schnell/stop') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({}),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
      });

      // Find the stop button (title attribute)
      const stopButtons = screen.getAllByTitle('Stop server');
      expect(stopButtons.length).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.click(stopButtons[0]);
      });

      await waitFor(() => {
        // Verify fetch was called with correct URL and POST method
        const stopCall = mockFetchCalls.find(call => call.url === '/api/v1/models/flux-schnell/stop');
        expect(stopCall).toBeDefined();
        expect(stopCall.options?.method).toBe('POST');
        expect(toast.success).toHaveBeenCalled();
      });
    });

    it('should not show start/stop buttons for CLI mode models', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels(),
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('CLI Model')).toBeInTheDocument();
      });

      // CLI Model should not have start/stop buttons
      const cliModelRow = screen.getByText('CLI Model').closest('div').parentElement;
      const startButtons = cliModelRow?.querySelectorAll('[title="Configure and start server"]');
      const stopButtons = cliModelRow?.querySelectorAll('[title="Stop server"]');

      expect(startButtons?.length).toBe(0);
      expect(stopButtons?.length).toBe(0);
    });
  });

  describe('Expand/collapse functionality', () => {
    it('should expand model when clicking expand button', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

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
        await act(async () => {
          fireEvent.click(chevronButtons[0]);
        });

        // Now description should be visible
        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
        });
      }
    });

    it('should show model details when expanded', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        await act(async () => {
          fireEvent.click(chevronButtons[0]);
        });

        await waitFor(() => {
          expect(screen.getByText('Description:')).toBeInTheDocument();
          expect(screen.getByText(/Mode:/)).toBeInTheDocument();
          expect(screen.getByText(/Type:/)).toBeInTheDocument();
        });
      }
    });

    it('should show capabilities when expanded', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const chevronButtons = screen.getAllByRole('button').filter(btn => {
        const svg = btn.querySelector('svg');
        return svg && btn.getAttribute('class')?.includes('text-muted-foreground');
      });

      if (chevronButtons.length > 0) {
        await act(async () => {
          fireEvent.click(chevronButtons[0]);
        });

        await waitFor(() => {
          expect(screen.getByText(/Capabilities:/)).toBeInTheDocument();
        });
      }
    });
  });

  describe('Empty states', () => {
    it('should show no models available message when models list is empty', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn(() => Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: [] }),
      }));

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText(/No models available/)).toBeInTheDocument();
      });
    });
  });

  describe('Error handling', () => {
    it('should show error toast when model start fails', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
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

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const playButtons = screen.getAllByTitle('Configure and start server');
      await act(async () => {
        fireEvent.click(playButtons[0]);
      });

      // Wait for modal to appear and click the "Start Server" button in the modal
      await waitFor(() => {
        expect(screen.getByText('Server Configuration')).toBeInTheDocument();
      });

      const startServerButton = screen.getByText('Start Server');
      await act(async () => {
        fireEvent.click(startServerButton);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to start model');
      });
    });

    it('should show error toast when model stop fails', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
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

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
      });

      const stopButtons = screen.getAllByTitle('Stop server');
      await act(async () => {
        fireEvent.click(stopButtons[0]);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Failed to stop model');
      });
    });

    it('should show error toast with statusText when error response has no error field', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');
      const { toast } = await import('sonner');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels({
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

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: [],
            onModelsChange: mockOnModelsChange,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      const playButtons = screen.getAllByTitle('Configure and start server');
      await act(async () => {
        fireEvent.click(playButtons[0]);
      });

      // Wait for modal to appear and click the "Start Server" button in the modal
      await waitFor(() => {
        expect(screen.getByText('Server Configuration')).toBeInTheDocument();
      });

      const startServerButton = screen.getByText('Start Server');
      await act(async () => {
        fireEvent.click(startServerButton);
      });

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Inline memory settings', () => {
    const renderWithMemoryControls = async (overrides = {}) => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      // Mock fetch to return models + memory estimate endpoint
      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels(overrides.modelOverrides || {}),
            }),
          });
        }
        // Memory flags persist endpoint
        if (url.includes('/memory-flags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: overrides.selectedModels || ['qwen-image'],
            onModelsChange: mockOnModelsChange,
            enableMemoryControls: true,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      return { MultiModelSelector };
    };

    it('should show memory badge for selected server-mode models when enableMemoryControls is true', async () => {
      await renderWithMemoryControls();

      // ProjectedMemoryBadge renders [peakGB/budgetGB] format
      await waitFor(() => {
        expect(screen.getByText(/\[2\.6\/6\.6\]/)).toBeInTheDocument();
      });
    });

    it('should show memory settings gear button next to memory badge', async () => {
      await renderWithMemoryControls();

      await waitFor(() => {
        const gearButton = screen.getByTitle('Memory settings');
        expect(gearButton).toBeInTheDocument();
      });
    });

    it('should not show memory badge for unselected models', async () => {
      await renderWithMemoryControls({ selectedModels: [] });

      // No memory badge or gear should appear
      expect(screen.queryByTitle('Memory settings')).not.toBeInTheDocument();
    });

    it('should not show memory badge for CLI mode models', async () => {
      await renderWithMemoryControls({ selectedModels: ['cli-model'] });

      // CLI models don't get memory controls (server-mode only)
      expect(screen.queryByTitle('Memory settings')).not.toBeInTheDocument();
    });

    it('should toggle inline memory flag buttons when gear button is clicked', async () => {
      await renderWithMemoryControls();

      // Initially, memory flag buttons should not be visible
      expect(screen.queryByTitle('Offload to CPU')).not.toBeInTheDocument();

      // Click the gear button to expand inline settings
      const gearButton = screen.getByTitle('Memory settings');
      await act(async () => {
        fireEvent.click(gearButton);
      });

      // Now all 5 memory flag buttons should be visible
      await waitFor(() => {
        expect(screen.getByTitle('Offload to CPU')).toBeInTheDocument();
        expect(screen.getByTitle('CLIP on CPU')).toBeInTheDocument();
        expect(screen.getByTitle('VAE on CPU')).toBeInTheDocument();
        expect(screen.getByTitle('VAE Tiling')).toBeInTheDocument();
        expect(screen.getByTitle('Flash Attention')).toBeInTheDocument();
      });

      // Click gear again to collapse
      await act(async () => {
        fireEvent.click(gearButton);
      });

      await waitFor(() => {
        expect(screen.queryByTitle('Offload to CPU')).not.toBeInTheDocument();
      });
    });

    it('should toggle individual memory flags when clicked', async () => {
      await renderWithMemoryControls();

      // Open inline settings
      const gearButton = screen.getByTitle('Memory settings');
      await act(async () => {
        fireEvent.click(gearButton);
      });

      await waitFor(() => {
        expect(screen.getByTitle('Offload to CPU')).toBeInTheDocument();
      });

      // Click the "Offload to CPU" flag button to toggle it
      const offloadButton = screen.getByTitle('Offload to CPU');
      await act(async () => {
        fireEvent.click(offloadButton);
      });

      // The flag should have been saved to localStorage
      const stored = localStorage.getItem('memoryFlags:qwen-image');
      expect(stored).toBeTruthy();
      const parsed = JSON.parse(stored);
      // Since DEFAULT_FLAGS has offloadToCpu: true, toggling it should make it false
      expect(parsed.flags.offloadToCpu).toBe(false);
      expect(parsed.manual).toBe(true);
    });

    it('should persist memory flags to backend when toggled', async () => {
      mockFetchCalls = [];
      await renderWithMemoryControls();

      // Open inline settings
      const gearButton = screen.getByTitle('Memory settings');
      await act(async () => {
        fireEvent.click(gearButton);
      });

      await waitFor(() => {
        expect(screen.getByTitle('VAE on CPU')).toBeInTheDocument();
      });

      // Clear fetch calls to track only the flag toggle call
      mockFetchCalls = [];

      // Toggle "VAE on CPU" flag
      const vaeButton = screen.getByTitle('VAE on CPU');
      await act(async () => {
        fireEvent.click(vaeButton);
      });

      // Should have posted to the backend memory-flags endpoint
      await waitFor(() => {
        const flagsCall = mockFetchCalls.find(call =>
          call.url === '/api/models/qwen-image/memory-flags'
        );
        expect(flagsCall).toBeDefined();
        expect(flagsCall.options?.method).toBe('POST');
        const body = JSON.parse(flagsCall.options.body);
        // DEFAULT_FLAGS has vaeOnCpu: true, toggling makes it false
        expect(body.vaeOnCpu).toBe(false);
      });
    });

    it('should maintain per-model memory flags independently', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url, options) => {
        mockFetchCalls.push({ url, options });
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels(),
            }),
          });
        }
        if (url.includes('/memory-flags')) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ success: true }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      // Pre-set different flags for two models in localStorage
      localStorage.setItem('memoryFlags:qwen-image', JSON.stringify({
        flags: { offloadToCpu: false, clipOnCpu: true, vaeOnCpu: true, vaeTiling: false, diffusionFa: true },
        manual: true,
      }));
      localStorage.setItem('memoryFlags:flux-schnell', JSON.stringify({
        flags: { offloadToCpu: true, clipOnCpu: false, vaeOnCpu: false, vaeTiling: true, diffusionFa: false },
        manual: true,
      }));

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image', 'flux-schnell'],
            onModelsChange: mockOnModelsChange,
            enableMemoryControls: true,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
        expect(screen.getByText('FLUX.1 Schnell')).toBeInTheDocument();
      });

      // Both models should have their own gear buttons
      const gearButtons = screen.getAllByTitle('Memory settings');
      expect(gearButtons.length).toBe(2);

      // Verify each model kept its own flags in localStorage
      const qwenFlags = JSON.parse(localStorage.getItem('memoryFlags:qwen-image'));
      const fluxFlags = JSON.parse(localStorage.getItem('memoryFlags:flux-schnell'));
      expect(qwenFlags.flags.offloadToCpu).toBe(false);
      expect(fluxFlags.flags.offloadToCpu).toBe(true);
      expect(qwenFlags.flags.clipOnCpu).toBe(true);
      expect(fluxFlags.flags.clipOnCpu).toBe(false);
    });

    it('should not show memory controls when enableMemoryControls is false', async () => {
      const { MultiModelSelector } = await import('../frontend/src/components/MultiModelSelector');

      global.fetch = vi.fn((url) => {
        if (url === '/api/v1/models') {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({
              object: 'list',
              data: createMockModels(),
            }),
          });
        }
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });

      await act(async () => {
        render(
          React.createElement(MultiModelSelector, {
            selectedModels: ['qwen-image'],
            onModelsChange: mockOnModelsChange,
            enableMemoryControls: false,
          })
        );
      });

      await waitFor(() => {
        expect(screen.getByText('Qwen Image')).toBeInTheDocument();
      });

      // No memory settings gear should appear
      expect(screen.queryByTitle('Memory settings')).not.toBeInTheDocument();
    });
  });
});
