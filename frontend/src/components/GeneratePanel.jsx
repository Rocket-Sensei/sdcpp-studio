import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useModels } from "../hooks/useModels";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { authenticatedFetch } from "../utils/api";
import { ModelSelectorModal } from "./model-selector/ModelSelectorModal";
import { Badge } from "./ui/badge";
import { Settings2, Loader2, Sparkles } from "lucide-react";
import { ImageSettings } from "./settings/ImageSettings";
import { EditSettings } from "./settings/EditSettings";
import { VideoSettings } from "./settings/VideoSettings";
import { UpscaleSettings } from "./settings/UpscaleSettings";

// localStorage key for form state persistence
const FORM_STATE_KEY = "sd-cpp-studio-generate-form-state";

const MODES = [
  { value: "image", label: "Image", needsImage: false, optionalImage: true, description: "Text to Image / Image to Image" },
  { value: "imgedit", label: "Edit", needsImage: true, description: "Image Edit" },
  { value: "video", label: "Video", needsImage: false, description: "Text/Image to Video" },
  { value: "upscale", label: "Upscale", needsImage: true, description: "Upscale" },
];

/**
 * GeneratePanel - Settings panel (collapsible, bottom)
 * NO duplicate mode selector - mode is managed by PromptBar
 * NO duplicate prompt input - prompt is managed by PromptBar
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the panel is open
 * @param {function} props.onOpenChange - Callback when open state changes
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {function} props.onModelsChange - Callback when model selection changes
 * @param {Object} props.settings - Settings from "Create More" button
 * @param {Object} props.editImageSettings - Settings from "Edit Image" button with image file
 * @param {function} props.onGenerated - Callback when generation completes
 * @param {string} props.prompt - Current prompt text from PromptBar
 * @param {string} props.mode - Current mode from PromptBar
 * @param {function} props.onModeChange - Callback when mode changes
 */
