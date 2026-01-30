/**
 * Tests for App component and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the child components with factory functions
vi.mock('../frontend/src/components/Studio', () => ({
  Studio: ({ searchQuery, selectedStatuses, selectedModelsFilter }) =>
    React.createElement('div', {
      'data-testid': 'studio',
      'data-search-query': searchQuery || '',
      'data-selected-statuses': selectedStatuses ? selectedStatuses.join(',') : '',
      'data-selected-models-filter': selectedModelsFilter ? selectedModelsFilter.join(',') : '',
    }, 'Studio'),
}));

vi.mock('../frontend/src/components/ui/sonner', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }, 'Toaster'),
}));

vi.mock('../frontend/src/components/header/Header', () => ({
  Header: ({ totalGenerations, filterSheet, onSettingsClick }) =>
    React.createElement('div', { 'data-testid': 'header' },
      React.createElement('div', { 'data-testid': 'total-generations' }, String(totalGenerations || 0)),
      React.createElement('div', { 'data-testid': 'websocket-status' }, 'WebSocketStatus'),
      filterSheet && React.createElement('div', { 'data-testid': 'filter-sheet' }, 'Filters'),
    ),
}));

vi.mock('../frontend/src/contexts/WebSocketContext', () => ({
  WebSocketProvider: ({ children }) => React.createElement('div', { 'data-testid': 'websocket-provider' }, children),
}));

vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useImageGeneration: () => ({ fetchGenerations: vi.fn(), generateQueued: vi.fn() }),
  useGenerations: () => ({ fetchGenerations: vi.fn(), generations: [], pagination: { total: 0 } }),
}));

vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  ApiKeyProvider: ({ children }) => React.createElement('div', { 'data-testid': 'apikey-provider' }, children),
  useApiKeyContext: () => ({ version: 0 }),
}));

vi.mock('../frontend/src/components/ApiKeyModal', () => ({
  ApiKeyModal: () => React.createElement('div', { 'data-testid': 'apikey-modal' }),
}));

vi.mock('../frontend/src/components/AppBoot', () => ({
  AppBoot: ({ onBootComplete, children }) => {
    React.useEffect(() => {
      onBootComplete();
    }, [onBootComplete]);
    return React.createElement(React.Fragment, null, children);
  },
}));

const renderWithRouter = (component, { initialEntries = ['/'] } = {}) => {
  return render(
    React.createElement(MemoryRouter, { initialEntries }, component)
  );
};

// Import App after mocks are set up
const App = (await import('../frontend/src/App')).default;

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render Toaster component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('toaster')).toBeTruthy();
  });

  it('should render Studio component at / route (redirected to /studio)', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should render Studio component at /studio route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/studio'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /generate to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/generate'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /gallery to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect /models to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/models'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should redirect root / to /studio', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/'] });
    expect(screen.getByTestId('studio')).toBeTruthy();
  });

  it('should render WebSocketStatusIndicator via Header', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('websocket-status')).toBeTruthy();
  });

  it('should render Header component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('header')).toBeTruthy();
  });
});
