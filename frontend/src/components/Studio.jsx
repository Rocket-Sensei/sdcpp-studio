import { useState, useEffect, useCallback } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { PromptBar } from "./prompt/PromptBar";
import { SettingsPanel } from "./settings/SettingsPanel";
import { ModelSelectorModal } from "./model-selector/ModelSelectorModal";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./ui/sheet";
import { Dialog, DialogContent } from "./ui/dialog";
import { Sparkles } from "lucide-react";

// Default editing model
const DEFAULT_EDIT_MODEL = "qwen-image-edit";

const STORAGE_KEY = "studio-form-collapsed";

/**
 * Studio Component - Main application page
 *
 * Features:
 * - Full-width PromptBar at top for quick generation
 * - SettingsPanel side sheet for advanced settings
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
  // Generation settings state
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [mode, setMode] = useState("image"); // image, edit, video, upscale
  const [selectedModels, setSelectedModels] = useState([]);
  const [sourceImage, setSourceImage] = useState(null);

  // Advanced settings state
  const [size, setSize] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-size");
      if (saved) return saved;
    }
    return "1024x1024";
  });
  const [imageCount, setImageCount] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-image-count");
      if (saved) return parseInt(saved, 10);
    }
    return 1;
  });
  const [strength, setStrength] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-strength");
      if (saved) return parseFloat(saved);
    }
    return 0.7;
  });
  const [seed, setSeed] = useState("");
  const [cfgScale, setCfgScale] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-cfg-scale");
      if (saved) return parseFloat(saved);
    }
    return 0.0;
  });
  const [sampleSteps, setSampleSteps] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-sample-steps");
      if (saved) return parseInt(saved, 10);
    }
    return 9;
  });
  const [samplingMethod, setSamplingMethod] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-sampling-method");
      if (saved) return saved;
    }
    return "euler_a";
  });
  const [clipSkip, setClipSkip] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-clip-skip");
      if (saved) return parseInt(saved, 10);
    }
    return 1;
  });
  const [queueMode, setQueueMode] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("sd-cpp-studio-queue-mode");
      return saved === "true";
    }
    return false;
  });
  const [upscaleAfter, setUpscaleAfter] = useState(false);

  // UI state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isGeneratePanelOpen, setIsGeneratePanelOpen] = useState(false);

  // "Create More" settings from gallery
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [editImageSettings, setEditImageSettings] = useState(null);

  // Persist settings to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-size", size);
    }
  }, [size]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-image-count", String(imageCount));
    }
  }, [imageCount]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-strength", String(strength));
    }
  }, [strength]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-cfg-scale", String(cfgScale));
    }
  }, [cfgScale]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-sample-steps", String(sampleSteps));
    }
  }, [sampleSteps]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-sampling-method", samplingMethod);
    }
  }, [samplingMethod]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-clip-skip", String(clipSkip));
    }
  }, [clipSkip]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("sd-cpp-studio-queue-mode", String(queueMode));
    }
  }, [queueMode]);

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
    if (generation.negative_prompt) {
      setNegativePrompt(generation.negative_prompt);
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

  // Get selected model count for display
  const selectedModelCount = selectedModels.length;

  return (
    <div className="container mx-auto p-4">
      {/* PromptBar - Full width prompt input at top */}
      <PromptBar
        prompt={prompt}
        onPromptChange={setPrompt}
        selectedModelCount={selectedModelCount}
        onModelSelectorClick={() => setIsModelSelectorOpen(true)}
        sourceImage={sourceImage}
        onSourceImageChange={setSourceImage}
        onGenerate={handleGenerate}
        onSettingsClick={() => setIsSettingsOpen(true)}
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

      {/* Settings Panel - Side Sheet */}
      <Sheet open={isSettingsOpen || isGeneratePanelOpen} onOpenChange={(open) => {
        setIsSettingsOpen(open);
        setIsGeneratePanelOpen(open);
      }}>
        <SheetContent side="right" className="w-full sm:w-[500px] overflow-y-auto">
          <SheetHeader className="mt-8 mb-6 px-6">
            <SheetTitle>{isGeneratePanelOpen ? "Generate" : "Settings"}</SheetTitle>
          </SheetHeader>
          <div className="px-6">
            <SettingsPanel
              mode={mode}
              onModeChange={setMode}
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              size={size}
              onSizeChange={setSize}
              imageCount={imageCount}
              onImageCountChange={setImageCount}
              strength={strength}
              onStrengthChange={setStrength}
              seed={seed}
              onSeedChange={setSeed}
              cfgScale={cfgScale}
              onCfgScaleChange={setCfgScale}
              sampleSteps={sampleSteps}
              onSampleStepsChange={setSampleSteps}
              samplingMethod={samplingMethod}
              onSamplingMethodChange={setSamplingMethod}
              clipSkip={clipSkip}
              onClipSkipChange={setClipSkip}
              queueMode={queueMode}
              onQueueModeChange={setQueueMode}
              upscaleAfter={upscaleAfter}
              onUpscaleAfterChange={setUpscaleAfter}
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              prompt={prompt}
              sourceImage={sourceImage}
              createMoreSettings={createMoreSettings}
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
      <Dialog open={isModelSelectorOpen} onOpenChange={setIsModelSelectorOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <ModelSelectorModal
            selectedModels={selectedModels}
            onModelsChange={handleModelSelectorApply}
            onClose={() => setIsModelSelectorOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default Studio;
