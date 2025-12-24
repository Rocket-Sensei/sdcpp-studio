import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { Sparkles } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { TextToImage } from "./components/TextToImage";
import { ImageToImage } from "./components/ImageToImage";
import { UnifiedQueue } from "./components/UnifiedQueue";
import { ModelManager } from "./components/ModelManager";
import { Navigation } from "./components/Navigation";
import { useGenerations } from "./hooks/useImageGeneration";

function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [currentModel, setCurrentModel] = useState(null);
  const { fetchGenerations } = useGenerations();

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  const handleGenerated = useCallback(() => {
    // Navigate to gallery after generation (shows active jobs and recent generations)
    navigate("/gallery");
    fetchGenerations();
  }, [navigate, fetchGenerations]);

  const handleCreateMore = useCallback((generation) => {
    setCreateMoreSettings(generation);
    navigate("/text-to-image");
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            {/* Logo */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-bold hidden sm:block">SD WebUI</h1>
            </div>

            {/* Navigation */}
            <Navigation />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Routes>
          <Route
            path="/text-to-image"
            element={
              <div className="max-w-2xl mx-auto">
                <TextToImage
                  onGenerated={handleGenerated}
                  settings={createMoreSettings}
                  selectedModel={currentModel}
                  onModelChange={setCurrentModel}
                />
              </div>
            }
          />
          <Route
            path="/image-to-image"
            element={
              <div className="max-w-2xl mx-auto">
                <ImageToImage
                  onGenerated={handleGenerated}
                  selectedModel={currentModel}
                  onModelChange={setCurrentModel}
                />
              </div>
            }
          />
          <Route
            path="/gallery"
            element={
              <div className="max-w-6xl mx-auto">
                <UnifiedQueue onCreateMore={handleCreateMore} />
              </div>
            }
          />
          <Route
            path="/models"
            element={
              <div className="max-w-4xl mx-auto">
                <ModelManager />
              </div>
            }
          />
          {/* Default route - redirect to /text-to-image */}
          <Route path="/" element={<Navigate to="/text-to-image" replace />} />
        </Routes>
      </main>

      {/* Footer */}
      <footer className="border-t border-border py-4 mt-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          SD WebUI - OpenAI-Compatible Image Generation Interface
        </div>
      </footer>

      {/* Toast notifications */}
      <Toaster />
    </div>
  );
}

export default App;
