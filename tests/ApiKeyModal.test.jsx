import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ApiKeyModal } from '../frontend/src/components/ApiKeyModal';
import { ApiKeyProvider as ApiKeyContextProvider } from '../frontend/src/contexts/ApiKeyContext';
import * as apiUtils from '../frontend/src/utils/api';

// Mock the API utilities
vi.mock('../frontend/src/utils/api', () => ({
  saveApiKey: vi.fn(),
  validateApiKey: vi.fn(),
  isAuthRequired: vi.fn(),
}));

// Mock the ApiKeyContext
const mockNotifyApiKeyChanged = vi.fn();
vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  useApiKeyContext: () => ({
    notifyApiKeyChanged: mockNotifyApiKeyChanged,
  }),
}));

describe('ApiKeyModal Component', () => {
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Setup default mock returns
    vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
  });

  describe('Rendering', () => {
    it('should render nothing when isOpen is false', () => {
      const { container } = render(
        <ApiKeyModal isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );
      expect(container.firstChild).toBe(null);
    });

    it('should render modal when isOpen is true', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByText('API Key Required')).toBeInTheDocument();
      expect(screen.getByText(/This application requires an API key/)).toBeInTheDocument();
    });

    it('should render input field', () => {
      const { container } = render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'password');
      expect(input).toHaveAttribute('placeholder', 'Enter your API key');
    });

    it('should render submit button', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const submitButton = screen.getByText('Submit');
      expect(submitButton).toBeInTheDocument();
    });
  });

  describe('Input Behavior', () => {
    it('should allow typing API key', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      fireEvent.change(input, { target: { value: 'test-api-key' } });

      expect(input).toHaveValue('test-api-key');
    });

    it('should disable input while validating', async () => {
      vi.mocked(apiUtils.validateApiKey).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 1000))
      );

      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      expect(input).toBeDisabled();
    });

    it('should disable input on success', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(input).toBeDisabled();
      });
    });
  });

  describe('Form Submission', () => {
    it('should validate API key on submit', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(apiUtils.validateApiKey).toHaveBeenCalledWith('test-key');
      });
    });

    it('should save API key when validation succeeds', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(apiUtils.saveApiKey).toHaveBeenCalledWith('valid-key');
      });
    });

    it('should call notifyApiKeyChanged on successful validation', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(mockNotifyApiKeyChanged).toHaveBeenCalled();
      });
    });

    it('should show success message and call callbacks after validation', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('API key validated successfully!')).toBeInTheDocument();
      });

      // Wait for the 500ms delay and callbacks
      await waitFor(
        () => {
          expect(mockOnSuccess).toHaveBeenCalled();
          expect(mockOnClose).toHaveBeenCalled();
        },
        { timeout: 2000 }
      );
    });

    it('should show error message when validation fails', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);

      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'invalid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key. Please check and try again.')).toBeInTheDocument();
      });
    });

    it('should show error message when validation throws error', async () => {
      vi.mocked(apiUtils.validateApiKey).mockRejectedValue(
        new Error('Network error')
      );

      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Failed to validate API key. Please try again.')).toBeInTheDocument();
      });
    });

    it('should clear previous error when submitting new value', async () => {
      vi.mocked(apiUtils.validateApiKey)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      // First submission fails
      fireEvent.change(input, { target: { value: 'invalid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key. Please check and try again.')).toBeInTheDocument();
      });

      // Second submission succeeds
      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.queryByText('Invalid API key. Please check and try again.')).not.toBeInTheDocument();
      });
    });

    it('should disable submit button when API key is empty', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const submitButton = screen.getByText('Submit');

      expect(input).toHaveValue('');
      expect(submitButton).toBeDisabled();
    });

    it('should enable submit button when API key is entered', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const submitButton = screen.getByText('Submit');

      fireEvent.change(input, { target: { value: 'test-key' } });

      expect(submitButton).not.toBeDisabled();
    });

    it('should show Validating... spinner during validation', async () => {
      vi.mocked(apiUtils.validateApiKey).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 1000))
      );

      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      expect(screen.getByText('Validating...')).toBeInTheDocument();
    });

    it('should show Success state after validation', async () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Success')).toBeInTheDocument();
      });
    });
  });

  describe('Backdrop Click', () => {
    it('should prevent closing when backdrop is clicked', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const backdrop = screen.getByText('API Key Required').closest('.fixed');
      fireEvent.click(backdrop);

      expect(mockOnClose).not.toHaveBeenCalled();
      expect(screen.getByText('API key is required to use this application.')).toBeInTheDocument();
    });

    it('should show error message on backdrop click', () => {
      render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const backdrop = screen.getByText('API Key Required').closest('.fixed');
      fireEvent.click(backdrop);

      expect(screen.getByText('API key is required to use this application.')).toBeInTheDocument();
    });
  });

  describe('State Reset', () => {
    it('should reset state when modal closes', async () => {
      const { rerender } = render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      fireEvent.change(input, { target: { value: 'test-key' } });

      expect(input).toHaveValue('test-key');

      // Close modal
      rerender(
        <ApiKeyModal isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Reopen
      rerender(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.getByLabelText('API Key')).toHaveValue('');
    });

    it('should clear errors when modal closes', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);

      const { rerender } = render(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      const input = screen.getByLabelText('API Key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'invalid' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key. Please check and try again.')).toBeInTheDocument();
      });

      // Close modal
      rerender(
        <ApiKeyModal isOpen={false} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Reopen
      rerender(
        <ApiKeyModal isOpen={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      expect(screen.queryByText('Invalid API key. Please check and try again.')).not.toBeInTheDocument();
    });
  });
});

