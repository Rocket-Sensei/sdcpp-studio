/**
 * Test to verify LogViewer component imports work correctly
 *
 * This test reproduces the import failure that occurs when LogViewer.jsx
 * imports from the wrong path.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';

vi.mock('../frontend/src/contexts/WebSocketContext', async () => {
  return {
    useTerminalLogs: vi.fn(() => ({
      isConnected: false,
      isConnecting: false,
    })),
  };
});

const { LogViewer } = await import('../frontend/src/components/LogViewer.jsx');

// Mock the fetch API to prevent actual HTTP requests
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ all: [] }),
  })
);

describe('LogViewer Component Import', () => {
  beforeEach(() => {
    // Clear all mocks before each test
    vi.clearAllMocks();
  });

  it('should import LogViewer component without errors', () => {
    // This test will fail if the import path in LogViewer.jsx is incorrect
    expect(LogViewer).toBeDefined();
  });

  it('should render LogViewer component with generationId', async () => {
    const { container } = render(<LogViewer generationId="test-gen-id" />);

    // Wait for the component to complete its initial fetch
    await waitFor(() => {
      expect(container).toBeDefined();
    });

    // Verify the component renders without crashing
    expect(container).toBeDefined();
    expect(container.querySelector('div')).toBeInTheDocument();
  });
});
