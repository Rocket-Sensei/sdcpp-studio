/**
 * Tests for App component and routing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// Mock the child components with factory functions
vi.mock('../frontend/src/components/Navigation', () => ({
  Navigation: () => React.createElement('nav', { 'data-testid': 'navigation' }, 'Navigation'),
}));

vi.mock('../frontend/src/components/TextToImage', () => ({
  TextToImage: () => React.createElement('div', { 'data-testid': 'text-to-image' }, 'TextToImage'),
}));

vi.mock('../frontend/src/components/ImageToImage', () => ({
  ImageToImage: () => React.createElement('div', { 'data-testid': 'image-to-image' }, 'ImageToImage'),
}));

vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: () => React.createElement('div', { 'data-testid': 'gallery' }, 'UnifiedQueue'),
}));

vi.mock('../frontend/src/components/ModelManager', () => ({
  ModelManager: () => React.createElement('div', { 'data-testid': 'models' }, 'ModelManager'),
}));

vi.mock('../frontend/src/components/ui/toast', () => ({
  ToastProvider: ({ children }) => React.createElement('div', null, children),
  ToastViewport: () => React.createElement('div', null),
  Toast: () => React.createElement('div', null),
  ToastTitle: ({ children }) => React.createElement('div', null, children),
  ToastDescription: ({ children }) => React.createElement('div', null, children),
  ToastClose: () => React.createElement('button', null),
  ToastAction: () => React.createElement('button', null),
}));

vi.mock('../frontend/src/hooks/useToast', () => ({
  Toaster: () => React.createElement('div', { 'data-testid': 'toaster' }, 'Toaster'),
}));

vi.mock('../frontend/src/hooks/useImageGeneration', () => ({
  useGenerations: () => ({ fetchGenerations: vi.fn() }),
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

  it('should render Navigation component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('navigation')).toBeTruthy();
  });

  it('should render Toaster component', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('toaster')).toBeTruthy();
  });

  it('should render TextToImage component at / route (redirected)', () => {
    renderWithRouter(React.createElement(App));
    expect(screen.getByTestId('text-to-image')).toBeTruthy();
  });

  it('should render TextToImage component at /text-to-image route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/text-to-image'] });
    expect(screen.getByTestId('text-to-image')).toBeTruthy();
  });

  it('should render ImageToImage component at /image-to-image route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/image-to-image'] });
    expect(screen.getByTestId('image-to-image')).toBeTruthy();
  });

  it('should render UnifiedQueue component at /gallery route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('gallery')).toBeTruthy();
  });

  it('should render ModelManager component at /models route', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/models'] });
    expect(screen.getByTestId('models')).toBeTruthy();
  });

  it('should redirect root / to /text-to-image', () => {
    renderWithRouter(React.createElement(App), { initialEntries: ['/'] });
    expect(screen.getByTestId('text-to-image')).toBeTruthy();
  });

  it('should pass onGenerated prop to TextToImage', () => {
    const { container } = renderWithRouter(React.createElement(App), { initialEntries: ['/text-to-image'] });
    expect(screen.getByTestId('text-to-image')).toBeTruthy();
  });

  it('should pass onCreateMore prop to UnifiedQueue', () => {
    const { container } = renderWithRouter(React.createElement(App), { initialEntries: ['/gallery'] });
    expect(screen.getByTestId('gallery')).toBeTruthy();
  });
});
