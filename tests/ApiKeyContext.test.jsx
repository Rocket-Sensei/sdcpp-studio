/**
 * Tests for ApiKeyContext provider hierarchy
 *
 * These tests verify the real behavior of ApiKeyContext without using mocks.
 * This is critical because the global mock in setup.js masks provider hierarchy bugs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Clear the global mock for ApiKeyContext to test real behavior
vi.unmock('../frontend/src/contexts/ApiKeyContext');

// Import real components (not mocked)
import { ApiKeyProvider as ApiKeyContextProvider, useApiKeyContext } from '../frontend/src/contexts/ApiKeyContext';
import { ApiKeyModal, ApiKeyProvider } from '../frontend/src/components/ApiKeyModal';

// Mock the API utilities that ApiKeyModal uses
vi.mock('../frontend/src/utils/api', () => ({
  saveApiKey: vi.fn(),
  validateApiKey: vi.fn(() => Promise.resolve(true)),
  isAuthRequired: vi.fn(() => Promise.resolve(false)),
  getStoredApiKey: vi.fn(() => null),
}));

describe('ApiKeyContext Provider Hierarchy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear localStorage before each test
    if (typeof window !== 'undefined') {
      window.localStorage.clear();
    }
  });

  describe('useApiKeyContext hook', () => {
    it('should throw error when used outside of ApiKeyContextProvider', () => {
      // Create a test component that uses the hook outside the provider
      function TestComponent() {
        useApiKeyContext();
        return React.createElement('div', null, 'Should not render');
      }

      // This should throw because there's no provider
      expect(() => {
        render(React.createElement(TestComponent));
      }).toThrow('useApiKeyContext must be used within ApiKeyProvider');
    });

    it('should NOT throw error when used inside ApiKeyContextProvider', () => {
      // Create a test component that uses the hook inside the provider
      function TestComponent() {
        const context = useApiKeyContext();
        return React.createElement('div', { 'data-testid': 'context-result' }, JSON.stringify(context));
      }

      // This should NOT throw because we have the provider
      expect(() => {
        render(
          React.createElement(
            ApiKeyContextProvider,
            null,
            React.createElement(TestComponent)
          )
        );
      }).not.toThrow();

      // Verify the context is accessible
      expect(screen.getByTestId('context-result')).toBeInTheDocument();
    });

    it('should provide context values (apiKey, version, notifyApiKeyChanged)', () => {
      function TestComponent() {
        const { apiKey, version, notifyApiKeyChanged } = useApiKeyContext();
        return React.createElement('div', {
          'data-testid': 'context-values',
          'data-api-key': apiKey || '',
          'data-version': version,
          'data-has-notify': typeof notifyApiKeyChanged === 'function' ? 'true' : 'false'
        });
      }

      render(
        React.createElement(
          ApiKeyContextProvider,
          null,
          React.createElement(TestComponent)
        )
      );

      const result = screen.getByTestId('context-values');
      expect(result).toHaveAttribute('data-api-key', '');
      expect(result).toHaveAttribute('data-version', '0');
      expect(result).toHaveAttribute('data-has-notify', 'true');
    });
  });

  describe('ApiKeyModal with ApiKeyContext', () => {
    it('should throw error when rendered without ApiKeyContextProvider', () => {
      // Render ApiKeyModal directly without the provider
      // Note: We render it with isOpen=false because the error happens during hook execution
      expect(() => {
        render(
          React.createElement(ApiKeyModal, {
            isOpen: false,
            onClose: vi.fn(),
            onSuccess: vi.fn()
          })
        );
      }).toThrow('useApiKeyContext must be used within ApiKeyProvider');
    });

    it('should NOT throw error when rendered inside ApiKeyContextProvider', () => {
      expect(() => {
        render(
          React.createElement(
            ApiKeyContextProvider,
            null,
            React.createElement(ApiKeyModal, {
              isOpen: false,
              onClose: vi.fn(),
              onSuccess: vi.fn()
            })
          )
        );
      }).not.toThrow();
    });
  });

  describe('AppWithProviders provider hierarchy', () => {
    it('should render correctly when providers are in the correct order', async () => {
      const { AppWithProviders } = await import('../frontend/src/App');

      // The correct order is: ApiKeyContextProvider OUTSIDE ApiKeyProvider
      // This ensures ApiKeyModal (rendered by ApiKeyProvider) can access the context
      expect(() => {
        render(React.createElement(AppWithProviders));
      }).not.toThrow();
    });

    it('should have ApiKeyContextProvider wrapping ApiKeyProvider', async () => {
      const { AppWithProviders } = await import('../frontend/src/App');

      // Render the app
      render(React.createElement(AppWithProviders));

      // If the providers were in the wrong order, we would get an error
      // The fact that this doesn't throw means the hierarchy is correct
      expect(true).toBe(true);
    });
  });

  describe('ApiKeyContext version increment', () => {
    it('should increment version when notifyApiKeyChanged is called', () => {
      let capturedNotify = null;

      function TestComponent() {
        const { version, notifyApiKeyChanged } = useApiKeyContext();
        capturedNotify = notifyApiKeyChanged;
        return React.createElement('div', { 'data-testid': 'version-display', 'data-version': version });
      }

      const { rerender } = render(
        React.createElement(
          ApiKeyContextProvider,
          null,
          React.createElement(TestComponent)
        )
      );

      // Initial version should be 0
      expect(screen.getByTestId('version-display')).toHaveAttribute('data-version', '0');

      // Call notifyApiKeyChanged
      capturedNotify();

      // Re-render to see the updated version
      rerender(
        React.createElement(
          ApiKeyContextProvider,
          null,
          React.createElement(TestComponent)
        )
      );

      // Version should now be 1
      expect(screen.getByTestId('version-display')).toHaveAttribute('data-version', '1');
    });
  });
});
