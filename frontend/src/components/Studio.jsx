import { useState, useCallback, useMemo } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { PromptBar } from "./prompt/PromptBar";
import { ModelSelectorModal } from "./model-selector/ModelSelectorModal";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useModels } from "../hooks/useModels";
import { toast } from "sonner";

// Default editing model
const DEFAULT_EDIT_MODEL = "qwen-image-edit";

/**
 * Studio Component - Main application page
 *
 * Features:
 * - PromptBar at top for quick generation with mode selector and model selection
 * - GeneratePanel as collapsible Settings panel below
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
  // Use the image generation hook for quick generation from PromptBar
  const { generateQueued, isLoading: isGenerating } = useImageGeneration();

  // Shared models data
  const { modelsNameMap } = useModels();

  // Minimal state for PromptBar
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("image"); // image, imgedit, video, upscale
  const [selectedModels, setSelectedModels] = useState([]);

  // Image state for Edit/Upscale modes
  const [sourceImagePreview, setSourceImagePreview] = useState(null);
  const [strength, setStrength] = useState(0.75);

  // UI state
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // "Create More" settings from gallery
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [editImageSettings, setEditImageSettings] = useState(null);

  // Image upload handler for upscale mode
  const handleImageUpload = useCallback(() => {
    setIsSettingsOpen(true);
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
    setIsSettingsOpen(true);
  }, []);

  // Handle "Edit Image" from UnifiedQueue
  const handleEditImage = useCallback((imageFile, generation) => {
    const imageUrl = URL.createObjectURL(imageFile);
    setEditImageSettings({
      imageFile,
      imageUrl,
      type: 'imgedit',
      prompt: generation.prompt || '',
      negative_prompt: '',
      size: generation.size || '1024x1024',
    });
    setCreateMoreSettings(null);
    setSelectedModels([DEFAULT_EDIT_MODEL]);
    setMode('imgedit');
    setIsSettingsOpen(true);
  }, []);

  // Handle generate from PromptBar - direct queue submission
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    if (selectedModels.length === 0) {
      // Open model selector if no models selected
      setIsModelSelectorOpen(true);
      return;
    }

    // For upscale/imagedit modes, user needs to use Settings panel
    if (mode === 'upscale' || mode === 'imgedit') {
      toast.error("Please open Settings panel below to configure this mode");
      setIsSettingsOpen(true);
      return;
    }

    // Quick generation: queue directly with default settings
    try {
      // Build params for each selected model
      const promises = selectedModels.map((modelId) =>
        generateQueued({
          mode: 'generate',
          model: modelId,
          prompt,
          size: '1024x1024', // Default size
          n: 1,
        })
      );

      await Promise.all(promises);
      toast.success(`${selectedModels.length} job(s) added to queue!`);

      // Clear prompt after successful generation
      setPrompt("");
    } catch (err) {
      toast.error(err.message || "Failed to queue generation");
    }
  }, [prompt, selectedModels, mode, generateQueued, setIsSettingsOpen]);

  // Handle generate complete
  const handleGenerated = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
    setPrompt("");
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
    <div className="container mx-auto p-4 space-y-4">
      {/* PromptBar - Full width prompt input at top */}
      <PromptBar
        prompt={prompt}
        onPromptChange={setPrompt}
        mode={mode}
        onModeChange={setMode}
        selectedModels={selectedModels}
        modelsMap={modelsNameMap}
        onModelSelectorOpen={() => setIsModelSelectorOpen(true)}
        onSettingsToggle={() => setIsSettingsOpen(!isSettingsOpen)}
        settingsOpen={isSettingsOpen}
        onGenerate={handleGenerate}
        isLoading={isGenerating}
        disabled={false}
        sourceImagePreview={sourceImagePreview}
        onImageUpload={handleImageUpload}
        strength={strength}
      />

      {/* Settings Panel - Collapsible, shown below */}
      <GeneratePanel
        open={isSettingsOpen}
        onOpenChange={setIsSettingsOpen}
        selectedModels={selectedModels}
        onModelsChange={setSelectedModels}
        settings={createMoreSettings}
        editImageSettings={editImageSettings}
        onGenerated={() => {
          handleGenerated();
          handleSettingsApplied();
        }}
        prompt={prompt}
        mode={mode}
        onModeChange={setMode}
      />

      {/* Main content - UnifiedQueue Gallery */}
      <UnifiedQueue
        onCreateMore={handleCreateMore}
        onEditImage={handleEditImage}
        searchQuery={searchQuery}
        selectedStatuses={selectedStatuses}
        selectedModelsFilter={selectedModelsFilter}
      />

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
