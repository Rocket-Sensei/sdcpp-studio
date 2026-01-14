import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Key, Check, AlertCircle } from 'lucide-react';
import { saveApiKey, validateApiKey, isAuthRequired } from '../utils/api';
import { useApiKeyContext } from '../contexts/ApiKeyContext';

/**
 * ApiKeyModal - Modal for prompting user to enter API key when authentication is required
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {Function} props.onClose - Callback when modal is closed
 * @param {Function} props.onSuccess - Callback when API key is successfully validated
 */
export function ApiKeyModal({ isOpen, onClose, onSuccess }) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const apiKeyRef = useRef(apiKey);
  const { notifyApiKeyChanged } = useApiKeyContext();

  // Keep ref in sync with state
  useEffect(() => {
    apiKeyRef.current = apiKey;
  }, [apiKey]);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setApiKey('');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    setError(null);
    setIsValidating(true);

    try {
      // Read from ref to always get the current value
      const submittedKey = apiKeyRef.current;

      const isValid = await validateApiKey(submittedKey);

      if (isValid) {
        saveApiKey(submittedKey);
        notifyApiKeyChanged(); // Notify listeners that API key changed
        setSuccess(true);
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 500);
      } else {
        setError('Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setError('Failed to validate API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  }, [notifyApiKeyChanged, onSuccess, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      // Prevent closing with backdrop click - user must enter a key
      setError('API key is required to use this application.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-lg w-full max-w-md mx-4 border border-border">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">API Key Required</h2>
          </div>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-sm text-muted-foreground mb-4">
            This application requires an API key for authentication. Please enter your key below.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="api-key" className="block text-sm font-medium mb-2">
                API Key
              </label>
              <input
                id="api-key"
                name="api-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Enter your API key"
                className="w-full px-3 py-2 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                disabled={isValidating || success}
                autoFocus
              />
            </div>

            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            {/* Success Message */}
            {success && (
              <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-md">
                <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                <p className="text-sm text-green-500">API key validated successfully!</p>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={!apiKey || isValidating || success}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isValidating ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Validating...
                  </>
                ) : success ? (
                  <>
                    <Check className="h-4 w-4" />
                    Success
                  </>
                ) : (
                  'Submit'
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * ApiKeyProvider - Higher-order component that manages API key state
 * Shows modal when authentication is required and key is missing
 */
export function ApiKeyProvider({ children }) {
  const [showModal, setShowModal] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if auth is required on mount
    const checkAuth = async () => {
      try {
        const required = await isAuthRequired();
        setAuthRequired(required);

        // If auth is required and no key is stored, show modal
        if (required) {
          const storedKey = localStorage.getItem('sd-cpp-studio-api-key');
          if (!storedKey) {
            setShowModal(true);
          }
        }
      } catch (error) {
        console.error('Failed to check auth requirement:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleModalSuccess = useCallback(() => {
    setShowModal(false);
  }, []);

  const handleModalClose = useCallback(() => {
    // Prevent closing without valid key - do nothing
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <ApiKeyModal
        isOpen={showModal && authRequired}
        onClose={handleModalClose}
        onSuccess={handleModalSuccess}
      />
    </>
  );
}
