/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MultiModelSelector } from "../MultiModelSelector";
import { authenticatedFetch } from "../../utils/api";

// Mock the toast notifications
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock WebSocket hooks
vi.mock("../../hooks/useWebSocket", () => ({
  useDownloadProgress: vi.fn((callback) => {
    // No-op for tests
  }),
  useWebSocket: vi.fn(() => ({
    // No-op for tests
  })),
  WS_CHANNELS: {
    QUEUE: "queue",
    GENERATIONS: "generations",
    MODELS: "models",
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
      return Promise.resolve({
        ok: true,
        json: async () => ({
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
        }),
      });
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

  it("should fetch models twice when mode changes (mount + mode change)", async () => {
    let callCount = 0;

    authenticatedFetch.mockImplementation(() => {
      callCount++;
      return Promise.resolve({
        ok: true,
        json: async () => ({
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
        }),
      });
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

    // Change mode to video
    rerender(
      <MultiModelSelector
        selectedModels={[]}
        onModelsChange={onModelsChange}
        mode="video"
      />
    );

    // Should have called twice (initial mount + mode change)
    await waitFor(() => {
      expect(authenticatedFetch).toHaveBeenCalledTimes(2);
    });

    // Wait a bit more to ensure no additional calls
    await waitFor(
      () => {
        expect(authenticatedFetch).toHaveBeenCalledTimes(2);
      },
      { timeout: 500 }
    );
  });

  it("should not enter infinite loop when mode is null", async () => {
    const calls = [];

    authenticatedFetch.mockImplementation(() => {
      calls.push(new Date().toISOString());
      return Promise.resolve({
        ok: true,
        json: async () => ({
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
        }),
      });
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
