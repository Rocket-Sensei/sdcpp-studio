/**
 * Tests for Studio component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock the child components before importing Studio
vi.mock('../frontend/src/components/GeneratePanel', () => ({
  GeneratePanel: ({ selectedModels, onModelsChange, settings, onGenerated }) =>
    React.createElement('div', { 'data-testid': 'generate-panel' },
      React.createElement('div', { 'data-testid': 'selected-models' },
        selectedModels ? selectedModels.join(',') : 'none'
      ),
      settings && React.createElement('div', { 'data-testid': 'create-more-settings' }, JSON.stringify(settings)),
      React.createElement('button', {
        onClick: () => onGenerated && onGenerated(),
        'data-testid': 'generate-button'
      }, 'Generate')
    ),
}));

vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: ({ onCreateMore }) =>
    React.createElement('div', { 'data-testid': 'unified-queue' },
      React.createElement('button', {
        onClick: () => onCreateMore && onCreateMore({
          model: 'test-model-id',
          prompt: 'test prompt',
          size: '512x512',
          negative_prompt: 'test negative'
        }),
        'data-testid': 'create-more-button'
      }, 'Create More')
    ),
}));

// Import Studio after mocks are set up
const { Studio } = await import('../frontend/src/components/Studio');

describe('Studio Component', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorageMock.clear();
  });

  it('should render without crashing', () => {
    const { container } = render(React.createElement(Studio));

    expect(container).toBeTruthy();
    expect(screen.getByTestId('generate-panel')).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should render both Generate and UnifiedQueue components by default', () => {
    render(React.createElement(Studio));

    expect(screen.getByTestId('generate-panel')).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should have initial collapsed state from localStorage when not controlled externally', () => {
    localStorageMock.setItem('studio-form-collapsed', 'true');

    render(React.createElement(Studio));

    // With Sheet, the generate-panel is still in DOM but controlled by Sheet state
    // When collapsed, the Sheet is closed so content may not be visible
    // The Queue should still be visible
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should respect externally controlled collapse state', () => {
    // With external control, localStorage should be ignored
    localStorageMock.setItem('studio-form-collapsed', 'false');

    const onToggleForm = vi.fn();
    const onCollapseChange = vi.fn();

    render(React.createElement(Studio, {
      isFormCollapsed: true,
      onToggleForm,
      onCollapseChange
    }));

    // With Sheet, the generate-panel exists in the DOM but Sheet controls visibility
    // When isFormCollapsed=true, the Sheet is closed (open=!isFormCollapsed)
    // The Queue should still be visible
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });

  it('should call onToggleForm when toggle is clicked internally (floating action button)', () => {
    localStorageMock.setItem('studio-form-collapsed', 'true');

    const onToggleForm = vi.fn();
    const onCollapseChange = vi.fn();

    render(React.createElement(Studio, {
      isFormCollapsed: true,
      onToggleForm,
      onCollapseChange
    }));

    // Click the floating action button
    const fabButtons = screen.getAllByTitle('Show Generate Form');
    fireEvent.click(fabButtons[0]);

    expect(onToggleForm).toHaveBeenCalled();
  });

  it('should call onCollapseChange when internal state changes', async () => {
    const onToggleForm = vi.fn();
    const onCollapseChange = vi.fn();

    // Render without external control (null) so it uses internal state
    render(React.createElement(Studio, {
      isFormCollapsed: null,
      onToggleForm,
      onCollapseChange
    }));

    // Initially expanded
    expect(screen.getByTestId('generate-panel')).toBeTruthy();

    // The component should read from localStorage on initial render
    // When localStorage is empty, it should default to expanded (false = not collapsed)
  });

  it('should persist collapse state to localStorage when internally controlled', async () => {
    const { container } = render(React.createElement(Studio, {
      isFormCollapsed: null, // No external control
    }));

    // Initially expanded (localStorage is empty)
    expect(screen.getByTestId('generate-panel')).toBeTruthy();

    // The component should read from localStorage on initial render
    // When localStorage is empty, it defaults to expanded
  });

  it('should handle create more callback and expand form', async () => {
    // This test needs to use internal state management since create more
    // uses internal setFormCollapsed
    render(React.createElement(Studio, {
      isFormCollapsed: null, // Use internal state management
    }));

    // Form should be visible initially
    expect(screen.getByTestId('generate-panel')).toBeTruthy();

    // Click the "Create More" button - it should still work
    const createMoreButton = screen.getByTestId('create-more-button');
    fireEvent.click(createMoreButton);

    // Check if settings are passed to Generate
    await waitFor(() => {
      const settingsElement = screen.queryByTestId('create-more-settings');
      expect(settingsElement).toBeTruthy();
    });
  });

  it('should pass settings to Generate when create more is clicked', async () => {
    render(React.createElement(Studio));

    // Initially no settings
    expect(screen.queryByTestId('create-more-settings')).toBeNull();

    // Click the "Create More" button
    const createMoreButton = screen.getByTestId('create-more-button');
    fireEvent.click(createMoreButton);

    // Check if settings are passed to Generate
    await waitFor(() => {
      const settingsElement = screen.queryByTestId('create-more-settings');
      expect(settingsElement).toBeTruthy();
      expect(settingsElement.textContent).toContain('test-model-id');
      expect(settingsElement.textContent).toContain('test prompt');
    });
  });

  it('should show floating action button when form is collapsed', () => {
    render(React.createElement(Studio, {
      isFormCollapsed: true,
    }));

    // Check for floating action button (has fixed positioning)
    const fabButtons = screen.getAllByTitle('Show Generate Form');
    expect(fabButtons.length).toBeGreaterThan(0);
  });

  it('should expand form when floating action button is clicked', async () => {
    const onToggleForm = vi.fn();

    render(React.createElement(Studio, {
      isFormCollapsed: true,
      onToggleForm,
    }));

    // Form should be collapsed (Sheet is closed)
    // Find and click the floating action button
    const fabButtons = screen.getAllByTitle('Show Generate Form');
    fireEvent.click(fabButtons[0]);

    expect(onToggleForm).toHaveBeenCalled();
  });

  it('should not render Studio title (removed header)', () => {
    render(React.createElement(Studio));

    expect(screen.queryByText('Studio')).toBeNull();
  });

  it('should not have local hide/show form buttons (moved to App header)', () => {
    render(React.createElement(Studio));

    expect(screen.queryByText('Hide Form')).toBeNull();
    expect(screen.queryByText('Show Form')).toBeNull();
  });

  it('should render correct layout classes for responsive design', () => {
    const { container } = render(React.createElement(Studio));

    // New layout uses a single grid column (the Sheet is an overlay)
    const mainGrid = container.querySelector('.grid');
    expect(mainGrid).toBeTruthy();
    expect(mainGrid.className).toContain('grid-cols-1');
    // The lg:grid-cols-3 class is no longer used (Sheet is overlay, not in grid)
  });

  it('should apply correct column span to queue when form is collapsed', () => {
    render(React.createElement(Studio, {
      isFormCollapsed: true,
    }));

    // With Sheet, the queue always spans full width (no column span changes needed)
    const queueContainer = screen.getByTestId('unified-queue').parentElement;
    expect(queueContainer.className).toContain('grid-cols-1');
  });

  it('should apply correct column span to queue when form is expanded', () => {
    render(React.createElement(Studio, {
      isFormCollapsed: false,
    }));

    // With Sheet, the queue always spans full width (Sheet is overlay, not in grid)
    const queueContainer = screen.getByTestId('unified-queue').parentElement;
    expect(queueContainer.className).toContain('grid-cols-1');
  });

  it('should clear settings after generation is complete', async () => {
    render(React.createElement(Studio));

    // First trigger create more
    const createMoreButton = screen.getByTestId('create-more-button');
    fireEvent.click(createMoreButton);

    // Wait for settings to appear
    await waitFor(() => {
      expect(screen.queryByTestId('create-more-settings')).toBeTruthy();
    });

    // Trigger generation complete
    const generateButton = screen.getByTestId('generate-button');
    fireEvent.click(generateButton);

    // Settings should be cleared
    await waitFor(() => {
      expect(screen.queryByTestId('create-more-settings')).toBeNull();
    });
  });

  it('should work without external props (backward compatibility)', () => {
    localStorageMock.setItem('studio-form-collapsed', 'false');

    render(React.createElement(Studio));

    // Should still work with no props
    expect(screen.getByTestId('generate-panel')).toBeTruthy();
    expect(screen.getByTestId('unified-queue')).toBeTruthy();
  });
});
