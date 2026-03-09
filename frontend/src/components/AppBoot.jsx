import { useState, useEffect, useCallback } from 'react';
import { Key } from 'lucide-react';
import { getStoredApiKey, saveApiKey, getServerConfig } from '../utils/api';
import { ApiKeyModal } from './ApiKeyModal';

/**
 * App Boot States
 */
const BOOT_STATE = {
  INITIALIZING: 'initializing',
  NEEDS_API_KEY: 'needs_api_key',
  READY: 'ready',
  ERROR: 'error',
};

/**
 * AppBoot Component - Handles initial app initialization and auth checking
 *
 * Logic:
 * 1. Call /api/config with stored API key (if any)
 * 2. Check response flags:
 *    - If authEnabled=false: No auth needed, proceed
 *    - If authEnabled=true and keyValid=true: Auth satisfied, proceed
 *    - If authEnabled=true and (keyPassed=false or keyValid=false): Show API key modal
 * 3. User enters key, we retry with the new key
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The main app component (only rendered when ready)
 * @param {Function} props.onBootComplete - Callback when boot is complete
 * @param {Function} props.onApiKeyChange - Callback when API key is set/changed
 */
export function AppBoot({ children, onBootComplete, onApiKeyChange }) {
  const [bootState, setBootState] = useState(BOOT_STATE.INITIALIZING);
  const [error, setError] = useState(null);

  // Initialize: Try to fetch config with stored API key
  useEffect(() => {
    const initialize = async () => {
      try {
        const storedKey = getStoredApiKey();
        const config = await getServerConfig(storedKey);

        // Check if auth is required and if the key is valid
        if (config.authEnabled && !config.keyValid) {
          // Auth is enabled but no valid key provided
          setBootState(BOOT_STATE.NEEDS_API_KEY);
          return;
        }

        // Either no auth required, or we have a valid key
        setBootState(BOOT_STATE.READY);
        onBootComplete?.();
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
    try {
      // Validate the new key with the server
      const config = await getServerConfig(apiKey);

      if (config.authEnabled && !config.keyValid) {
        // Key is invalid
        setError('Invalid API key. Please check and try again.');
        return;
      }

      // Key is valid - save it and proceed
      saveApiKey(apiKey);
      onApiKeyChange?.();

      // Success - ready to boot
      setError(null);
      setBootState(BOOT_STATE.READY);
      onBootComplete?.();
    } catch (err) {
      console.error('API key validation error:', err);
      setError('Failed to validate API key. Please try again.');
    }
  }, [onBootComplete, onApiKeyChange]);

  // Render loading state during initialization
  if (bootState === BOOT_STATE.INITIALIZING) {
    return <BootLoadingScreen message="Initializing..." />;
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
