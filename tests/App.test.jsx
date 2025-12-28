/**
 * Tests for App component routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

// Mock the useImageGeneration hook
vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({
    fetchGenerations: vi.fn(),
  }),
  useGenerations: () => ({
    fetchGenerations: vi.fn(),
  }),
}));

// Mock the WebSocket context
vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }) => React.createElement('div', { 'data-testid': 'websocket-provider' }, children),
}));

// Mock WebSocketStatusIndicator
vi.mock('../frontend/src/components/WebSocketStatusIndicator', () => ({
  WebSocketStatusIndicator: () => React.createElement('div', { 'data-testid': 'ws-status-indicator' }, 'WS Status'),
}));

// Mock ApiKeyProvider
vi.mock('../frontend/src/components/ApiKeyModal', () => ({
  ApiKeyProvider: ({ children }) => React.createElement('div', { 'data-testid': 'apikey-provider' }, children),
}));

// Mock Toaster from sonner
vi.mock('../frontend/src/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }),
}));

// Mock Studio component
vi.mock('../frontend/src/components/Studio', () => ({
  Studio: () => React.createElement('div', { 'data-testid': 'studio-page' }, 'Studio Page'),
}));

// Import App after mocks are set up
const { default: App } = await import('../frontend/src/App');

// Helper to render App with a specific route
const renderAppWithRoute = (initialEntries) => {
  return render(
    React.createElement(
      MemoryRouter,
      { initialEntries },
      React.createElement(App)
    )
  );
};

describe('App Routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Main routes', () => {
    it('should render Studio component on /studio route', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('studio-page')).toBeInTheDocument();
    });

    it('should redirect / to /studio', () => {
      renderAppWithRoute(['/']);

      expect(screen.getByTestId('studio-page')).toBeInTheDocument();
    });
  });

  describe('Backward compatibility redirects', () => {
    it('should redirect /generate to /studio', () => {
      renderAppWithRoute(['/generate']);

      expect(screen.getByTestId('studio-page')).toBeInTheDocument();
    });

    it('should redirect /gallery to /studio', () => {
      renderAppWithRoute(['/gallery']);

      expect(screen.getByTestId('studio-page')).toBeInTheDocument();
    });

    it('should redirect /models to /studio', () => {
      renderAppWithRoute(['/models']);

      expect(screen.getByTestId('studio-page')).toBeInTheDocument();
    });
  });

  describe('Layout components', () => {
    it('should render header with logo', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByText('sd.cpp Studio')).toBeInTheDocument();
    });

    it('should render Generate buttons (mobile sheet and desktop toggle)', () => {
      renderAppWithRoute(['/studio']);

      // There should be two "Generate" buttons: one for mobile (Sheet) and one for desktop
      expect(screen.getAllByText('Generate')).toHaveLength(2);
    });

    it('should render WebSocketStatusIndicator', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('ws-status-indicator')).toBeInTheDocument();
    });

    it('should render footer', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByText('sd.cpp Studio - OpenAI-Compatible Image Generation Interface')).toBeInTheDocument();
    });

    it('should render Toaster', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('toaster')).toBeInTheDocument();
    });
  });

  describe('Provider wrappers', () => {
    it('should wrap app with ApiKeyProvider', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('apikey-provider')).toBeInTheDocument();
    });

    it('should wrap app with WebSocketProvider', () => {
      renderAppWithRoute(['/studio']);

      expect(screen.getByTestId('websocket-provider')).toBeInTheDocument();
    });
  });
});
