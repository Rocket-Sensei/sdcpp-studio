import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SettingsModal } from '../frontend/src/components/SettingsModal';
import * as apiUtils from '../frontend/src/utils/api';

// Mock the API utilities
vi.mock('../frontend/src/utils/api', () => ({
  getStoredApiKey: vi.fn(),
  saveApiKey: vi.fn(),
  clearApiKey: vi.fn(),
  validateApiKey: vi.fn(),
}));

// Mock the ApiKeyContext
vi.mock('../frontend/src/contexts/ApiKeyContext', () => ({
  useApiKeyContext: () => ({
    notifyApiKeyChanged: vi.fn(),
  }),
}));

describe('SettingsModal Component', () => {
  const mockOnClose = vi.fn();
  const mockNotifyApiKeyChanged = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mock returns
    vi.mocked(apiUtils.getStoredApiKey).mockReturnValue(null);
    vi.mocked(apiUtils.validateApiKey).mockResolvedValue(true);
  });

  describe('Rendering', () => {
    it('should render nothing when isOpen is false', () => {
      const { container } = render(
        <SettingsModal isOpen={false} onClose={mockOnClose} />
      );
      expect(container.firstChild).toBe(null);
    });

    it('should render modal when isOpen is true', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('Settings')).toBeInTheDocument();
      expect(screen.getByText('API Key')).toBeInTheDocument();
    });

    it('should display description text', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      expect(screen.getByText(/Set your API key for authentication/)).toBeInTheDocument();
    });

    it('should load existing API key on open', async () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('existing-key-123');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      expect(input).toHaveValue('existing-key-123');
    });

    it('should show Clear button when API key exists', () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('existing-key');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('Clear')).toBeInTheDocument();
    });

    it('should not show Clear button when API key is empty', () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      expect(screen.queryByText('Clear')).not.toBeInTheDocument();
    });
  });

  describe('Input Behavior', () => {
    it('should allow typing API key', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      fireEvent.change(input, { target: { value: 'new-api-key' } });

      expect(input).toHaveValue('new-api-key');
    });

    it('should toggle password visibility', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      expect(input).toHaveAttribute('type', 'password');

      // Click show button
      const toggleButton = input.nextElementSibling;
      fireEvent.click(toggleButton);

      expect(input).toHaveAttribute('type', 'text');

      // Click hide button
      fireEvent.click(toggleButton);

      expect(input).toHaveAttribute('type', 'password');
    });

    it('should disable input while validating', () => {
      vi.mocked(apiUtils.validateApiKey).mockImplementation(
        () => new Promise(resolve => setTimeout(() => resolve(true), 1000))
      );

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const form = screen.getByText('Save').closest('form');
      const input = screen.getByPlaceholderText('Enter your API key');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      expect(input).toBeDisabled();
    });
  });

  describe('Form Submission', () => {
    it('should save API key when validation succeeds', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-api-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(apiUtils.validateApiKey).toHaveBeenCalledWith('valid-api-key');
        expect(apiUtils.saveApiKey).toHaveBeenCalledWith('valid-api-key');
      });
    });

    it('should show success message on valid save', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
      });
    });

    it('should hide success message after 2 seconds', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'valid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
      });

      // Wait for the timeout to occur
      await waitFor(
        () => {
          expect(screen.queryByText('Settings saved successfully!')).not.toBeInTheDocument();
        },
        { timeout: 3000 }
      );
    });

    it('should show error message when validation fails', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'invalid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key. Please check and try again.')).toBeInTheDocument();
      });
    });

    it('should show error message when validation throws error', async () => {
      vi.mocked(apiUtils.validateApiKey).mockRejectedValue(new Error('Network error'));

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
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
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
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
        expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
      });
    });

    it('should stop showing validating state after validation completes', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: 'test-key' } });
      fireEvent.submit(form);

      expect(screen.getByText('Validating...')).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByText('Validating...')).not.toBeInTheDocument();
      });
    });
  });

  describe('Clear API Key', () => {
    it('should clear API key when Clear button is clicked', () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('existing-key');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);

      expect(apiUtils.clearApiKey).toHaveBeenCalled();
    });

    it('should show success message after clearing', async () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('existing-key');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const clearButton = screen.getByText('Clear');
      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully!')).toBeInTheDocument();
      });
    });

    it('should empty input after clearing', async () => {
      vi.mocked(apiUtils.getStoredApiKey).mockReturnValue('existing-key');

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const clearButton = screen.getByText('Clear');

      expect(input).toHaveValue('existing-key');

      fireEvent.click(clearButton);

      await waitFor(() => {
        expect(input).toHaveValue('');
      });
    });
  });

  describe('Modal Actions', () => {
    it('should call onClose when Close button is clicked', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const closeButton = screen.getByText('Cancel');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when X button is clicked', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const closeButton = document.querySelector('button[class*="text-muted-foreground"]');
      fireEvent.click(closeButton);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop is clicked', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const backdrop = screen.getByText('Settings').closest('.fixed');
      fireEvent.click(backdrop);

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('should not call onClose when modal content is clicked', () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const modalContent = screen.getByText('Settings').closest('.bg-card');
      fireEvent.click(modalContent);

      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('State Reset', () => {
    it('should reset state when modal is closed and reopened', async () => {
      vi.mocked(apiUtils.validateApiKey).mockResolvedValue(false);

      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      // Trigger error
      fireEvent.change(input, { target: { value: 'invalid-key' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(screen.getByText('Invalid API key. Please check and try again.')).toBeInTheDocument();
      });

      // Close and reopen
      render(<SettingsModal isOpen={false} onClose={mockOnClose} />);
      render(<SettingsModal isOpen={true} onClose={mockOnClose} />);

      // Error should be cleared
      await waitFor(() => {
        expect(screen.queryByText('Invalid API key. Please check and try again.')).not.toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty API key submission', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: '' } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(apiUtils.validateApiKey).toHaveBeenCalledWith('');
        expect(apiUtils.saveApiKey).toHaveBeenCalledWith('');
      });
    });

    it('should handle special characters in API key', async () => {
      render(
        <SettingsModal isOpen={true} onClose={mockOnClose} />
      );

      const specialKey = 'sk-1234567890abcdefghijklmnopqrstuvwxyz!@#$%^&*()';

      const input = screen.getByPlaceholderText('Enter your API key');
      const form = input.closest('form');

      fireEvent.change(input, { target: { value: specialKey } });
      fireEvent.submit(form);

      await waitFor(() => {
        expect(apiUtils.validateApiKey).toHaveBeenCalledWith(specialKey);
      });
    });
  });
});
