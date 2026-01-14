import { useState, useEffect, useCallback } from 'react';
import { Key } from 'lucide-react';
import { isAuthRequired, getStoredApiKey, validateApiKey, saveApiKey } from '../utils/api';
import { ApiKeyModal } from './ApiKeyModal';

/**
 * App Boot States
 */
const BOOT_STATE = {
  INITIALIZING: 'initializing',
  CHECKING_AUTH: 'checking_auth',
  NEEDS_API_KEY: 'needs_api_key',
  VALIDATING_KEY: 'validating_key',
  READY: 'ready',
  ERROR: 'error',
};

/**
 * AppBoot Component - Handles initial app initialization and auth checking
 *
 * This component ensures that:
 * 1. Auth is checked BEFORE any UI renders
 * 2. API key is collected if needed before app loads
 * 3. Clean loading states are shown during boot
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The main app component (only rendered when ready)
 * @param {Function} props.onBootComplete - Callback when boot is complete
 * @param {Function} props.onApiKeyChange - Callback when API key is set/changed
 */
export function AppBoot({ children, onBootComplete, onApiKeyChange }) {
  const [bootState, setBootState] = useState(BOOT_STATE.INITIALIZING);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState(null);

  // Initialize: Check if auth is required
  useEffect(() => {
    const initialize = async () => {
      setBootState(BOOT_STATE.CHECKING_AUTH);

      try {
        const required = await isAuthRequired();
        setAuthRequired(required);

        if (required) {
          const storedKey = getStoredApiKey();
          if (!storedKey) {
            // Auth required and no key - show modal
            setBootState(BOOT_STATE.NEEDS_API_KEY);
          } else {
            // Auth required but key exists - validate it
            setBootState(BOOT_STATE.VALIDATING_KEY);
            const isValid = await validateApiKey(storedKey);

            if (isValid) {
              setBootState(BOOT_STATE.READY);
              onBootComplete?.();
            } else {
              // Key is invalid - show modal to get new key
              setBootState(BOOT_STATE.NEEDS_API_KEY);
            }
          }
        } else {
          // No auth required - ready to boot
          setBootState(BOOT_STATE.READY);
          onBootComplete?.();
        }
      } catch (err) {
        console.error('Boot initialization error:', err);
        setError(err.message);
        setBootState(BOOT_STATE.ERROR);
      }
    };

    initialize();
  }, [onBootComplete]);

  // Handle API key submission
  const handleApiKeySubmit = useCallback(async (apiKey) => {
    setBootState(BOOT_STATE.VALIDATING_KEY);
    setError(null);

    try {
      const isValid = await validateApiKey(apiKey);

      if (isValid) {
        saveApiKey(apiKey);
        onApiKeyChange?.();
        setBootState(BOOT_STATE.READY);
        onBootComplete?.();
      } else {
        setError('Invalid API key. Please check and try again.');
        setBootState(BOOT_STATE.NEEDS_API_KEY);
      }
    } catch (err) {
      console.error('API key validation error:', err);
      setError('Failed to validate API key. Please try again.');
      setBootState(BOOT_STATE.NEEDS_API_KEY);
    }
  }, [onBootComplete, onApiKeyChange]);

  // Render loading state during initialization
  if (bootState === BOOT_STATE.INITIALIZING || bootState === BOOT_STATE.CHECKING_AUTH) {
    return <BootLoadingScreen message="Initializing..." />;
  }

  // Render validating state
  if (bootState === BOOT_STATE.VALIDATING_KEY) {
    return <BootLoadingScreen message="Validating API key..." />;
  }

  // Render error state
  if (bootState === BOOT_STATE.ERROR) {
    return <BootErrorScreen error={error} onRetry={() => window.location.reload()} />;
  }

  // Render API key modal if needed (BEFORE rendering children)
  if (bootState === BOOT_STATE.NEEDS_API_KEY) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <ApiKeyModal
          isOpen={true}
          onClose={() => {} /* Prevent closing */}
          onSuccess={() => {} /* Handled by handleApiKeySubmit */}
          onSubmit={handleApiKeySubmit}
          error={error}
        />
      </div>
    );
  }

  // Ready - render the main app
  if (bootState === BOOT_STATE.READY) {
    return <>{children}</>;
  }

  return null;
}

/**
 * BootLoadingScreen - Shows loading animation during app initialization
 */
function BootLoadingScreen({ message }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      <div className="flex items-center gap-4">
        <Key className="h-8 w-8 text-primary animate-pulse" />
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
      <p className="mt-4 text-muted-foreground">{message}</p>
    </div>
  );
}

/**
 * BootErrorScreen - Shows error screen if boot fails
 */
function BootErrorScreen({ error, onRetry }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="max-w-md text-center space-y-4">
        <Key className="h-12 w-12 text-destructive mx-auto" />
        <h1 className="text-xl font-semibold">Initialization Error</h1>
        <p className="text-muted-foreground">{error || 'Failed to initialize application'}</p>
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
        >
          Retry
        </button>
      </div>
    </div>
  );
}

export default AppBoot;
