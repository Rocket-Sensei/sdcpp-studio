/**
 * Tests for AppBoot component and API key entry flow
 *
 * Verifies the proper boot sequence:
 * 1. Initial loading state (initializing)
 * 2. Auth check via authenticatedFetch('/api/config')
 * 3. API key modal if 401 response
 * 4. App renders after successful auth
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { AppBoot } from '../frontend/src/components/AppBoot';
import * as apiUtils from '../frontend/src/utils/api';

// Mock API utilities
vi.mock('../frontend/src/utils/api', () => ({
  getStoredApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

// Import mock helper
import { createMockResponse } from './setup.js';

// Mock the ApiKeyModal
vi.mock('../frontend/src/components/ApiKeyModal', () => {
  return {
    ApiKeyModal: ({ isOpen, onSubmit, error }) => {
      const [inputValue, setInputValue] = React.useState('');

      if (!isOpen) return null;
      return (
        <div data-testid="api-key-modal">
          <div>API Key Required</div>
          <input
            data-testid="api-key-input"
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <button
            data-testid="submit-button"
            onClick={() => {
              if (onSubmit) {
                onSubmit(inputValue || 'test-api-key');
              }
            }}
          >
            Submit
          </button>
          {error && <div data-testid="error-message">{error}</div>}
        </div>
      );
    },
  };
});

describe('AppBoot Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Setup default mock returns
    vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
  });

  describe('Initial Loading State', () => {
    it('should show loading screen on mount', () => {
      // Make authenticatedFetch hang to test initial state
      vi.mocked(apiUtils.authenticatedFetch).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<AppBoot>App Content</AppBoot>);

      expect(screen.getByText('Initializing...')).toBeInTheDocument();
    });

    it('should show loading with correct message', () => {
      vi.mocked(apiUtils.authenticatedFetch).mockImplementation(
        () => new Promise(() => {})
      );

      render(<AppBoot>App Content</AppBoot>);

      const loadingElement = screen.getByText(/Initializing/i);
      expect(loadingElement).toBeInTheDocument();
    });
  });

  describe('No Auth Required (200 OK)', () => {
    it('should render children when config fetch returns 200', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(200, true)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
      });
    });

    it('should call onBootComplete when config fetch succeeds', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(200, true)
      );
      const onBootComplete = vi.fn();

      render(<AppBoot onBootComplete={onBootComplete}>App Content</AppBoot>);

      await waitFor(() => {
        expect(onBootComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Auth Required (401 Response)', () => {
    beforeEach(() => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
    });

    it('should show API key modal when config fetch returns 401', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(401, false)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });
    });

    it('should NOT render children while waiting for API key', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(401, false)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.queryByText('App Content')).not.toBeInTheDocument();
      });
    });

    it('should save API key and retry config fetch when submitted', async () => {
      const onApiKeyChange = vi.fn();
      const onBootComplete = vi.fn();

      // First call returns 401, second returns 200 after API key is submitted
      vi.mocked(apiUtils.authenticatedFetch)
        .mockResolvedValueOnce(createMockResponse(401, false))
        .mockResolvedValueOnce(createMockResponse(200, true));

      render(
        <AppBoot onApiKeyChange={onApiKeyChange} onBootComplete={onBootComplete}>
          App Content
        </AppBoot>
      );

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      // Submit the API key
      fireEvent.click(screen.getByTestId('submit-button'));

      // Wait for saveApiKey and onBootComplete to be called
      await waitFor(() => {
        expect(apiUtils.saveApiKey).toHaveBeenCalledWith('test-api-key');
        expect(onApiKeyChange).toHaveBeenCalled();
        expect(onBootComplete).toHaveBeenCalled();
      });
    });

    it('should show error when API key is invalid (second 401)', async () => {
      // Both calls return 401 - API key is invalid
      vi.mocked(apiUtils.authenticatedFetch)
        .mockResolvedValueOnce(createMockResponse(401, false))
        .mockResolvedValueOnce(createMockResponse(401, false));

      render(<AppBoot>App Content</AppBoot>);

      // Wait for modal to appear
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      // Submit the API key
      fireEvent.click(screen.getByTestId('submit-button'));

      // Should show error message
      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
        expect(screen.getByTestId('error-message').textContent).toContain('Invalid API key');
      });
    });

    it('should show error when second fetch throws', async () => {
      vi.mocked(apiUtils.authenticatedFetch)
        .mockResolvedValueOnce(createMockResponse(401, false))
        .mockRejectedValueOnce(new Error('Network error'));

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        const errorElement = screen.getByTestId('error-message');
        expect(errorElement).toBeInTheDocument();
        expect(errorElement.textContent).toContain('Failed to validate');
      });
    });

    it('should stay in needs_api_key state when fetch returns non-401 error after submit', async () => {
      vi.mocked(apiUtils.authenticatedFetch)
        .mockResolvedValueOnce(createMockResponse(401, false))
        .mockResolvedValueOnce(createMockResponse(500, false));

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-button'));

      // Should still show modal with error
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error screen when config fetch throws', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockRejectedValue(
        new Error('Config fetch failed')
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Initialization Error')).toBeInTheDocument();
      });
    });

    it('should display error message when boot fails', async () => {
      const errorMessage = 'Network connection failed';
      vi.mocked(apiUtils.authenticatedFetch).mockRejectedValue(
        new Error(errorMessage)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText(errorMessage)).toBeInTheDocument();
      });
    });

    it('should show retry button when error occurs', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockRejectedValue(
        new Error('Config fetch failed')
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });
    });

    it('should show error when response is not OK and not 401', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(500, false)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Initialization Error')).toBeInTheDocument();
      });
    });
  });

  describe('Boot State Transitions', () => {
    it('should transition: initializing -> ready (200 OK)', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(200, true)
      );

      render(<AppBoot>App Content</AppBoot>);

      // Should show loading first
      expect(screen.getByText('Initializing...')).toBeInTheDocument();

      // Should transition to ready and show children
      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
        expect(screen.queryByText('Initializing...')).not.toBeInTheDocument();
      });
    });

    it('should transition: initializing -> needs_api_key (401)', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(401, false)
      );

      render(<AppBoot>App Content</AppBoot>);

      // Should show loading first
      expect(screen.getByText('Initializing...')).toBeInTheDocument();

      // Should transition to API key modal
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
        expect(screen.queryByText('Initializing...')).not.toBeInTheDocument();
      });
    });

    it('should transition: initializing -> error (network error)', async () => {
      vi.mocked(apiUtils.authenticatedFetch).mockRejectedValue(
        new Error('Network error')
      );

      render(<AppBoot>App Content</AppBoot>);

      // Should show loading first
      expect(screen.getByText('Initializing...')).toBeInTheDocument();

      // Should transition to error screen
      await waitFor(() => {
        expect(screen.getByText('Initialization Error')).toBeInTheDocument();
        expect(screen.queryByText('Initializing...')).not.toBeInTheDocument();
      });
    });

    it('should transition: needs_api_key -> ready after valid API key submit', async () => {
      const onBootComplete = vi.fn();

      vi.mocked(apiUtils.authenticatedFetch)
        .mockResolvedValueOnce(createMockResponse(401, false))
        .mockResolvedValueOnce(createMockResponse(200, true));

      render(
        <AppBoot onBootComplete={onBootComplete}>App Content</AppBoot>
      );

      // Wait for modal
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      // Submit API key
      fireEvent.click(screen.getByTestId('submit-button'));

      // Should transition to ready
      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
        expect(onBootComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Existing API Key in Storage', () => {
    it('should use stored API key via authenticatedFetch', async () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('stored-key');
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(200, true)
      );

      const onBootComplete = vi.fn();
      render(<AppBoot onBootComplete={onBootComplete}>App Content</AppBoot>);

      await waitFor(() => {
        expect(apiUtils.authenticatedFetch).toHaveBeenCalledWith('/api/config');
        expect(onBootComplete).toHaveBeenCalled();
      });
    });

    it('should show API key modal if stored key returns 401', async () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('invalid-stored-key');
      vi.mocked(apiUtils.authenticatedFetch).mockResolvedValue(
        createMockResponse(401, false)
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });
    });
  });
});

describe('API Key Entry Flow - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
  });

  it('should complete full flow: 401 -> prompt -> submit -> boot', async () => {
    const onBootComplete = vi.fn();
    const onApiKeyChange = vi.fn();

    // Simulate: 401 first, then 200 after key submit
    vi.mocked(apiUtils.authenticatedFetch)
      .mockResolvedValueOnce(createMockResponse(401, false))
      .mockResolvedValueOnce(createMockResponse(200, true));

    render(
      <AppBoot onBootComplete={onBootComplete} onApiKeyChange={onApiKeyChange}>
        <div data-testid="main-app">Main Application</div>
      </AppBoot>
    );

    // Step 1: Initial loading
    expect(screen.getByText('Initializing...')).toBeInTheDocument();

    // Step 2: API key modal appears
    await waitFor(() => {
      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });

    // Step 3: Submit API key
    fireEvent.click(screen.getByTestId('submit-button'));

    // Step 4: App boots successfully
    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
      expect(onBootComplete).toHaveBeenCalled();
      expect(onApiKeyChange).toHaveBeenCalled();
    });
  });

  it('should allow retry after failed validation (401 on retry)', async () => {
    // First 401 triggers modal, second 401 is invalid key, third 200 is success
    vi.mocked(apiUtils.authenticatedFetch)
      .mockResolvedValueOnce(createMockResponse(401, false))
      .mockResolvedValueOnce(createMockResponse(401, false))
      .mockResolvedValueOnce(createMockResponse(200, true));

    render(
      <AppBoot>
        <div data-testid="main-app">Main Application</div>
      </AppBoot>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });

    // First submit fails
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
    });

    // Type something for the second attempt
    const input = screen.getByTestId('api-key-input');
    fireEvent.change(input, { target: { value: 'valid-key' } });

    // Second submit succeeds
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
    });
  });

  it('should allow retry after network error on submit', async () => {
    vi.mocked(apiUtils.authenticatedFetch)
      .mockResolvedValueOnce(createMockResponse(401, false))
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(createMockResponse(200, true));

    render(
      <AppBoot>
        <div data-testid="main-app">Main Application</div>
      </AppBoot>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });

    // First submit fails with network error
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('error-message')).toBeInTheDocument();
      expect(screen.getByTestId('error-message').textContent).toContain('Failed to validate');
    });

    // Type something for the second attempt
    const input = screen.getByTestId('api-key-input');
    fireEvent.change(input, { target: { value: 'valid-key' } });

    // Second submit succeeds
    fireEvent.click(screen.getByTestId('submit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('main-app')).toBeInTheDocument();
    });
  });
});
