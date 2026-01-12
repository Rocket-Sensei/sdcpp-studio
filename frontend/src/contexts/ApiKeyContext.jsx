import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { getStoredApiKey } from '../utils/api';

/**
 * Context for managing API key state and notifying components when it changes
 * This allows components to re-fetch data when the API key is updated
 */
const ApiKeyContext = createContext(null);

export function ApiKeyProvider({ children }) {
  const [apiKey, setApiKey] = useState(getStoredApiKey());
  const [version, setVersion] = useState(0); // Increment to trigger re-renders

  // Update context when localStorage changes (e.g., from another tab)
  useEffect(() => {
    const handleStorageChange = (e) => {
      if (e.key === 'sd-cpp-studio-api-key') {
        setApiKey(e.newValue);
        setVersion(v => v + 1);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  /**
   * Call this when the API key is set or updated
   * Triggers a version increment that components can watch
   */
  const notifyApiKeyChanged = useCallback(() => {
    setApiKey(getStoredApiKey());
    setVersion(v => v + 1);
  }, []);

  return (
    <ApiKeyContext.Provider value={{ apiKey, version, notifyApiKeyChanged }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

/**
 * Hook to access API key context
 * @returns {Object} { apiKey, version, notifyApiKeyChanged }
 */
export function useApiKeyContext() {
  const context = useContext(ApiKeyContext);
  if (!context) {
    throw new Error('useApiKeyContext must be used within ApiKeyProvider');
  }
  return context;
}
