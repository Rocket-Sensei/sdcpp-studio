/**
 * Tests for AppBoot component and API key entry flow
 *
 * Verifies the proper boot sequence:
 * 1. Initial loading state
 * 2. Auth check via /api/config
 * 3. API key modal if auth required and no key
 * 4. Validation of existing keys
 * 5. App renders after successful auth
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import { AppBoot } from '../frontend/src/components/AppBoot';
import * as apiUtils from '../frontend/src/utils/api';

// Mock API utilities
vi.mock('../frontend/src/utils/api', () => ({
  isAuthRequired: vi.fn(),
  getStoredApiKey: vi.fn(),
  validateApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  authenticatedFetch: vi.fn(),
}));

// Mock the ApiKeyContext
vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  useApiKeyContext: () => ({
    notifyApiKeyChanged: vi.fn(),
  }),
}));

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
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(false);
  });

  describe('Initial Loading State', () => {
    it('should show loading screen on mount', () => {
      // Make isAuthRequired hang to test initial state
      vi.mocked(apiUtils.isAuthRequired).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<AppBoot>App Content</AppBoot>);

      expect(screen.getByText('Initializing...')).toBeInTheDocument();
    });

    it('should show loading with correct message', () => {
      vi.mocked(apiUtils.isAuthRequired).mockImplementation(
        () => new Promise(() => {})
      );

      render(<AppBoot>App Content</AppBoot>);

      const loadingElement = screen.getByText(/Initializing/i);
      expect(loadingElement).toBeInTheDocument();
    });
  });

  describe('No Auth Required', () => {
    it('should render children when auth is not required', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(false);

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
      });
    });

    it('should call onBootComplete when auth is not required', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(false);
      const onBootComplete = vi.fn();

      render(<AppBoot onBootComplete={onBootComplete}>App Content</AppBoot>);

      await waitFor(() => {
        expect(onBootComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Auth Required - No Stored Key', () => {
    beforeEach(() => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
    });

    it('should show API key modal when auth is required and no key exists', async () => {
      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });
    });

    it('should NOT render children while waiting for API key', async () => {
      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.queryByText('App Content')).not.toBeInTheDocument();
      });
    });

    it('should validate and save API key when submitted', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);
      const onApiKeyChange = vi.fn();
      const onBootComplete = vi.fn();

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

      // Wait for validation and boot completion
      await waitFor(() => {
        expect(apiUtils.validateApiKey).toHaveBeenCalled();
        expect(onBootComplete).toHaveBeenCalled();
      });
    });

    it('should show error when API key validation fails', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('submit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('error-message')).toBeInTheDocument();
      });
    });

    it('should show error when validation throws', async () => {
      vi.mocked(apiUtils.validateApiKey).mockRejectedValue(
        new Error('Network error')
      );

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
  });

  describe('Auth Required - Invalid Stored Key', () => {
    beforeEach(() => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('invalid-key');
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);
    });

    it('should show API key modal when stored key is invalid', async () => {
      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
      });
    });

    it('should show validating state first', async () => {
      // Make validateApiKey hang temporarily
      vi.mocked(apiUtils.validateApiKey).mockImplementation(
        () => new Promise(() => {})
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Validating API key...')).toBeInTheDocument();
      });
    });
  });

  describe('Auth Required - Valid Stored Key', () => {
    beforeEach(() => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('valid-key');
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);
    });

    it('should render children when valid key exists', async () => {
      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
      });
    });

    it('should not show API key modal', async () => {
      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.queryByTestId('api-key-modal')).not.toBeInTheDocument();
      });
    });

    it('should call onBootComplete', async () => {
      const onBootComplete = vi.fn();

      render(<AppBoot onBootComplete={onBootComplete}>App Content</AppBoot>);

      await waitFor(() => {
        expect(onBootComplete).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error screen when auth check fails', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockRejectedValue(
        new Error('Config fetch failed')
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Initialization Error')).toBeInTheDocument();
      });
    });

    it('should allow retry when error occurs', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockRejectedValue(
        new Error('Config fetch failed')
      );

      render(<AppBoot>App Content</AppBoot>);

      await waitFor(() => {
        expect(screen.getByText('Retry')).toBeInTheDocument();
      });

      // Note: Testing the actual retry would require reloading the page
      // which is not practical in unit tests
    });
  });

  describe('Boot State Transitions', () => {
    it('should transition: initializing -> checking_auth -> ready (no auth)', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(false);

      render(<AppBoot>App Content</AppBoot>);

      // Should show loading first
      expect(screen.getByText('Initializing...')).toBeInTheDocument();

      // Should transition to ready and show children
      await waitFor(() => {
        expect(screen.getByText('App Content')).toBeInTheDocument();
        expect(screen.queryByText('Initializing...')).not.toBeInTheDocument();
      });
    });

    it('should transition: initializing -> checking_auth -> needs_api_key (auth required)', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);

      render(<AppBoot>App Content</AppBoot>);

      // Should show loading first
      expect(screen.getByText('Initializing...')).toBeInTheDocument();

      // Should transition to API key modal
      await waitFor(() => {
        expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
        expect(screen.queryByText('Initializing...')).not.toBeInTheDocument();
      });
    });

    it('should transition: needs_api_key -> validating_key -> ready after submit', async () => {
      vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);

      const onBootComplete = vi.fn();

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
});

describe('API Key Entry Flow - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('should complete full flow: check -> prompt -> validate -> boot', async () => {
    // Simulate: auth required, no key
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
    vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
    vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);

    const onBootComplete = vi.fn();
    const onApiKeyChange = vi.fn();

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
    });
  });

  it('should allow retry after failed validation', async () => {
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
    vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);

    // First attempt fails, second succeeds
    vi.mocked(apiUtils.validateApiKey)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);

    render(
      <AppBoot>
        <div data-testid="main-app">Main Application</div>
      </AppBoot>
    );

    await waitFor(() => {
      expect(screen.getByTestId('api-key-modal')).toBeInTheDocument();
    });

    // First submit fails (empty input, but that's okay for the mock)
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
});
