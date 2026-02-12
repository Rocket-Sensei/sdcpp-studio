import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { PromptBar } from "./prompt/PromptBar";
import { useImageGeneration, useGenerations } from "../hooks/useImageGeneration";
import { useModels } from "../hooks/useModels";
import { toast } from "sonner";
import { authenticatedFetch } from "../utils/api";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { ChevronDown, ChevronUp, Sparkles, Cpu, Clock, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

// localStorage key for form state persistence
const FORM_STATE_KEY = "sd-cpp-studio-generate-form-state";

// Default editing model
const DEFAULT_EDIT_MODEL = "qwen-image-edit";

/**
 * Studio Component - Main application page
 *
 * Features:
 * - PromptBar at top for quick generation with mode selector and model selection
 * - GeneratePanel as collapsible Settings panel below
 * - MultiModelSelector for inline model selection
 * - UnifiedQueue gallery for viewing generations
 * - "Create More" button handling from UnifiedQueue
 * - "Edit Image" functionality from UnifiedQueue
 *
 * @param {Object} props
 * @param {string} props.searchQuery - Search query for filtering generations
 * @param {Array} props.selectedStatuses - Array of selected status values for filtering
 * @param {Array} props.selectedModelsFilter - Array of selected model IDs for filtering
 */
export function Studio({ searchQuery, selectedStatuses, selectedModelsFilter, filterSheet }) {
  // Use the image generation hook for quick generation from PromptBar
  const { generateQueued, isLoading: isGenerating } = useImageGeneration();
  const { generations } = useGenerations();

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

  // UI state - generation panel collapsed by default
  const [isGenerationPanelOpen, setIsGenerationPanelOpen] = useState(false);
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

  // Track if we've loaded from localStorage (to prevent saving initial empty state)
  const hasLoadedRef = useRef(false);
  // Store the loaded state to save on first render
  const initialStateRef = useRef(null);

  // Load form state from localStorage on mount (only once)
  useEffect(() => {
    if (hasLoadedRef.current) return;

    try {
      const savedState = localStorage.getItem(FORM_STATE_KEY);
      if (savedState) {
        const formState = JSON.parse(savedState);
        // Store for immediate save
        initialStateRef.current = formState;
        // Restore from localStorage
        setPrompt(formState.prompt ?? "");
        setSelectedModels(formState.selectedModels ?? []);
        setMode(formState.mode ?? "image");
      }
    } catch (err) {
      console.warn('Failed to load form state from localStorage:', err);
    }
    hasLoadedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save form state to localStorage whenever key fields change
  useEffect(() => {
    // On first render after loading, save the loaded state immediately
    if (hasLoadedRef.current && initialStateRef.current) {
      const { prompt: initPrompt, selectedModels: initModels, mode: initMode } = initialStateRef.current;
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify({
        prompt: initPrompt ?? "",
        selectedModels: initModels ?? [],
        mode: initMode ?? "image",
      }));
      initialStateRef.current = null;
      return;
    }

    // Only save after initial state is set
    if (hasLoadedRef.current && !initialStateRef.current) {
      // Don't save if we have Create More or Edit Image settings (those are temporary)
      if (!createMoreSettings && !editImageSettings) {
        const formState = {
          prompt,
          selectedModels,
          mode,
        };
        localStorage.setItem(FORM_STATE_KEY, JSON.stringify(formState));
      }
    }
  }, [prompt, selectedModels, mode, createMoreSettings, editImageSettings]);

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
    // Open generation panel and settings to show the applied settings
    setIsGenerationPanelOpen(true);
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
    setIsGenerationPanelOpen(true);
    setIsSettingsOpen(true);
  }, []);

  // Handle "Upscale Image" from UnifiedQueue
  const handleUpscaleImage = useCallback((imageFile, generation) => {
    const imageUrl = URL.createObjectURL(imageFile);
    setEditImageSettings({
      imageFile,
      imageUrl,
      type: 'upscale',
      prompt: generation.prompt || '',
    });
    setCreateMoreSettings(null);
    // Also set sourceImage for upscale mode
    setSourceImage(imageFile);
    setSourceImagePreview(imageUrl);
    setMode('upscale');
    setIsGenerationPanelOpen(true);
    setIsSettingsOpen(true);
  }, []);

  // Handle "Create Video" from UnifiedQueue
  const handleCreateVideo = useCallback((imageFile, generation) => {
    const imageUrl = URL.createObjectURL(imageFile);
    setEditImageSettings({
      imageFile,
      imageUrl,
      type: 'video',
      prompt: generation.prompt || '',
    });
    setCreateMoreSettings(null);
    // Also set sourceImage for video mode
    setSourceImage(imageFile);
    setSourceImagePreview(imageUrl);
    setMode('video');
    setIsGenerationPanelOpen(true);
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
      toast.error("Please select at least one model");
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
      // NOTE: Prompt is NOT cleared after generation - form state persists
    } catch (err) {
      toast.error(err.message || "Failed to queue generation");
    }
  }, [prompt, selectedModels, mode, generateQueued, sourceImage, upscalerName, upscaleResizeMode, upscaleFactor, upscaleTargetWidth, upscaleTargetHeight, handleClearImage]);

  // Handle generate complete
  const handleGenerated = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
    // NOTE: Prompt is NOT cleared - form state persists for user convenience
  }, []);

  // Clear settings after they've been applied
  const handleSettingsApplied = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
  }, []);

  // Compute queue statistics
  const pendingCount = generations.filter(g => g.status === 'pending').length;
  const processingCount = generations.filter(g => g.status === 'processing' || g.status === 'model_loading').length;
  const totalInQueue = pendingCount + processingCount;

  // Get preview text for collapsed state
  const getPreviewText = () => {
    const parts = [];
    if (selectedModels.length > 0) {
      const modelName = modelsNameMap[selectedModels[0]] || 'Unknown';
      parts.push(modelName.length > 20 ? modelName.slice(0, 20) + '...' : modelName);
      if (selectedModels.length > 1) {
        parts.push(`+${selectedModels.length - 1} more`);
      }
    }
    if (prompt.trim()) {
      parts.push(prompt.length > 30 ? prompt.slice(0, 30) + '...' : prompt);
    }
    return parts.join(' | ') || 'Ready to generate';
  };

  return (
    <div className="space-y-4">
      {/* Collapsible Generation Panel */}
      <Card className="overflow-hidden">
        <button
          type="button"
          onClick={() => setIsGenerationPanelOpen(!isGenerationPanelOpen)}
          className="w-full flex items-center justify-between p-4 hover:bg-muted/50 transition-colors"
          aria-label="Toggle generation panel"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <span className="font-medium">Generate</span>
            </div>
            {!isGenerationPanelOpen && (
              <span className="text-sm text-muted-foreground truncate max-w-md">
                {getPreviewText()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {totalInQueue > 0 && (
              <div className="flex items-center gap-1.5 text-sm">
                {processingCount > 0 && (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {processingCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {pendingCount}
                  </span>
                )}
                <span className="text-muted-foreground">in queue</span>
              </div>
            )}
            {isGenerationPanelOpen ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </button>

        {isGenerationPanelOpen && (
          <CardContent className="space-y-4 pt-0 border-t">
            {/* PromptBar - Full width prompt input */}
            <PromptBar
              prompt={prompt}
              onPromptChange={setPrompt}
              mode={mode}
              onModeChange={setMode}
              selectedModels={selectedModels}
              onModelsChange={setSelectedModels}
              modelsMap={modelsNameMap}
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

            {/* Settings Panel - Collapsible, shown below PromptBar */}
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
          </CardContent>
        )}
      </Card>

      {/* Main content - UnifiedQueue Gallery */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Gallery</h2>
        {filterSheet}
      </div>
      <UnifiedQueue
        onCreateMore={handleCreateMore}
        onEditImage={handleEditImage}
        onUpscaleImage={handleUpscaleImage}
        onCreateVideo={handleCreateVideo}
        searchQuery={searchQuery}
        selectedStatuses={selectedStatuses}
        selectedModelsFilter={selectedModelsFilter}
      />
    </div>
  );
}

export default Studio;
