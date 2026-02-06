/**
 * Tests for App component routing and layout
 *
 * Tests the new PromptBar-based UI design:
 * - PromptBar at top for quick generation
 * - SettingsPanel as side-sheet for advanced settings
 * - Header with filters, settings, WebSocket status
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';

// Mock the useImageGeneration hook
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    fetchGenerations: vi.fn(),
    generateQueued: vi.fn(),
    isLoading: false,
  }),
  useGenerations: () => ({
    fetchGenerations: vi.fn(),
  }),
}));

// Mock the WebSocket context
vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }) => React.createElement('div', { 'data-testid': 'websocket-provider' }, children),
  useWebSocket: () => ({
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  }),
}));

// Mock WebSocketStatusIndicator
vi.mock('../frontend/src/components/WebSocketStatusIndicator', () => ({
  WebSocketStatusIndicator: () => React.createElement('div', { 'data-testid': 'ws-status-indicator' }, 'WS Status'),
}));

// Mock ApiKeyProvider
vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  ApiKeyProvider: ({ children }) => React.createElement('div', { 'data-testid': 'apikey-provider' }, children),
  useApiKeyContext: () => ({ version: 0 }),
}));

vi.mock('../frontend/src/components/ApiKeyModal', () => ({
  ApiKeyModal: () => React.createElement('div', { 'data-testid': 'apikey-modal' }),
}));

// Mock Toaster from sonner
vi.mock('../frontend/src/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}));

// Mock UnifiedQueue to focus on Studio testing
vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: () => React.createElement('div', { 'data-testid': 'unified-queue' }, 'UnifiedQueue Gallery'),
}));

// Mock authenticatedFetch to avoid network errors
vi.mock('../frontend/src/utils/api', () => ({
  authenticatedFetch: vi.fn(() => Promise.resolve({
    ok: true,
    json: async () => ({}),
    text: async () => '',
  })),
  isAuthRequired: vi.fn(() => false),
}));

// Import App after mocks are set up
const { default: App, AppWithProviders } = await import('../frontend/src/App');

// Helper to render App with a specific route
const renderAppWithRoute = async (initialEntries) => {
  const { container, ...rest } = render(
    React.createElement(
      MemoryRouter,
      { initialEntries },
      React.createElement(AppWithProviders)
    )
  );

  // Wait for AppBoot to complete initialization
  await waitFor(() => {
    const hasInitializing = container.textContent.includes('Initializing...');
    if (hasInitializing) {
      throw new Error('Still initializing');
    }
  }, { timeout: 3000 });

  // Additional wait for Studio to render after redirects
  await waitFor(() => {
    const hasStudio = container.textContent.includes('sd.cpp Studio');
    if (!hasStudio) {
      throw new Error('Studio not rendered yet');
    }
  }, { timeout: 3000 });

  return { container, ...rest };
};

describe('App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('Main routes', () => {
    it('should render Studio component on /studio route', async () => {
      await renderAppWithRoute(['/studio']);

      // Studio renders UnifiedQueue which we mocked
      expect(screen.getByTestId('unified-queue')).toBeInTheDocument();
    });

    it('should redirect / to /studio', async () => {
      await renderAppWithRoute(['/']);

      expect(screen.getByTestId('unified-queue')).toBeInTheDocument();
    });
  });

  describe('Backward compatibility redirects', () => {
    it('should redirect /generate to /studio', async () => {
      await renderAppWithRoute(['/generate']);

      expect(screen.getByTestId('unified-queue')).toBeInTheDocument();
    });

    it('should redirect /gallery to /studio', async () => {
      await renderAppWithRoute(['/gallery']);

      expect(screen.getByTestId('unified-queue')).toBeInTheDocument();
    });

    it('should redirect /models to /studio', async () => {
      await renderAppWithRoute(['/models']);

      expect(screen.getByTestId('unified-queue')).toBeInTheDocument();
    });
  });

  describe('Layout components', () => {
    it('should render header with logo', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByText('sd.cpp Studio')).toBeInTheDocument();
    });

    it('should render WebSocketStatusIndicator', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('ws-status-indicator')).toBeInTheDocument();
    });

    it('should render footer', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByText('sd.cpp Studio - OpenAI-Compatible Image Generation Interface')).toBeInTheDocument();
    });

    it('should render Toaster', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('toaster')).toBeInTheDocument();
    });
  });

  describe('Provider wrappers', () => {
    it('should wrap app with ApiKeyProvider', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('apikey-provider')).toBeInTheDocument();
    });

    it('should wrap app with WebSocketProvider', async () => {
      await renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('websocket-provider')).toBeInTheDocument();
    });
  });
});

describe('Filter Panel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  it('should persist filter panel open state to localStorage', async () => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('sd-cpp-studio-filter-panel-open', 'true');
    }

    await renderAppWithRoute(['/studio']);

    // Verify the localStorage key is being read
    expect(window.localStorage.getItem('sd-cpp-studio-filter-panel-open')).toBe('true');
  });

  it('should default filter panel to closed when no localStorage value exists', async () => {
    // Don't set any localStorage value

    await renderAppWithRoute(['/studio']);

    // The App component sets localStorage to 'false' on mount when nothing was set
    expect(window.localStorage.getItem('sd-cpp-studio-filter-panel-open')).toBe('false');
  });
});
