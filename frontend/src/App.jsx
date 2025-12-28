import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Sparkles, ChevronDown } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { Studio } from "./components/Studio";
import { WebSocketStatusIndicator } from "./components/WebSocketStatusIndicator";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { useGenerations } from "./hooks/useImageGeneration";
import { ApiKeyProvider } from "./components/ApiKeyModal";
import { Button } from "./components/ui/button";

const STORAGE_KEY = "studio-form-collapsed";

function App() {
  const { fetchGenerations } = useGenerations();

  // Form collapse state shared with Studio component
  const [isFormCollapsed, setIsFormCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "true";
    }
    return false;
  });

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  // Toggle form collapse
  const handleToggleForm = useCallback(() => {
    setIsFormCollapsed((prev) => {
      const newValue = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem(STORAGE_KEY, String(newValue));
      }
      return newValue;
    });
  }, []);

  // Handle collapse state change from Studio
  const handleCollapseChange = useCallback((value) => {
    setIsFormCollapsed(value);
  }, []);

  return (
    <ApiKeyProvider>
      <WebSocketProvider>
        <div className="min-h-screen bg-background">
          {/* Header */}
          <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
            <div className="container mx-auto px-4 py-3">
              <div className="flex items-center justify-between gap-4">
                {/* Generate Toggle Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleToggleForm}
                  className="gap-2 flex-shrink-0"
                >
                  Generate
                  <ChevronDown className={`h-4 w-4 transition-transform ${isFormCollapsed ? '' : 'rotate-180'}`} />
                </Button>

                {/* Logo */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h1 className="text-lg font-bold hidden sm:block">sd.cpp Studio</h1>
                </div>

                {/* Spacer for balance */}
                <div className="flex-1" />

                {/* WebSocket Status Indicator */}
                <WebSocketStatusIndicator />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="container mx-auto px-4 py-8">
            <Routes>
              {/* Main Studio route */}
              <Route path="/studio" element={
                <Studio
                  isFormCollapsed={isFormCollapsed}
                  onToggleForm={handleToggleForm}
                  onCollapseChange={handleCollapseChange}
                />
              } />

              {/* Backward compatibility redirects */}
              <Route path="/generate" element={<Navigate to="/studio" replace />} />
              <Route path="/gallery" element={<Navigate to="/studio" replace />} />
              <Route path="/models" element={<Navigate to="/studio" replace />} />

              {/* Default route - redirect to /studio */}
              <Route path="/" element={<Navigate to="/studio" replace />} />
            </Routes>
          </main>

          {/* Footer */}
          <footer className="border-t border-border py-4 mt-8">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              sd.cpp Studio - OpenAI-Compatible Image Generation Interface
            </div>
          </footer>

          {/* Toast notifications */}
          <Toaster />
        </div>
      </WebSocketProvider>
    </ApiKeyProvider>
  );
}

export default App;
