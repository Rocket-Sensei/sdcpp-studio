import { useState, useCallback, useMemo, useEffect } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { PromptBar } from "./prompt/PromptBar";
import { ModelSelectorModal } from "./model-selector/ModelSelectorModal";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useModels } from "../hooks/useModels";
import { toast } from "sonner";
import { authenticatedFetch } from "../utils/api";

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
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImagePreview, setSourceImagePreview] = useState(null);
  const [strength, setStrength] = useState(0.75);

  // UI state
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // "Create More" settings from gallery
  const [createMoreSettings, setCreateMoreSettings] = useState(null);
  const [editImageSettings, setEditImageSettings] = useState(null);

  // Upscale settings state (managed here for top form access)
  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [upscaleResizeMode, setUpscaleResizeMode] = useState(0);
  const [upscaleTargetWidth, setUpscaleTargetWidth] = useState(1024);
  const [upscaleTargetHeight, setUpscaleTargetHeight] = useState(1024);
  const [upscalerName, setUpscalerName] = useState("RealESRGAN 4x+");
  const [availableUpscalers, setAvailableUpscalers] = useState([]);

  // Fetch available upscalers on mount
  useEffect(() => {
    const fetchUpscalers = async () => {
      try {
        const response = await authenticatedFetch("/sdapi/v1/upscalers");
        if (response.ok) {
          const data = await response.json();
          setAvailableUpscalers(data);
          if (data.length > 0 && !upscalerName) {
            setUpscalerName(data[0].name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch upscalers:", err);
      }
    };
    fetchUpscalers();
  }, []);

  // File handlers for upscale mode
  const handleFileSelect = useCallback((file) => {
    setSourceImage(file);
    setSourceImagePreview(URL.createObjectURL(file));
  }, []);

  const handleClearImage = useCallback(() => {
    setSourceImage(null);
    setSourceImagePreview(null);
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

  // Handle generate from PromptBar - queue submission
  const handleGenerate = useCallback(async () => {
    // Handle upscale mode - queue the upscale job
    if (mode === 'upscale') {
      if (!sourceImage) {
        toast.error("Please select a source image");
        return;
      }

      try {
        await generateQueued({
          mode: 'upscale',
          image: sourceImage,
          upscaler: upscalerName,
          resize_mode: upscaleResizeMode,
          upscale_factor: upscaleFactor,
          target_width: upscaleResizeMode === 1 ? upscaleTargetWidth : undefined,
          target_height: upscaleResizeMode === 1 ? upscaleTargetHeight : undefined,
        });
        toast.success("Upscale job added to queue!");
        // Clear the source image after successful queue submission
        handleClearImage();
      } catch (err) {
        toast.error(err.message || "Failed to queue upscale job");
      }
      return;
    }

    // For imgedit mode, user needs to use Settings panel
    if (mode === 'imgedit') {
      toast.error("Please open Settings panel below to configure this mode");
      setIsSettingsOpen(true);
      return;
    }

    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }
    if (selectedModels.length === 0) {
      // Open model selector if no models selected
      setIsModelSelectorOpen(true);
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
  }, [prompt, selectedModels, mode, generateQueued, sourceImage, upscalerName, upscaleResizeMode, upscaleFactor, upscaleTargetWidth, upscaleTargetHeight, handleClearImage]);

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
        sourceImage={sourceImage}
        onFileSelect={handleFileSelect}
        onClearImage={handleClearImage}
        availableUpscalers={availableUpscalers}
        upscalerName={upscalerName}
        onUpscalerNameChange={setUpscalerName}
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
        // Upscale state (managed in Studio for top form access)
        sourceImage={sourceImage}
        sourceImagePreview={sourceImagePreview}
        upscaleFactor={upscaleFactor}
        onUpscaleFactorChange={setUpscaleFactor}
        upscaleResizeMode={upscaleResizeMode}
        onUpscaleResizeModeChange={setUpscaleResizeMode}
        upscaleTargetWidth={upscaleTargetWidth}
        onUpscaleTargetWidthChange={setUpscaleTargetWidth}
        upscaleTargetHeight={upscaleTargetHeight}
        onUpscaleTargetHeightChange={setUpscaleTargetHeight}
        upscalerName={upscalerName}
        onUpscalerNameChange={setUpscalerName}
        onFileSelect={handleFileSelect}
        onClearImage={handleClearImage}
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
