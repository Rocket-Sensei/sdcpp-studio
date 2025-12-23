import { useEffect, useState } from "react";
import { Image, Sparkles, History as HistoryIcon, List, Settings } from "lucide-react";
import { Toaster } from "./hooks/useToast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TextToImage } from "./components/TextToImage";
import { ImageToImage } from "./components/ImageToImage";
import { History } from "./components/History";
import { Queue } from "./components/Queue";
import { ModelManager } from "./components/ModelManager";
import { ModelSelector } from "./components/ModelSelector";
import { Button } from "./components/ui/button";
import { useGenerations } from "./hooks/useImageGeneration";

function App() {
  const [activeTab, setActiveTab] = useState("text-to-image");
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [currentModel, setCurrentModel] = useState(null);
  const { fetchGenerations } = useGenerations();

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  const handleGenerated = () => {
    // Switch to history tab after generation
    setActiveTab("history");
    fetchGenerations();
  };

  const handleCreateMore = (generation) => {
    setCreateMoreSettings(generation);
    setActiveTab("text-to-image");
  };

  const tabs = [
    { value: "text-to-image", label: "Text to Image", icon: Sparkles },
    { value: "image-to-image", label: "Image to Image", icon: Image },
    { value: "queue", label: "Queue", icon: List },
    { value: "history", label: "History", icon: HistoryIcon },
    { value: "models", label: "Models", icon: Settings },
  ];

  return (
    <Toaster>
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

              {/* Navigation Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1">
                <TabsList className="grid w-full grid-cols-5 bg-muted/50 h-9">
                  {tabs.map((tab) => (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1.5 text-sm">
                      <tab.icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {/* Model Selector */}
              <ModelSelector
                currentModel={currentModel}
                onModelChange={setCurrentModel}
                className="flex-shrink-0"
              />
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsContent value="text-to-image" className="max-w-2xl mx-auto mt-0">
              <TextToImage
                onGenerated={handleGenerated}
                settings={createMoreSettings}
                selectedModel={currentModel}
              />
            </TabsContent>

            <TabsContent value="image-to-image" className="max-w-2xl mx-auto mt-0">
              <ImageToImage
                onGenerated={handleGenerated}
                selectedModel={currentModel}
              />
            </TabsContent>

            <TabsContent value="queue" className="max-w-4xl mx-auto mt-0">
              <Queue />
            </TabsContent>

            <TabsContent value="history" className="mt-0">
              <History onCreateMore={handleCreateMore} />
            </TabsContent>

            <TabsContent value="models" className="max-w-4xl mx-auto mt-0">
              <ModelManager />
            </TabsContent>
          </Tabs>
        </main>

        {/* Footer */}
        <footer className="border-t border-border py-4 mt-8">
          <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
            SD WebUI - OpenAI-Compatible Image Generation Interface
          </div>
        </footer>
      </div>
    </Toaster>
  );
}

export default App;
