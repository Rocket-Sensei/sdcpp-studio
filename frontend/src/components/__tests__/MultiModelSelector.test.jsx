/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MultiModelSelector } from "../MultiModelSelector";

// Import mock helper
import { createMockResponse } from '../../../../tests/setup.js';

// Mock authenticatedFetch before importing the api module
vi.mock("../../utils/api", () => ({
  authenticatedFetch: vi.fn(),
}));

// Import after mock is set up
import { authenticatedFetch } from "../../utils/api";

// Mock the toast notifications
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
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

// Mock WebSocket hooks
vi.mock("../../hooks/useWebSocket", () => ({
  useDownloadProgress: vi.fn((callback) => {
    // No-op for tests
  }),
  useWebSocket: vi.fn(() => ({
    isConnected: false,
    // No-op for tests
  })),
  WS_CHANNELS: {
    QUEUE: "queue",
    GENERATIONS: "generations",
    MODELS: "models",
    DOWNLOAD: "download",
  },
}));

describe("MultiModelSelector API call behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fetch models only once on initial mount", async () => {
    let callCount = 0;

    authenticatedFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve(createMockResponse({
        models: [
          {
            id: "model-1",
            name: "Model 1",
            capabilities: ["text-to-image"],
            status: "stopped",
            exec_mode: "server",
            mode: "on_demand",
            fileStatus: { allFilesExist: true, files: [] },
          },
        ],
      }));
    });

    const onModelsChange = vi.fn();

    render(
      <MultiModelSelector
        selectedModels={[]}
        onModelsChange={onModelsChange}
        mode="image"
      />
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    });

    // Wait a bit more to ensure no additional calls
    await waitFor(
      () => {
        expect(authenticatedFetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 }
    );
  });

  it("should fetch models once on mount and filter when mode changes", async () => {
    let callCount = 0;

    authenticatedFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve(createMockResponse({
        models: [
          {
            id: "model-1",
            name: "Model 1",
            capabilities: ["text-to-image"],
            status: "stopped",
            exec_mode: "server",
            mode: "on_demand",
            fileStatus: { allFilesExist: true, files: [] },
          },
        ],
      }));
    });

    const onModelsChange = vi.fn();

    const { rerender } = render(
      <MultiModelSelector
        selectedModels={[]}
        onModelsChange={onModelsChange}
        mode="image"
      />
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(authenticatedFetch).toHaveBeenCalledTimes(1);
    });

    // Change mode to video - should NOT trigger another fetch
    // The component filters the already-loaded models using useMemo
    rerender(
      <MultiModelSelector
        selectedModels={[]}
        onModelsChange={onModelsChange}
        mode="video"
      />
    );

    // Should still only have called once (models are fetched once, then filtered in memory)
    await waitFor(
      () => {
        expect(authenticatedFetch).toHaveBeenCalledTimes(1);
      },
      { timeout: 500 }
    );
  });

  it("should not enter infinite loop when mode is null", async () => {
    const calls = [];

    authenticatedFetch.mockImplementation(() => {
      calls.push(new Date().toISOString());
      return Promise.resolve(createMockResponse({
        models: [
          {
            id: "model-1",
            name: "Model 1",
            capabilities: ["text-to-image"],
            status: "stopped",
            exec_mode: "server",
            mode: "on_demand",
            fileStatus: { allFilesExist: true, files: [] },
          },
        ],
      }));
    });

    const onModelsChange = vi.fn();

    render(
      <MultiModelSelector
        selectedModels={[]}
        onModelsChange={onModelsChange}
        mode={null}
      />
    );

    // Wait for initial fetch
    await waitFor(() => {
      expect(authenticatedFetch).toHaveBeenCalled();
    });

    // Wait 1 second and ensure we haven't made more than 2 calls
    // (1 on mount, possibly 1 more from mode change effect)
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // If we have more than 5 calls in 1 second, we have an infinite loop
    expect(calls.length).toBeLessThan(5);
  });
});