// NOTE: The ApiKeyProvider tests below are commented out because they reference
// a component that doesn't exist. The auth checking and boot logic is in
// AppBoot component, not in a wrapper ApiKeyProvider. These tests should
// be rewritten to test AppBoot instead, or the ApiKeyProvider wrapper
// should be created if that functionality is desired.
/*
describe('ApiKeyProvider Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    // Setup default mock returns
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(true);
  });

  it('should show loading state initially', () => {
    const { container } = render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render children after auth check', async () => {
    const { container } = render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    // Wait for auth check to complete
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should show modal when auth is required and no key stored', async () => {
    render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('API Key Required')).toBeInTheDocument();
    });
  });

  it('should not show modal when auth is not required', async () => {
    vi.mocked(apiUtils.isAuthRequired).mockResolvedValue(false);

    render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('API Key Required')).not.toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should not show modal when auth is required but key is stored', async () => {
    localStorage.setItem('sd-cpp-studio-api-key', 'stored-key');

    render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.queryByText('API Key Required')).not.toBeInTheDocument();
    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });

  it('should close modal after successful key submission', async () => {
    const TestWrapper = () => (
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    render(<TestWrapper />);

    await waitFor(() => {
      expect(screen.getByText('API Key Required')).toBeInTheDocument();
    });

    // Submit a valid key
    const input = screen.getByLabelText('API Key');
    const form = input.closest('form');

    // Use act to ensure state updates are processed
    fireEvent.change(input, { target: { value: 'valid-key' } });

    // Wait for input value to be set
    await waitFor(() => {
      expect(input).toHaveValue('valid-key');
    });

    // Submit form
    fireEvent.submit(form);

    // Wait for success message
    await waitFor(
      () => {
        expect(screen.getByText('API key validated successfully!')).toBeInTheDocument();
      },
      { timeout: 2000 }
    );

    // Wait for delay and modal close
    await waitFor(
      () => {
        expect(screen.queryByText('API Key Required')).not.toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it('should handle auth check errors gracefully', async () => {
    vi.mocked(apiUtils.isAuthRequired).mockRejectedValue(
      new Error('Auth check failed')
    );

    const { container } = render(
      <ApiKeyProvider>
        <div>Child Content</div>
      </ApiKeyProvider>
    );

    // Should still render children despite error
    await waitFor(() => {
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });

    expect(screen.getByText('Child Content')).toBeInTheDocument();
  });
});
*/