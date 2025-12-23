import { useEffect, useState } from "react";
import { Image, Sparkles, History as HistoryIcon } from "lucide-react";
import { Toaster } from "./hooks/useToast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { TextToImage } from "./components/TextToImage";
import { ImageToImage } from "./components/ImageToImage";
import { History } from "./components/History";
import { Button } from "./components/ui/button";
import { useGenerations } from "./hooks/useImageGeneration";

function App() {
  const [activeTab, setActiveTab] = useState("text-to-image");
  const { fetchGenerations } = useGenerations();

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  const handleGenerated = () => {
    // Switch to history tab after generation
    setActiveTab("history");
    fetchGenerations();
  };

  return (
    <Toaster>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm">
          <div className="container mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">SD WebUI</h1>
              </div>
              <div className="text-sm text-muted-foreground">
                Model: <span className="font-mono text-foreground">sd-cpp-local</span>
              </div>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="container mx-auto px-4 py-8">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-3 mb-8 bg-muted">
              <TabsTrigger value="text-to-image">
                <Sparkles className="h-4 w-4 mr-2" />
                Text to Image
              </TabsTrigger>
              <TabsTrigger value="image-to-image">
                <Image className="h-4 w-4 mr-2" />
                Image to Image
              </TabsTrigger>
              <TabsTrigger value="history">
                <HistoryIcon className="h-4 w-4 mr-2" />
                History
              </TabsTrigger>
            </TabsList>

            <TabsContent value="text-to-image" className="max-w-2xl mx-auto">
              <TextToImage onGenerated={handleGenerated} />
            </TabsContent>

            <TabsContent value="image-to-image" className="max-w-2xl mx-auto">
              <ImageToImage onGenerated={handleGenerated} />
            </TabsContent>

            <TabsContent value="history">
              <History />
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
