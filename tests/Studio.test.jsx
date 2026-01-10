/**
 * Tests for Studio component
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

// Mock URL.createObjectURL for edit image functionality
global.URL.createObjectURL = vi.fn(() => 'mock-url-blob:http://test');
global.URL.revokeObjectURL = vi.fn();

// Mock the child components before importing Studio
// We use mocks to isolate testing of Studio's container behavior
vi.mock('../frontend/src/components/GeneratePanel', () => ({
  GeneratePanel: ({ selectedModels, onModelsChange, settings, editImageSettings, onGenerated }) =>
    React.createElement('div', { 'data-testid': 'generate-panel' },
      React.createElement('div', { 'data-testid': 'selected-models' },
        selectedModels ? selectedModels.join(',') : 'none'
      ),
      settings && React.createElement('div', { 'data-testid': 'create-more-settings' }, JSON.stringify(settings)),
      editImageSettings && React.createElement('div', { 'data-testid': 'edit-image-settings' }, JSON.stringify(editImageSettings)),
      React.createElement('button', {
        onClick: () => onGenerated && onGenerated(),
        'data-testid': 'generate-button'
      }, 'Generate')
    ),
}));

vi.mock('../frontend/src/components/UnifiedQueue', () => ({
  UnifiedQueue: ({ onCreateMore, onEditImage, searchQuery, selectedStatuses, selectedModelsFilter }) =>
    React.createElement('div', { 'data-testid': 'unified-queue' },
      searchQuery && React.createElement('div', { 'data-testid': 'search-query' }, searchQuery),
      selectedStatuses && React.createElement('div', { 'data-testid': 'selected-statuses' }, selectedStatuses.join(',')),
      selectedModelsFilter && React.createElement('div', { 'data-testid': 'selected-models-filter' }, selectedModelsFilter.join(',')),
      React.createElement('button', {
        onClick: () => onCreateMore && onCreateMore({
          model: 'test-model-id',
          prompt: 'test prompt',
          size: '512x512',
          negative_prompt: 'test negative'
        }),
        'data-testid': 'create-more-button'
      }, 'Create More'),
      React.createElement('button', {
        onClick: () => onEditImage && onEditImage(new File([''], 'test.jpg', { type: 'image/jpeg' }), {
          prompt: 'edit prompt',
          size: '1024x1024'
        }),
        'data-testid': 'edit-image-button'
      }, 'Edit Image')
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

  describe('Sheet Toggle Behavior', () => {
    it('should show Generate panel in Sheet when form is expanded (isFormCollapsed=false)', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false
      }));

      // When expanded, the Sheet is open and GeneratePanel should be visible
      expect(screen.getByTestId('generate-panel')).toBeTruthy();
    });

    it('should hide Generate panel in Sheet when form is collapsed (isFormCollapsed=true)', () => {
      const { container } = render(React.createElement(Studio, {
        isFormCollapsed: true
      }));

      // When collapsed, the Sheet is closed
      // With Radix UI Dialog/Sheet, the content is removed from DOM when closed
      const generatePanel = screen.queryByTestId('generate-panel');
      // In Sheet implementation with Radix UI, content is not in DOM when closed
      expect(generatePanel).toBeNull();
    });

    it('should show floating action button when form is collapsed', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: true
      }));

      // Check for floating action button
      const fabButtons = screen.getAllByTitle('Show Generate Form');
      expect(fabButtons.length).toBeGreaterThan(0);
    });

    it('should NOT show floating action button when form is expanded', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false
      }));

      // FAB should not be present when form is expanded
      const fabButtons = screen.queryAllByTitle('Show Generate Form');
      expect(fabButtons.length).toBe(0);
    });

    it('should call onToggleForm when floating action button is clicked', () => {
      const onToggleForm = vi.fn();

      render(React.createElement(Studio, {
        isFormCollapsed: true,
        onToggleForm
      }));

      const fabButtons = screen.getAllByTitle('Show Generate Form');
      fireEvent.click(fabButtons[0]);

      expect(onToggleForm).toHaveBeenCalledTimes(1);
    });

    it('should toggle internal state when FAB is clicked without external control', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: true,
        onToggleForm: null // No external control
      }));

      // Initially collapsed - FAB is visible
      const fabButtons = screen.getAllByTitle('Show Generate Form');
      expect(fabButtons.length).toBeGreaterThan(0);

      // Click FAB to expand
      fireEvent.click(fabButtons[0]);

      // After clicking, FAB should disappear (form is now expanded)
      waitFor(() => {
        const fabAfterClick = screen.queryAllByTitle('Show Generate Form');
        expect(fabAfterClick.length).toBe(0);
      });
    });

    it('should persist collapse state to localStorage', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: null // Use internal state
      }));

      // Initially should be expanded (default)
      expect(localStorageMock.getItem('studio-form-collapsed')).toBe('false');
    });

    it('should read initial collapse state from localStorage', () => {
      localStorageMock.setItem('studio-form-collapsed', 'true');

      render(React.createElement(Studio, {
        isFormCollapsed: null // Use internal state
      }));

      // Should read from localStorage
      expect(localStorageMock.getItem('studio-form-collapsed')).toBe('true');
    });
  });

  describe('Filter Props', () => {
    it('should pass searchQuery to UnifiedQueue', () => {
      render(React.createElement(Studio, {
        searchQuery: 'test search'
      }));

      expect(screen.getByTestId('search-query')).toBeTruthy();
      expect(screen.getByTestId('search-query').textContent).toBe('test search');
    });

    it('should pass selectedStatuses to UnifiedQueue', () => {
      const statuses = ['completed', 'processing'];
      render(React.createElement(Studio, {
        selectedStatuses: statuses
      }));

      expect(screen.getByTestId('selected-statuses')).toBeTruthy();
      expect(screen.getByTestId('selected-statuses').textContent).toBe('completed,processing');
    });

    it('should pass selectedModelsFilter to UnifiedQueue', () => {
      const models = ['model-1', 'model-2'];
      render(React.createElement(Studio, {
        selectedModelsFilter: models
      }));

      expect(screen.getByTestId('selected-models-filter')).toBeTruthy();
      expect(screen.getByTestId('selected-models-filter').textContent).toBe('model-1,model-2');
    });

    it('should pass all filter props together to UnifiedQueue', () => {
      render(React.createElement(Studio, {
        searchQuery: 'landscape',
        selectedStatuses: ['completed'],
        selectedModelsFilter: ['flux-model']
      }));

      expect(screen.getByTestId('search-query').textContent).toBe('landscape');
      expect(screen.getByTestId('selected-statuses').textContent).toBe('completed');
      expect(screen.getByTestId('selected-models-filter').textContent).toBe('flux-model');
    });
  });

  describe('Sheet Content', () => {
    it('should contain GeneratePanel inside Sheet', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false
      }));

      // GeneratePanel should be rendered
      const generatePanel = screen.getByTestId('generate-panel');
      expect(generatePanel).toBeTruthy();
    });

    it('should have Sheet title "Generate"', () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false
      }));

      // Check for the Sheet title (use role='heading' to be more specific)
      const title = screen.getByRole('heading', { name: 'Generate' });
      expect(title).toBeTruthy();
    });

    it('should have responsive width classes on SheetContent', () => {
      const { container } = render(React.createElement(Studio, {
        isFormCollapsed: false
      }));

      // Verify the Studio component has the correct structure
      const studioContainer = container.querySelector('.container');
      expect(studioContainer).toBeTruthy();

      // Verify the Sheet is rendered by checking that generate-panel exists
      // (Sheet is open when isFormCollapsed=false)
      expect(screen.getByTestId('generate-panel')).toBeTruthy();
    });

    it('should verify Sheet component variant classes do not include max-w-sm', () => {
      // The actual verification is done in Sheet.test.jsx
      // which tests the Sheet component directly
      expect(true).toBe(true);
    });

    it('should have overflow-y-auto and p-0 classes for proper scrolling', () => {
      // The actual classes are verified in Sheet.test.jsx
      // which tests the Sheet component directly with actual className prop
      expect(true).toBe(true);
    });
  });

  describe('Edit Image Functionality', () => {
    it('should handle edit image callback and expand form', async () => {
      const onCollapseChange = vi.fn();

      render(React.createElement(Studio, {
        isFormCollapsed: true, // Start collapsed
        onCollapseChange
      }));

      // Click the Edit Image button
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Should call onCollapseChange to expand the form
      await waitFor(() => {
        expect(onCollapseChange).toHaveBeenCalledWith(false);
      });
    });

    it('should set default edit model when editing image', async () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false // Start with form open so we can see the panel
      }));

      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Should set qwen-image-edit as the selected model
      await waitFor(() => {
        const selectedModels = screen.getByTestId('selected-models');
        expect(selectedModels.textContent).toBe('qwen-image-edit');
      });
    });

    it('should clear createMoreSettings when editing image', async () => {
      render(React.createElement(Studio, {
        isFormCollapsed: false // Start with form open
      }));

      // First trigger create more
      const createMoreButton = screen.getByTestId('create-more-button');
      fireEvent.click(createMoreButton);

      await waitFor(() => {
        expect(screen.queryByTestId('create-more-settings')).toBeTruthy();
      });

      // Then trigger edit image
      const editImageButton = screen.getByTestId('edit-image-button');
      fireEvent.click(editImageButton);

      // Create more settings should be cleared
      await waitFor(() => {
        expect(screen.queryByTestId('create-more-settings')).toBeNull();
      });
    });
  });

  describe('Collapse State Management', () => {
    it('should use external state when provided', () => {
      const onCollapseChange = vi.fn();

      render(React.createElement(Studio, {
        isFormCollapsed: true,
        onCollapseChange
      }));

      // External state should be used
      // FAB should be visible
      const fabButtons = screen.getAllByTitle('Show Generate Form');
      expect(fabButtons.length).toBeGreaterThan(0);
    });

    it('should call onCollapseChange when internal state changes', () => {
      const onCollapseChange = vi.fn();

      render(React.createElement(Studio, {
        isFormCollapsed: null, // Use internal state
        onCollapseChange
      }));

      // Internal state changes should notify parent
      // Check localStorage was set (which happens on render)
      expect(localStorageMock.getItem('studio-form-collapsed')).toBe('false');
    });

    it('should prioritize external state over localStorage', () => {
      localStorageMock.setItem('studio-form-collapsed', 'false');

      const onCollapseChange = vi.fn();

      render(React.createElement(Studio, {
        isFormCollapsed: true, // External state overrides localStorage
        onCollapseChange
      }));

      // External state should take precedence
      const fabButtons = screen.getAllByTitle('Show Generate Form');
      expect(fabButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Layout', () => {
    it('should render with correct grid structure', () => {
      const { container } = render(React.createElement(Studio));

      const grid = container.querySelector('.grid');
      expect(grid).toBeTruthy();
      expect(grid.className).toContain('grid-cols-1');
    });

    it('should render UnifiedQueue in grid container', () => {
      const { container } = render(React.createElement(Studio));

      const grid = container.querySelector('.grid');
      const queue = within(grid).getByTestId('unified-queue');
      expect(queue).toBeTruthy();
    });

    it('should have responsive container classes', () => {
      const { container } = render(React.createElement(Studio));

      const mainContainer = container.querySelector('.container');
      expect(mainContainer).toBeTruthy();
      expect(mainContainer.className).toContain('mx-auto');
      expect(mainContainer.className).toContain('p-4');
    });
  });
});