export function GeneratePanel({
  open = false,
  onOpenChange,
  selectedModels = [],
  onModelsChange,
  settings,
  editImageSettings,
  onGenerated,
  prompt = "",
  mode = "image",
  onModeChange,
}) {
  const { generateQueued, isLoading } = useImageGeneration();
  const { modelsMap } = useModels();
  const fileInputRef = useRef(null);
  const editImageUrlRef = useRef(null);
  const endImageInputRef = useRef(null);

  // Mode state - synchronized with PromptBar
  const [localMode, setLocalMode] = useState(mode);

  // Sync mode with PromptBar
  useEffect(() => {
    setLocalMode(mode);
  }, [mode]);

  // Common settings
  const [negativePrompt, setNegativePrompt] = useState("");

  // Size as separate width/height for sliders
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const size = `${width}x${height}`;

  const [seed, setSeed] = useState("");
  const [n, setN] = useState(1);
  const [useQueue, setUseQueue] = useState(true);

  // Model selector modal state
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);

  // Track if selected models support negative prompts
  const [supportsNegativePrompt, setSupportsNegativePrompt] = useState(false);

  // Track if selected models are server mode
  const [hasServerModeModel, setHasServerModeModel] = useState(false);
  const [serverModeSteps, setServerModeSteps] = useState(null);

  // Image-related settings
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImagePreview, setSourceImagePreview] = useState(null);
  const [upscaleResult, setUpscaleResult] = useState(null);
  const [isUpscaling, setIsUpscaling] = useState(false);

  // Strength parameter for img2img mode
  const [strength, setStrength] = useState(0.75);

  // Upscale settings
  const [upscaleAfterGeneration, setUpscaleAfterGeneration] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [upscaleResizeMode, setUpscaleResizeMode] = useState(0);
  const [upscalerName, setUpscalerName] = useState("RealESRGAN 4x+");
  const [availableUpscalers, setAvailableUpscalers] = useState([]);

  // Upscale target size for resize mode
  const [upscaleTargetWidth, setUpscaleTargetWidth] = useState(1024);
  const [upscaleTargetHeight, setUpscaleTargetHeight] = useState(1024);

  // Video settings
  const [videoFrames, setVideoFrames] = useState(33);
  const [videoFps, setVideoFps] = useState(24);
  const [flowShift, setFlowShift] = useState(false);
  const [flowShiftValue, setFlowShiftValue] = useState(3.0);
  const [endImage, setEndImage] = useState(null);
  const [endImagePreview, setEndImagePreview] = useState(null);

  // SD.cpp Advanced Settings
  const [cfgScale, setCfgScale] = useState(2.5);
  const [samplingMethod, setSamplingMethod] = useState("euler");
  const [sampleSteps, setSampleSteps] = useState(20);
  const [clipSkip, setClipSkip] = useState("-1");

  // Fetch upscalers on mount
  useEffect(() => {
    const fetchUpscalers = async () => {
      try {
        const response = await authenticatedFetch("/sdapi/v1/upscalers");
        if (response.ok) {
          const data = await response.json();
          setAvailableUpscalers(data);
          if (data.length > 0) {
            setUpscalerName(data[0].name);
          }
        }
      } catch (err) {
        console.error("Failed to fetch upscalers:", err);
      }
    };
    fetchUpscalers();
  }, []);

  // Update negative prompt support when selectedModels change
  useEffect(() => {
    const hasSupport = selectedModels.some(modelId => {
      const model = modelsMap?.[modelId];
      return model?.supports_negative_prompt === true;
    });
    setSupportsNegativePrompt(hasSupport);
  }, [selectedModels, modelsMap]);

  // Update server mode steps info when selectedModels change
  useEffect(() => {
    const serverModels = selectedModels
      .map(modelId => modelsMap?.[modelId])
      .filter(m => m && m.exec_mode === 'server');

    setHasServerModeModel(serverModels.length > 0);

    if (serverModels.length > 0) {
      // Parse steps from command line args for server mode models
      const stepsValues = serverModels
        .map(m => {
          const stepsMatch = m.args?.find(arg => arg === '--steps' || arg.startsWith('--steps='));
          if (stepsMatch === '--steps') {
            const idx = m.args?.indexOf(stepsMatch);
            return parseInt(m.args?.[idx + 1]) || null;
          }
          if (stepsMatch?.startsWith('--steps=')) {
            return parseInt(stepsMatch.split('=')[1]) || null;
          }
          return null;
        })
        .filter(Boolean);

      if (stepsValues.length > 0) {
        // Use the first server model's steps
        const stepsValue = stepsValues[0];
        setServerModeSteps(stepsValue);
        setSampleSteps(stepsValue);
      } else {
        setServerModeSteps(null);
      }
    } else {
      setServerModeSteps(null);
    }
  }, [selectedModels, modelsMap]);

  // Apply settings when provided (from "Create More" button)
  useEffect(() => {
    if (settings) {
      if (settings.prompt && onPromptChange) {
        // Prompt is handled by parent/Studio
      }
      if (settings.negative_prompt !== undefined) setNegativePrompt(settings.negative_prompt);
      if (settings.size) {
        const [w, h] = settings.size.split('x').map(Number);
        if (w && h) {
          setWidth(w);
          setHeight(h);
        }
      }
      if (settings.strength !== undefined) setStrength(settings.strength);
      if (settings.type === 'edit' || settings.type === 'variation') {
        onModeChange?.(settings.type === 'edit' ? 'imgedit' : 'image');
      }

      // Load source image for edit/variation modes
      if (settings.input_image_path && (settings.type === 'edit' || settings.type === 'variation')) {
        const loadImage = async () => {
          try {
            const filename = settings.input_image_path.split('/').pop();
            const staticUrl = `/static/input/${filename}`;

            const response = await fetch(staticUrl);
            if (!response.ok) {
              console.error('Failed to fetch input image:', response.statusText);
              return;
            }

            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type || 'image/png' });

            setSourceImage(file);
            setSourceImagePreview(staticUrl);
            setUpscaleResult(null);
          } catch (err) {
            console.error('Error loading source image:', err);
          }
        };

        loadImage();
      }
    }
  }, [settings, onModeChange]);

  // Apply editImageSettings when provided (from "Edit Image" button)
  useEffect(() => {
    if (editImageSettings) {
      onModeChange?.('imgedit');

      if (editImageSettings.prompt !== undefined && onPromptChange) {
        // Prompt is handled by parent/Studio
      }
      if (editImageSettings.negative_prompt !== undefined) {
        setNegativePrompt(editImageSettings.negative_prompt);
      }

      if (editImageSettings.size) {
        const [w, h] = editImageSettings.size.split('x').map(Number);
        if (w && h) {
          setWidth(w);
          setHeight(h);
        }
      }

      if (editImageSettings.imageFile && editImageSettings.imageUrl) {
        if (editImageUrlRef.current && editImageUrlRef.current !== editImageSettings.imageUrl) {
          URL.revokeObjectURL(editImageUrlRef.current);
        }
        editImageUrlRef.current = editImageSettings.imageUrl;

        setSourceImage(editImageSettings.imageFile);
        setSourceImagePreview(editImageSettings.imageUrl);
        setUpscaleResult(null);
      }

      return () => {
        if (editImageUrlRef.current) {
          URL.revokeObjectURL(editImageUrlRef.current);
          editImageUrlRef.current = null;
        }
      };
    }
  }, [editImageSettings, onModeChange]);

  // Save form state to localStorage whenever fields change
  useEffect(() => {
    if (!settings && !editImageSettings) {
      const formState = {
        mode: localMode,
        negativePrompt,
        width,
        height,
        seed,
        n,
        useQueue,
        strength,
        upscaleFactor,
        upscaleResizeMode,
        upscalerName,
        upscaleAfterGeneration,
        cfgScale,
        samplingMethod,
        sampleSteps,
        clipSkip,
        videoFrames,
        videoFps,
        flowShift,
        flowShiftValue,
      };
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify(formState));
    }
  }, [
    localMode,
    negativePrompt,
    width,
    height,
    seed,
    n,
    useQueue,
    strength,
    upscaleFactor,
    upscaleResizeMode,
    upscalerName,
    upscaleAfterGeneration,
    cfgScale,
    samplingMethod,
    sampleSteps,
    clipSkip,
    videoFrames,
    videoFps,
    flowShift,
    flowShiftValue,
    settings,
    editImageSettings,
  ]);

  // Load form state from localStorage on mount
  useEffect(() => {
    try {
      const savedState = localStorage.getItem(FORM_STATE_KEY);
      if (savedState) {
        const formState = JSON.parse(savedState);
        if (formState.mode) onModeChange?.(formState.mode);
        if (formState.negativePrompt !== undefined) setNegativePrompt(formState.negativePrompt);
        if (formState.width) setWidth(formState.width);
        if (formState.height) setHeight(formState.height);
        if (formState.seed !== undefined) setSeed(formState.seed);
        if (formState.n !== undefined) setN(formState.n);
        if (formState.useQueue !== undefined) setUseQueue(formState.useQueue);
        if (formState.strength !== undefined) setStrength(formState.strength);
        if (formState.upscaleFactor !== undefined) setUpscaleFactor(formState.upscaleFactor);
        if (formState.upscaleResizeMode !== undefined) setUpscaleResizeMode(formState.upscaleResizeMode);
        if (formState.upscalerName) setUpscalerName(formState.upscalerName);
        if (formState.upscaleAfterGeneration !== undefined) setUpscaleAfterGeneration(formState.upscaleAfterGeneration);
        if (formState.cfgScale !== undefined) setCfgScale(formState.cfgScale);
        if (formState.samplingMethod) setSamplingMethod(formState.samplingMethod);
        // NOTE: sampleSteps is NOT restored from localStorage for server mode models
        if (formState.clipSkip) setClipSkip(formState.clipSkip);
        if (formState.videoFrames) setVideoFrames(formState.videoFrames);
        if (formState.videoFps) setVideoFps(formState.videoFps);
        if (formState.flowShift !== undefined) setFlowShift(formState.flowShift);
        if (formState.flowShiftValue !== undefined) setFlowShiftValue(formState.flowShiftValue);
      }
    } catch (err) {
      console.warn('Failed to load form state from localStorage:', err);
    }
  }, []);

  const getApiMode = useCallback((modeValue) => {
    if (modeValue === "imgedit") return "edit";
    if (modeValue === "image") {
      return sourceImage ? "variation" : "generate";
    }
    return "generate";
  }, [sourceImage]);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Image size must be less than 50MB");
      return;
    }

    setSourceImage(file);
    setUpscaleResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setSourceImage(null);
    setSourceImagePreview(null);
    setUpscaleResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleEndImageFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Image size must be less than 50MB");
      return;
    }

    setEndImage(file);

    const reader = new FileReader();
    reader.onload = (e) => {
      setEndImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearEndImage = () => {
    setEndImage(null);
    setEndImagePreview(null);
    if (endImageInputRef.current) {
      endImageInputRef.current.value = "";
    }
  };

  const handleDownloadUpscaled = () => {
    if (!upscaleResult) return;
    const a = document.createElement('a');
    a.href = upscaleResult;
    a.download = `upscaled_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleUpscale = async () => {
    if (!sourceImage) {
      toast.error("Please select a source image");
      return;
    }

    setIsUpscaling(true);
    try {
      const formData = new FormData();
      formData.append('image', sourceImage);
      formData.append('upscale_factor', upscaleFactor);
      formData.append('resize_mode', upscaleResizeMode);
      formData.append('upscaler', upscalerName);

      if (upscaleResizeMode === 1) {
        formData.append('target_width', upscaleTargetWidth);
        formData.append('target_height', upscaleTargetHeight);
      }

      const response = await authenticatedFetch("/sdapi/v1/extra-single-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upscale failed: ${response.status}`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setUpscaleResult(url);
      setSourceImagePreview(url);

      toast.success("Image upscaled successfully!");
    } catch (err) {
      toast.error(err.message || "Failed to upscale image");
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleGenerate = async () => {
    if (selectedModels.length === 0) {
      toast.error("Please select at least one model");
      return;
    }

    if (localMode !== "upscale" && localMode !== "video" && !prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    const currentModeConfig = MODES.find(m => m.value === localMode);
    if (currentModeConfig?.needsImage && !sourceImage && !upscaleResult) {
      toast.error("Please select a source image");
      return;
    }

    try {
      if (localMode === "upscale") {
        await handleUpscale();
        return;
      }

      const seedValue = n === 1 ? (seed || undefined) : undefined;

      const baseParams = {
        mode: getApiMode(localMode),
        prompt,
        negative_prompt: negativePrompt,
        size: `${width}x${height}`,
        seed: seedValue,
        cfg_scale: cfgScale,
        sampling_method: samplingMethod,
        sample_steps: sampleSteps,
        clip_skip: clipSkip,
      };

      if (localMode === "video") {
        baseParams.video_frames = videoFrames;
        baseParams.video_fps = videoFps;
        if (flowShift) {
          baseParams.flow_shift = flowShiftValue;
        }
        if (sourceImage) {
          baseParams.image = sourceImage;
        }
        if (endImage) {
          baseParams.end_image = endImage;
        }
      }

      if ((localMode === "image" || localMode === "imgedit") && sourceImage) {
        baseParams.image = sourceImage;
      }

      if (localMode === "image" && sourceImage) {
        baseParams.strength = strength;
      }

      const promises = [];
      for (const modelId of selectedModels) {
        if (n === 1) {
          promises.push(generateQueued({ ...baseParams, model: modelId }));
        } else {
          for (let i = 0; i < n; i++) {
            const randomSeed = Math.floor(Math.random() * 4294967295);
            promises.push(
              generateQueued({
                ...baseParams,
                model: modelId,
                seed: randomSeed,
              })
            );
          }
        }
      }

      await Promise.all(promises);
      const totalJobs = selectedModels.length * n;
      toast.success(`${totalJobs} job(s) added to queue!`);

      if (onGenerated) {
        onGenerated();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  const currentModeConfig = MODES.find(m => m.value === localMode);

  // Don't render if closed
  if (!open) {
    return null;
  }

  const selectedModelsMultiple = selectedModels.length > 1;

  return (
    <>
    <Card data-testid="settings-panel">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Settings</CardTitle>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange?.(false)}>
            ✕
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
          {/* Mode-specific settings */}
          {localMode === "image" && (
            <ImageSettings
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              supportsNegativePrompt={supportsNegativePrompt}
              width={width}
              onWidthChange={setWidth}
              height={height}
              onHeightChange={setHeight}
              sourceImage={sourceImage}
              strength={strength}
              onStrengthChange={setStrength}
              upscaleAfterGeneration={upscaleAfterGeneration}
              onUpscaleAfterGenerationChange={setUpscaleAfterGeneration}
              upscaleFactor={upscaleFactor}
              onUpscaleFactorChange={setUpscaleFactor}
              cfgScale={cfgScale}
              onCfgScaleChange={setCfgScale}
              samplingMethod={samplingMethod}
              onSamplingMethodChange={setSamplingMethod}
              sampleSteps={sampleSteps}
              onSampleStepsChange={setSampleSteps}
              clipSkip={clipSkip}
              onClipSkipChange={setClipSkip}
              hasServerModeModel={hasServerModeModel}
              serverModeSteps={serverModeSteps}
              seed={seed}
              onSeedChange={setSeed}
              n={n}
              onNChange={setN}
              useQueue={useQueue}
              onUseQueueChange={setUseQueue}
              isLoading={isLoading}
              isUpscaling={isUpscaling}
              selectedModelsMultiple={selectedModelsMultiple}
            />
          )}

          {localMode === "imgedit" && (
            <EditSettings
              sourceImage={sourceImage}
              sourceImagePreview={sourceImagePreview}
              onFileSelect={handleFileSelect}
              onClearImage={handleClearImage}
              fileInputRef={fileInputRef}
              negativePrompt={negativePrompt}
              onNegativePromptChange={setNegativePrompt}
              supportsNegativePrompt={supportsNegativePrompt}
              width={width}
              onWidthChange={setWidth}
              height={height}
              onHeightChange={setHeight}
              cfgScale={cfgScale}
              onCfgScaleChange={setCfgScale}
              samplingMethod={samplingMethod}
              onSamplingMethodChange={setSamplingMethod}
              sampleSteps={sampleSteps}
              onSampleStepsChange={setSampleSteps}
              clipSkip={clipSkip}
              onClipSkipChange={setClipSkip}
              hasServerModeModel={hasServerModeModel}
              serverModeSteps={serverModeSteps}
              seed={seed}
              onSeedChange={setSeed}
              n={n}
              onNChange={setN}
              useQueue={useQueue}
              onUseQueueChange={setUseQueue}
              isLoading={isLoading}
              isUpscaling={isUpscaling}
              selectedModelsMultiple={selectedModelsMultiple}
            />
          )}

          {localMode === "video" && (
            <VideoSettings
              sourceImage={sourceImage}
              sourceImagePreview={sourceImagePreview}
              onFileSelect={handleFileSelect}
              onClearImage={handleClearImage}
              fileInputRef={fileInputRef}
              endImage={endImage}
              endImagePreview={endImagePreview}
              onEndImageFileSelect={handleEndImageFileSelect}
              onClearEndImage={handleClearEndImage}
              endImageInputRef={endImageInputRef}
              videoFrames={videoFrames}
              onVideoFramesChange={setVideoFrames}
              videoFps={videoFps}
              onVideoFpsChange={setVideoFps}
              flowShift={flowShift}
              onFlowShiftChange={setFlowShift}
              flowShiftValue={flowShiftValue}
              onFlowShiftValueChange={setFlowShiftValue}
              width={width}
              onWidthChange={setWidth}
              height={height}
              onHeightChange={setHeight}
              cfgScale={cfgScale}
              onCfgScaleChange={setCfgScale}
              samplingMethod={samplingMethod}
              onSamplingMethodChange={setSamplingMethod}
              sampleSteps={sampleSteps}
              onSampleStepsChange={setSampleSteps}
              clipSkip={clipSkip}
              onClipSkipChange={setClipSkip}
              hasServerModeModel={hasServerModeModel}
              serverModeSteps={serverModeSteps}
              seed={seed}
              onSeedChange={setSeed}
              n={n}
              onNChange={setN}
              useQueue={useQueue}
              onUseQueueChange={setUseQueue}
              isLoading={isLoading}
              isUpscaling={isUpscaling}
              selectedModelsMultiple={selectedModelsMultiple}
            />
          )}

          {localMode === "upscale" && (
            <UpscaleSettings
              sourceImage={sourceImage}
              sourceImagePreview={sourceImagePreview}
              upscaleResult={upscaleResult}
              onFileSelect={handleFileSelect}
              onClearImage={handleClearImage}
              onDownloadUpscaled={handleDownloadUpscaled}
              fileInputRef={fileInputRef}
              isUpscaling={isUpscaling}
              availableUpscalers={availableUpscalers}
              upscalerName={upscalerName}
              onUpscalerNameChange={setUpscalerName}
              upscaleFactor={upscaleFactor}
              onUpscaleFactorChange={setUpscaleFactor}
              upscaleResizeMode={upscaleResizeMode}
              onUpscaleResizeModeChange={setUpscaleResizeMode}
              upscaleTargetWidth={upscaleTargetWidth}
              onUpscaleTargetWidthChange={setUpscaleTargetWidth}
              upscaleTargetHeight={upscaleTargetHeight}
              onUpscaleTargetHeightChange={setUpscaleTargetHeight}
            />
          )}

          {/* Generate Button - only show for modes that need it (not upscale which has its own button) */}
          {localMode !== "upscale" && (
            <div className="flex items-center justify-end pt-4 border-t">
              <Button
                onClick={handleGenerate}
                disabled={isLoading || isUpscaling || selectedModels.length === 0 || (localMode !== "upscale" && localMode !== "video" && !prompt.trim())}
                className="gap-2 px-6"
                data-testid="generate-button"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
    </Card>

    {/* Model Selector Modal */}
    <ModelSelectorModal
      open={isModelSelectorOpen}
      onOpenChange={setIsModelSelectorOpen}
      selectedModels={selectedModels}
      onModelsChange={(models) => {
        onModelsChange?.(models);
        setIsModelSelectorOpen(false);
      }}
      mode={localMode}
    />
    </>
  );
}

export default GeneratePanel;
