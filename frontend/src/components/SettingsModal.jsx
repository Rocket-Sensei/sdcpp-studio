import { useState, useEffect } from 'react';
import { X, Key, Check, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { getStoredApiKey, saveApiKey, clearApiKey, validateApiKey } from '../utils/api';
import { useApiKeyContext } from '../contexts/ApiKeyContext';

/**
 * SettingsModal - Modal for managing application settings
 * Currently focused on API key management with room for expansion
 */
export function SettingsModal({ isOpen, onClose }) {
  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { notifyApiKeyChanged } = useApiKeyContext();

  // Load stored API key when modal opens
  useEffect(() => {
    if (isOpen) {
      const storedKey = getStoredApiKey();
      setApiKey(storedKey || '');
      setError(null);
      setSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setIsValidating(true);

    try {
      // Validate the new API key
      const isValid = await validateApiKey(apiKey);

      if (isValid) {
        saveApiKey(apiKey);
        notifyApiKeyChanged();
        setSuccess(true);
        setTimeout(() => {
          setSuccess(false);
        }, 2000);
      } else {
        setError('Invalid API key. Please check and try again.');
      }
    } catch (err) {
      setError('Failed to validate API key. Please try again.');
    } finally {
      setIsValidating(false);
    }
  };

  const handleClearApiKey = () => {
    setApiKey('');
    clearApiKey();
    notifyApiKeyChanged();
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
    }, 2000);
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleBackdropClick}
    >
      <div className="bg-card text-card-foreground rounded-lg shadow-lg w-full max-w-md mx-4 border border-border max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Settings</h2>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* API Key Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">API Key</h3>
              {apiKey && (
                <button
                  onClick={handleClearApiKey}
                  className="text-xs text-destructive hover:text-destructive/80 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            <p className="text-xs text-muted-foreground">
              Set your API key for authentication. Leave empty to disable.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your API key"
                  className="w-full px-3 py-2 pr-10 bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  disabled={isValidating}
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
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
                  <p className="text-sm text-green-500">Settings saved successfully!</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-border rounded-md hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isValidating}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isValidating ? (
                    <>
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                      Validating...
                    </>
                  ) : (
                    'Save'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
