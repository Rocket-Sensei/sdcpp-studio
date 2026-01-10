/**
 * Tests for WebSocketStatusIndicator component
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock WebSocketContext
vi.mock('../frontend/src/contexts/WebSocketContext', async () => {
  return {
    useWebSocket: vi.fn(() => ({
      isConnected: true,
      isConnecting: false,
    })),
  };
});

// Mock LogViewer
vi.mock('../frontend/src/components/LogViewer', async () => {
  return {
    LogViewer: vi.fn(({ onClose }) =>
      React.createElement('div', { 'data-testid': 'log-viewer' }, 'LogViewer Content')
    ),
  };
});

// Mock Dialog components
vi.mock('../frontend/src/components/ui/dialog', async () => {
  return {
    Dialog: ({ children, open, onOpenChange }) =>
      open
        ? React.createElement('div', { 'data-testid': 'dialog-overlay', onClick: () => onOpenChange?.(false) }, children)
        : null,
    DialogPortal: ({ children }) => children,
    DialogOverlay: () => React.createElement('div', { 'data-testid': 'dialog-overlay-bg' }),
  };
});

// Import after mocks are set up
const { WebSocketStatusIndicator } = await import('../frontend/src/components/WebSocketStatusIndicator');
const { useWebSocket } = await import('../frontend/src/contexts/WebSocketContext');

describe('WebSocketStatusIndicator Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Online status when connected', () => {
    useWebSocket.mockReturnValue({ isConnected: true, isConnecting: false });

    render(React.createElement(WebSocketStatusIndicator));

    expect(screen.getByText('Online')).toBeTruthy();
  });

  it('should render Offline status when disconnected', () => {
    useWebSocket.mockReturnValue({ isConnected: false, isConnecting: false });

    render(React.createElement(WebSocketStatusIndicator));

    expect(screen.getByText('Offline')).toBeTruthy();
  });

  it('should render Connecting status when connecting', () => {
    useWebSocket.mockReturnValue({ isConnected: false, isConnecting: true });

    render(React.createElement(WebSocketStatusIndicator));

    expect(screen.getByText('Connecting...')).toBeTruthy();
  });

  it('should be clickable and open modal', async () => {
    useWebSocket.mockReturnValue({ isConnected: true, isConnecting: false });

    render(React.createElement(WebSocketStatusIndicator));

    // The indicator should be clickable
    const indicator = screen.getByText('Online').closest('div');
    expect(indicator).toBeTruthy();
    expect(indicator.className).toContain('cursor-pointer');

    // Click to open modal
    fireEvent.click(indicator);

    // LogViewer should appear
    await waitFor(() => {
      expect(screen.getByTestId('log-viewer')).toBeTruthy();
    });
  });

  it('should have hover effect class', () => {
    useWebSocket.mockReturnValue({ isConnected: true, isConnecting: false });

    const { container } = render(React.createElement(WebSocketStatusIndicator));

    const indicator = screen.getByText('Online').closest('div');
    expect(indicator.className).toContain('hover:opacity-80');
  });

  it('should have correct title attribute for accessibility', () => {
    useWebSocket.mockReturnValue({ isConnected: true, isConnecting: false });

    render(React.createElement(WebSocketStatusIndicator));

    const indicator = screen.getByText('Online').closest('div');
    expect(indicator.title).toContain('connected');
    expect(indicator.title).toContain('Click to view logs');
  });

  it('should close modal when clicking outside', async () => {
    useWebSocket.mockReturnValue({ isConnected: true, isConnecting: false });

    render(React.createElement(WebSocketStatusIndicator));

    // Click to open modal
    const indicator = screen.getByText('Online').closest('div');
    fireEvent.click(indicator);

    // Wait for modal to open
    await waitFor(() => {
      expect(screen.getByTestId('log-viewer')).toBeTruthy();
    });

    // Click outside (on overlay)
    const overlay = screen.getByTestId('dialog-overlay');
    fireEvent.click(overlay);

    // Modal should close (LogViewer should be removed)
    await waitFor(() => {
      expect(screen.queryByTestId('log-viewer')).toBeNull();
    });
  });
});
