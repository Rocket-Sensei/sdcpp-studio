import { useState, useEffect, useCallback, useMemo } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { PromptBar } from "./prompt/PromptBar";
import { ModelSelectorModal } from "./model-selector/ModelSelectorModal";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { Sparkles } from "lucide-react";

// Default editing model
const DEFAULT_EDIT_MODEL = "qwen-image-edit";

const STORAGE_KEY = "studio-form-collapsed";

/**
 * Studio Component - Main application page
 *
 * Features:
 * - Full-width PromptBar at top for quick generation
 * - GeneratePanel side sheet for advanced settings
 * - ModelSelectorModal for model selection
 * - UnifiedQueue gallery for viewing generations
 * - "Create More" button handling from UnifiedQueue
 * - "Edit Image" functionality from UnifiedQueue
 *
 * @param {Object} props
 * @param {string} props.searchQuery - Search query for filtering generations
 * @param {Array} props.selectedStatuses - Array of selected status values for filtering
 * @param {Array} props.selectedModelsFilter - Array of selected model IDs for filtering
 */
export function Studio({ searchQuery, selectedStatuses, selectedModelsFilter }) {
  // Minimal state for PromptBar (GeneratePanel manages its own settings)
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("image"); // image, edit, video, upscale
  const [selectedModels, setSelectedModels] = useState([]);
  const [sourceImage, setSourceImage] = useState(null);

  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isGeneratePanelOpen, setIsGeneratePanelOpen] = useState(false);

  // Store full models data for PromptBar's modelsMap
  const [modelsData, setModelsData] = useState([]);

  // "Create More" settings from gallery
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [editImageSettings, setEditImageSettings] = useState(null);

  // Create modelsMap for PromptBar
  const modelsMap = useMemo(() => {
    const map = {};
    modelsData.forEach((model) => {
      map[model.id] = model.name;
    });
    return map;
  }, [modelsData]);

  // Create sourceImagePreview for PromptBar
  const sourceImagePreview = useMemo(() => {
    return sourceImage ? URL.createObjectURL(sourceImage) : null;
  }, [sourceImage]);

  // Fetch models data for modelsMap
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        setModelsData(data.models || []);
      })
      .catch((err) => {
        console.error("Failed to fetch models:", err);
      });

    // Cleanup function for object URL
    return () => {
      if (sourceImagePreview) {
        URL.revokeObjectURL(sourceImagePreview);
      }
    };
  }, []);

  // Handle "Create More" from UnifiedQueue
  const handleCreateMore = useCallback((generation) => {
    setCreateMoreSettings(generation);
    setEditImageSettings(null);
    if (generation.model) {
      setSelectedModels([generation.model]);
    }
    if (generation.prompt) {
      setPrompt(generation.prompt);
    }
    // Open settings panel to show the applied settings
    setIsGeneratePanelOpen(true);
  }, []);

  // Handle "Edit Image" from UnifiedQueue
  const handleEditImage = useCallback((imageFile, generation) => {
    const imageUrl = URL.createObjectURL(imageFile);
    setEditImageSettings({
      imageFile,
      imageUrl,
      type: 'edit',
      prompt: generation.prompt || '',
      negative_prompt: '',
      size: generation.size || '1024x1024',
    });
    setCreateMoreSettings(null);
    setSelectedModels([DEFAULT_EDIT_MODEL]);
    setMode('edit');
    setIsGeneratePanelOpen(true);
  }, []);

  // Handle generate from PromptBar
  const handleGenerate = useCallback(() => {
    if (!prompt.trim()) return;
    if (selectedModels.length === 0) {
      // Open model selector if no models selected
      setIsModelSelectorOpen(true);
      return;
    }
    // Open generate panel for actual submission
    setIsGeneratePanelOpen(true);
  }, [prompt, selectedModels]);

  // Handle generate complete
  const handleGenerated = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
    setPrompt("");
    setSourceImage(null);
    // Optionally close panels after generation
    // setIsGeneratePanelOpen(false);
  }, []);

  // Handle model selector apply
  const handleModelSelectorApply = useCallback((models) => {
    setSelectedModels(models);
    setIsModelSelectorOpen(false);
  }, []);

  // Clear settings after they've been applied
  const handleSettingsApplied = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
  }, []);

  return (
    <div className="container mx-auto p-4">
      {/* PromptBar - Full width prompt input at top */}
      <PromptBar
        prompt={prompt}
        onPromptChange={setPrompt}
        selectedModels={selectedModels}
        modelsMap={modelsMap}
        onModelSelectorOpen={() => setIsModelSelectorOpen(true)}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onGenerate={handleGenerate}
        isLoading={false}
        disabled={false}
        sourceImage={sourceImage}
        sourceImagePreview={sourceImagePreview}
        onSourceImageChange={setSourceImage}
        onSourceImageClear={() => setSourceImage(null)}
        mode={mode}
      />

      {/* Main content - UnifiedQueue Gallery */}
      <div className="mt-4">
        <UnifiedQueue
          onCreateMore={handleCreateMore}
          onEditImage={handleEditImage}
          searchQuery={searchQuery}
          selectedStatuses={selectedStatuses}
          selectedModelsFilter={selectedModelsFilter}
        />
      </div>

      {/* Settings Panel - Side Sheet with GeneratePanel */}
      <Sheet open={isSettingsOpen || isGeneratePanelOpen} onOpenChange={(open) => {
        setIsSettingsOpen(open);
        setIsGeneratePanelOpen(open);
      }}>
        <SheetContent side="right" className="w-full sm:w-[600px] overflow-y-auto p-0">
          <SheetHeader className="mt-8 mb-4 px-6">
            <SheetTitle>{isGeneratePanelOpen ? "Generate" : "Settings"}</SheetTitle>
          </SheetHeader>
          <div className="px-6 pb-6">
            <GeneratePanel
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              settings={createMoreSettings}
              editImageSettings={editImageSettings}
              onGenerated={() => {
                handleGenerated();
                handleSettingsApplied();
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Model Selector Modal */}
      <ModelSelectorModal
        open={isModelSelectorOpen}
        onOpenChange={setIsModelSelectorOpen}
        selectedModels={selectedModels}
        onModelsChange={handleModelSelectorApply}
        mode={mode}
      />
    </div>
  );
}

export default Studio;
