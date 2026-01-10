import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Wand2, Upload, Image as ImageIcon, Sparkles, List,
  ChevronDown, ChevronUp, Download, Loader2, MinusCircle, Video
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Card, CardContent } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { authenticatedFetch } from "../utils/api";
import { MultiModelSelector } from "./MultiModelSelector";

// localStorage key for form state persistence
const FORM_STATE_KEY = "sd-cpp-studio-generate-form-state";

const MODES = [
  { value: "image", label: "Image", icon: ImageIcon, needsImage: false, optionalImage: true, description: "Text to Image / Image to Image" },
  { value: "imgedit", label: "Edit", icon: ImageIcon, needsImage: true, description: "Image Edit" },
  { value: "video", label: "Video", icon: Video, needsImage: false, description: "Text/Image to Video" },
  { value: "upscale", label: "Upscale", icon: ImageIcon, needsImage: true, description: "Upscale" },
];

// Size presets for quick selection
const SIZE_PRESETS = [
  { width: 256, height: 256, label: "256" },
  { width: 512, height: 512, label: "512" },
  { width: 768, height: 768, label: "768" },
  { width: 1024, height: 1024, label: "1024" },
  { width: 1024, height: 768, label: "1024x768" },
  { width: 768, height: 1024, label: "768x1024" },
  { width: 1536, height: 1024, label: "1536x1024" },
  { width: 1024, height: 1536, label: "1024x1536" },
];

const UPSCALE_FACTORS = [2, 4, 8];

const SAMPLING_METHODS = [
  { value: "euler", label: "Euler" },
  { value: "euler_a", label: "Euler Ancestral" },
  { value: "ddim", label: "DDIM" },
  { value: "plms", label: "PLMS" },
  { value: "dpmpp_2m", label: "DPM++ 2M" },
  { value: "dpmpp_2s_a", label: "DPM++ 2S Ancestral" },
  { value: "dpmpp_sde", label: "DPM++ SDE" },
  { value: "dpm_fast", label: "DPM Fast" },
  { value: "dpm_adaptive", label: "DPM Adaptive" },
  { value: "lcm", label: "LCM" },
  { value: "tcd", label: "TCD" },
];

const CLIP_SKIP_OPTIONS = [
  { value: "-1", label: "Auto (Model Default)" },
  { value: "1", label: "Skip 1 layer" },
  { value: "2", label: "Skip 2 layers" },
  { value: "3", label: "Skip 3 layers" },
  { value: "4", label: "Skip 4 layers" },
  { value: "5", label: "Skip 5 layers" },
  { value: "6", label: "Skip 6 layers" },
  { value: "7", label: "Skip 7 layers" },
  { value: "8", label: "Skip 8 layers" },
  { value: "9", label: "Skip 9 layers" },
  { value: "10", label: "Skip 10 layers" },
  { value: "11", label: "Skip 11 layers" },
  { value: "12", label: "Skip 12 layers" },
];

const RESIZE_MODES = [
  { value: 0, label: "By Factor", description: "Upscale by multiplier (e.g., 2x, 4x)" },
  { value: 1, label: "To Size", description: "Upscale to specific dimensions" },
];

/**
 * GeneratePanel - Multi-model generation panel
 *
 * @param {Object} props
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {function} props.onModelsChange - Callback when model selection changes
 * @param {Object} props.settings - Settings from "Create More" button
 * @param {Object} props.editImageSettings - Settings from "Edit Image" button with image file
 * @param {function} props.onGenerated - Callback when generation completes
 */
export function GeneratePanel({ selectedModels = [], onModelsChange, settings, editImageSettings, onGenerated }) {
  const { generateQueued, isLoading } = useImageGeneration();
  const fileInputRef = useRef(null);
  const editImageUrlRef = useRef(null); // Track object URL for cleanup

  // Mode selection
  const [mode, setMode] = useState("image");

  // Common settings
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");

  // Size as separate width/height for sliders
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const size = useMemo(() => `${width}x${height}`, [width, height]);

  const [seed, setSeed] = useState("");
  const [n, setN] = useState(1); // Number of images to generate per model
  const [useQueue, setUseQueue] = useState(true);

  // Store full models data
  const [modelsData, setModelsData] = useState([]);

  // Track if selected models support negative prompts
  const [supportsNegativePrompt, setSupportsNegativePrompt] = useState(false);

  // Track if selected models are server mode (steps cannot be changed dynamically)
  const [hasServerModeModel, setHasServerModeModel] = useState(false);
  const [serverModeSteps, setServerModeSteps] = useState(null);

  // Image-related settings (for img2img, imgedit, upscale)
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

  // Video settings
  const [videoFrames, setVideoFrames] = useState(33);
  const [videoFps, setVideoFps] = useState(24);
  const [flowShift, setFlowShift] = useState(false);
  const [flowShiftValue, setFlowShiftValue] = useState(3.0);
  const [endImage, setEndImage] = useState(null);
  const [endImagePreview, setEndImagePreview] = useState(null);
  const endImageInputRef = useRef(null);

  // SD.cpp Advanced Settings
  const [cfgScale, setCfgScale] = useState(2.5);
  const [samplingMethod, setSamplingMethod] = useState("euler");
  const [sampleSteps, setSampleSteps] = useState(20);
  const [clipSkip, setClipSkip] = useState("-1");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Fetch upscalers on mount
  useEffect(() => {
    fetch("/sdapi/v1/upscalers")
      .then((res) => res.json())
      .then((data) => {
        setAvailableUpscalers(data);
        if (data.length > 0) {
          setUpscalerName(data[0].name);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch upscalers:", err);
      });
  }, []);

  // Fetch models data
  useEffect(() => {
    fetch("/api/models")
      .then((res) => res.json())
      .then((data) => {
        setModelsData(data.models || []);
      })
      .catch((err) => {
        console.error("Failed to fetch models:", err);
      });
  }, []);

  // Update negative prompt support when selectedModels change
  useEffect(() => {
    // Check if ANY selected model supports negative prompts
    const hasSupport = selectedModels.some(modelId => {
      const model = modelsData?.find(m => m.id === modelId);
      return model?.supports_negative_prompt === true;
    });
    setSupportsNegativePrompt(hasSupport);
  }, [selectedModels, modelsData]);

  // Update server mode steps info when selectedModels change
  useEffect(() => {
    // Check if ANY selected model is server mode
    const serverModels = selectedModels
      .map(modelId => modelsData?.find(m => m.id === modelId))
      .filter(m => m && m.exec_mode === 'server');

    setHasServerModeModel(serverModels.length > 0);

    // For server mode models, parse steps from command line args
    // Server mode SD.cpp requires --steps to be specified at startup, not in HTTP requests
    if (serverModels.length > 0) {
      const stepsList = serverModels
        .map(model => {
          // Parse --steps from args array
          if (model.args && Array.isArray(model.args)) {
            const stepsIndex = model.args.indexOf('--steps');
            if (stepsIndex !== -1 && stepsIndex + 1 < model.args.length) {
              const stepsValue = model.args[stepsIndex + 1];
              const parsed = parseInt(stepsValue, 10);
              if (!isNaN(parsed) && parsed > 0) {
                return parsed;
              }
            }
          }
          return null;
        })
        .filter(s => s !== null);

      // If all server models have the same steps value, show it
      if (stepsList.length > 0 && stepsList.every(s => s === stepsList[0])) {
        setServerModeSteps(stepsList[0]);
      } else {
        setServerModeSteps(null);
      }
    } else {
      setServerModeSteps(null);
    }
  }, [selectedModels, modelsData]);

  // Apply settings when provided (from "Create More" button)
  useEffect(() => {
    if (settings) {
      if (settings.prompt) setPrompt(settings.prompt);
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
        // For backwards compatibility, map both 'variation' and 'edit' to appropriate modes
        setMode(settings.type === 'edit' ? 'imgedit' : 'image');
      }

      // Load source image for edit/variation modes
      if (settings.input_image_path && (settings.type === 'edit' || settings.type === 'variation')) {
        const loadImage = async () => {
          try {
            // Extract filename from the disk path and convert to static URL
            const filename = settings.input_image_path.split('/').pop();
            const staticUrl = `/static/input/${filename}`;

            // Fetch the image
            const response = await fetch(staticUrl);
            if (!response.ok) {
              console.error('Failed to fetch input image:', response.statusText);
              return;
            }

            const blob = await response.blob();
            const file = new File([blob], filename, { type: blob.type || 'image/png' });

            // Set both the file and preview
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
  }, [settings]);

  // Apply editImageSettings when provided (from "Edit Image" button)
  useEffect(() => {
    if (editImageSettings) {
      // Set mode to imgedit
      setMode('imgedit');

      // Apply prompt if available
      if (editImageSettings.prompt !== undefined) {
        setPrompt(editImageSettings.prompt);
      }
      if (editImageSettings.negative_prompt !== undefined) {
        setNegativePrompt(editImageSettings.negative_prompt);
      }

      // Set size if available
      if (editImageSettings.size) {
        const [w, h] = editImageSettings.size.split('x').map(Number);
        if (w && h) {
          setWidth(w);
          setHeight(h);
        }
      }

      // Set the source image from editImageSettings
      if (editImageSettings.imageFile && editImageSettings.imageUrl) {
        // Clean up previous object URL if it exists
        if (editImageUrlRef.current && editImageUrlRef.current !== editImageSettings.imageUrl) {
          URL.revokeObjectURL(editImageUrlRef.current);
        }
        editImageUrlRef.current = editImageSettings.imageUrl;

        setSourceImage(editImageSettings.imageFile);
        setSourceImagePreview(editImageSettings.imageUrl);
        setUpscaleResult(null);
      }

      // Cleanup function for when editImageSettings is cleared
      return () => {
        if (editImageUrlRef.current) {
          URL.revokeObjectURL(editImageUrlRef.current);
          editImageUrlRef.current = null;
        }
      };
    }
  }, [editImageSettings]);

  // Save form state to localStorage whenever fields change
  // Skip saving when settings or editImageSettings are being applied (they override localStorage)
  useEffect(() => {
    if (settings || editImageSettings) {
      return; // Don't save when settings are being applied from "Create More" or "Edit Image"
    }

    const formState = {
      mode,
      prompt,
      negativePrompt,
      width,
      height,
      seed,
      n,
      useQueue,
      strength,
      upscaleFactor,
      upscalerName,
      upscaleResizeMode,
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

    try {
      localStorage.setItem(FORM_STATE_KEY, JSON.stringify(formState));
    } catch (err) {
      // Ignore localStorage errors (e.g., quota exceeded, private browsing)
      console.warn('Failed to save form state to localStorage:', err);
    }
  }, [
    mode, prompt, negativePrompt, width, height, seed, n, useQueue,
    strength, upscaleFactor, upscalerName, upscaleResizeMode, upscaleAfterGeneration,
    cfgScale, samplingMethod, sampleSteps, clipSkip,
    videoFrames, videoFps, flowShift, flowShiftValue,
    settings, editImageSettings,
  ]);

  // Load form state from localStorage on mount (only if not overridden by settings/editImageSettings)
  useEffect(() => {
    if (settings || editImageSettings) {
      return; // Don't load from localStorage when settings are being applied
    }

    try {
      const savedState = localStorage.getItem(FORM_STATE_KEY);
      if (savedState) {
        const formState = JSON.parse(savedState);

        // Only restore fields that exist in saved state
        if (formState.mode !== undefined) {
          // Map old modes to new modes for backwards compatibility
          const mappedMode = formState.mode === 'txt2img' || formState.mode === 'img2img'
            ? 'image'
            : formState.mode;
          setMode(mappedMode);
        }
        if (formState.prompt !== undefined) setPrompt(formState.prompt);
        if (formState.negativePrompt !== undefined) setNegativePrompt(formState.negativePrompt);
        if (formState.width !== undefined) setWidth(formState.width);
        if (formState.height !== undefined) setHeight(formState.height);
        if (formState.seed !== undefined) setSeed(formState.seed);
        if (formState.n !== undefined) setN(formState.n);
        if (formState.useQueue !== undefined) setUseQueue(formState.useQueue);
        if (formState.strength !== undefined) setStrength(formState.strength);
        if (formState.upscaleFactor !== undefined) setUpscaleFactor(formState.upscaleFactor);
        if (formState.upscalerName !== undefined) setUpscalerName(formState.upscalerName);
        if (formState.upscaleResizeMode !== undefined) setUpscaleResizeMode(formState.upscaleResizeMode);
        if (formState.upscaleAfterGeneration !== undefined) setUpscaleAfterGeneration(formState.upscaleAfterGeneration);
        if (formState.cfgScale !== undefined) setCfgScale(formState.cfgScale);
        if (formState.samplingMethod !== undefined) setSamplingMethod(formState.samplingMethod);
        if (formState.sampleSteps !== undefined) setSampleSteps(formState.sampleSteps);
        if (formState.clipSkip !== undefined) setClipSkip(formState.clipSkip);
        if (formState.videoFrames !== undefined) setVideoFrames(formState.videoFrames);
        if (formState.videoFps !== undefined) setVideoFps(formState.videoFps);
        if (formState.flowShift !== undefined) setFlowShift(formState.flowShift);
        if (formState.flowShiftValue !== undefined) setFlowShiftValue(formState.flowShiftValue);
      }
    } catch (err) {
      // Ignore localStorage errors (e.g., invalid JSON)
      console.warn('Failed to load form state from localStorage:', err);
    }
    // Only run on mount - empty deps array is intentional
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getApiMode = useCallback((modeValue) => {
    if (modeValue === "imgedit") return "edit";
    // "image" mode: use "variation" if source image is provided, otherwise "generate"
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

  const handleGenerate = async () => {
    if (selectedModels.length === 0) {
      toast.error("Please select at least one model");
      return;
    }

    // Validate based on mode
    if (mode !== "upscale" && mode !== "video" && !prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    const currentModeConfig = MODES.find(m => m.value === mode);
    if (currentModeConfig?.needsImage && !sourceImage && !upscaleResult) {
      toast.error("Please select a source image");
      return;
    }

    try {
      if (mode === "upscale") {
        await handleUpscale();
        return;
      }

      // Determine seed value: use provided seed when n=1, otherwise undefined
      const seedValue = n === 1 ? (seed || undefined) : undefined;

      const baseParams = {
        mode: getApiMode(mode),
        prompt,
        negative_prompt: negativePrompt,
        size: `${width}x${height}`,
        seed: seedValue,
        cfg_scale: cfgScale,
        sampling_method: samplingMethod,
        sample_steps: sampleSteps,
        clip_skip: clipSkip,
      };

      // Video-specific parameters
      if (mode === "video") {
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

      // Add image for img2img modes
      if ((mode === "image" || mode === "imgedit") && sourceImage) {
        baseParams.image = sourceImage;
      }

      // Add strength for image mode when source image is provided
      if (mode === "image" && sourceImage) {
        baseParams.strength = strength;
      }

      // Create n generations for each selected model
      const promises = [];
      for (const modelId of selectedModels) {
        if (n === 1) {
          // Single generation: use current behavior (respect seed or use random)
          promises.push(generateQueued({ ...baseParams, model: modelId }));
        } else {
          // Multiple generations: create separate jobs with unique random seeds
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

  const handleUpscale = async () => {
    const imageToUpscale = upscaleResult || sourceImagePreview;
    if (!imageToUpscale) {
      toast.error("Please select an image first");
      return;
    }

    setIsUpscaling(true);
    try {
      const base64Data = imageToUpscale.split("base64,")?.[1] || imageToUpscale;

      const response = await authenticatedFetch("/sdapi/v1/extra-single-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          resize_mode: upscaleResizeMode,
          upscaling_resize: upscaleFactor,
          upscaling_resize_w: parseInt(size.split("x")[0]) * upscaleFactor,
          upscaling_resize_h: parseInt(size.split("x")[1]) * upscaleFactor,
          upscaler_1: upscalerName,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upscaling failed");
      }

      const data = await response.json();
      setUpscaleResult(`data:image/png;base64,${data.image}`);
      toast.success("Image upscaled successfully!");
    } catch (err) {
      console.error("Upscaling error:", err);
      toast.error(err.message || "Failed to upscale image");
    } finally {
      setIsUpscaling(false);
    }
  };

  const handleDownloadUpscaled = () => {
    if (!upscaleResult) return;
    const link = document.createElement("a");
    link.href = upscaleResult;
    link.download = `upscaled_${Date.now()}.png`;
    link.click();
    toast.success("Image downloaded");
  };

  const currentModeConfig = MODES.find(m => m.value === mode);

  return (
    <Card data-testid="generate-panel">
      <CardContent className="space-y-6">
          {/* Sticky Generate Bar */}
          <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border rounded-lg p-3 shadow-sm">
            <div className="flex items-center justify-between">
              <Button
                onClick={handleGenerate}
                disabled={isLoading || isUpscaling || selectedModels.length === 0}
                size="lg"
                className="flex-1 mr-4"
              >
                {(isLoading || isUpscaling) ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {isUpscaling ? "Upscaling..." : "Generating..."}
                  </>
                ) : (
                  <>
                    {mode === "upscale" ? (
                      <>
                        <currentModeConfig.icon className="h-4 w-4 mr-2" />
                        Upscale Image
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Generate
                      </>
                    )}
                  </>
                )}
              </Button>
              <div className="text-sm text-muted-foreground">
                Selected: {selectedModels.length}
              </div>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="space-y-2">
            <Label>Generation Mode</Label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {MODES.map((modeOption) => {
                const Icon = modeOption.icon;
                return (
                  <button
                    key={modeOption.value}
                    onClick={() => setMode(modeOption.value)}
                    className={cn(
                      "flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors",
                      mode === modeOption.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                    title={modeOption.description}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    <span className="text-xs font-medium">{modeOption.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Model Selection - Multi-select */}
          <MultiModelSelector
            selectedModels={selectedModels}
            onModelsChange={onModelsChange}
            mode={mode}
            className="space-y-2"
          />

          {/* Image Upload for modes that need it */}
          {(currentModeConfig.needsImage || currentModeConfig.optionalImage) && (
            <div className="space-y-2">
              <Label>Source Image {currentModeConfig.needsImage ? "*" : "(Optional)"}</Label>
              <div className="flex items-center gap-4">
                {(upscaleResult || sourceImagePreview) ? (
                  <div className="relative group">
                    <img
                      src={upscaleResult || sourceImagePreview}
                      alt="Source"
                      className={cn(
                        "object-cover rounded-lg border",
                        mode === "upscale" ? "w-full max-w-md" : "w-32 h-32"
                      )}
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={handleClearImage}
                      disabled={isLoading || isUpscaling}
                    >
                      <MinusCircle className="h-4 w-4" />
                    </Button>
                    {upscaleResult && (
                      <Button
                        onClick={handleDownloadUpscaled}
                        className="absolute bottom-2 right-2"
                        size="sm"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    )}
                  </div>
                ) : (
                  <div
                    className="w-32 h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Upload</span>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                  disabled={isLoading || isUpscaling}
                />
              </div>
            </div>
          )}

          {/* Prompt (not for upscale mode) */}
          {mode !== "upscale" && (
            <>
              <div className="space-y-2">
                <Label htmlFor="prompt">Prompt *</Label>
                <Textarea
                  id="prompt"
                  placeholder={
                    mode === "image"
                      ? sourceImage
                        ? "Transform this image into a watercolor painting..."
                        : "A serene landscape with rolling hills, a small cottage with a thatched roof, golden hour lighting..."
                      : mode === "imgedit"
                      ? "Transform this image into a watercolor painting..."
                      : mode === "video"
                      ? "A lovely cat running through a field of flowers..."
                      : "Describe your image..."
                  }
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={4}
                  disabled={isLoading || isUpscaling}
                />
              </div>

              {/* Negative Prompt - Only show if supported models are selected */}
              {supportsNegativePrompt && (
                <div className="space-y-2">
                  <Label htmlFor="negative-prompt">Negative Prompt</Label>
                  <Textarea
                    id="negative-prompt"
                    placeholder="blurry, low quality, distorted, watermark..."
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    rows={2}
                    disabled={isLoading || isUpscaling}
                  />
                </div>
              )}
            </>
          )}

          {/* Strength slider for image mode when source image is provided (img2img functionality) */}
          {mode === "image" && sourceImage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="strength">Strength: {strength.toFixed(2)}</Label>
              </div>
              <Slider
                id="strength"
                min={0}
                max={1}
                step={0.01}
                value={[strength]}
                onValueChange={(v) => setStrength(v[0])}
                disabled={isLoading || isUpscaling}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                How much to transform the source image. Lower = closer to original, Higher = more different.
              </p>
            </div>
          )}

          {/* Video Settings */}
          {mode === "video" && (
            <div className="space-y-4 bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold">Video Settings</h3>

              {/* Start Frame Image (Optional - for I2V) */}
              <div className="space-y-2">
                <Label>Start Frame Image (Optional - for Image to Video)</Label>
                <div className="flex items-center gap-4">
                  {sourceImagePreview ? (
                    <div className="relative group">
                      <img
                        src={sourceImagePreview}
                        alt="Start frame"
                        className="w-32 h-32 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={handleClearImage}
                        disabled={isLoading || isUpscaling}
                      >
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="w-32 h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Upload</span>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleFileSelect}
                    className="hidden"
                    disabled={isLoading || isUpscaling}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload a start frame for Image to Video (I2V) generation. Leave empty for Text to Video (T2V).
                </p>
              </div>

              {/* Video Frames */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="video-frames">Frames: {videoFrames}</Label>
                </div>
                <Slider
                  id="video-frames"
                  min={1}
                  max={300}
                  step={1}
                  value={[videoFrames]}
                  onValueChange={(v) => setVideoFrames(v[0])}
                  disabled={isLoading || isUpscaling}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Number of frames to generate (1 for single image, ~33 for 1 second video at 24fps)
                </p>
              </div>

              {/* Video FPS */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="video-fps">FPS: {videoFps}</Label>
                </div>
                <Slider
                  id="video-fps"
                  min={1}
                  max={60}
                  step={1}
                  value={[videoFps]}
                  onValueChange={(v) => setVideoFps(v[0])}
                  disabled={isLoading || isUpscaling}
                  className="w-full"
                />
              </div>

              {/* Flow Shift */}
              <div className="flex items-center justify-between p-3 bg-background rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="flow-shift">Enable Flow Shift</Label>
                  <p className="text-xs text-muted-foreground">
                    Wan-specific parameter for motion control
                  </p>
                </div>
                <Switch
                  id="flow-shift"
                  checked={flowShift}
                  onCheckedChange={setFlowShift}
                  disabled={isLoading || isUpscaling}
                />
              </div>

              {flowShift && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="flow-shift-value">Flow Shift Value: {flowShiftValue.toFixed(1)}</Label>
                  </div>
                  <Slider
                    id="flow-shift-value"
                    min={1.0}
                    max={12.0}
                    step={0.1}
                    value={[flowShiftValue]}
                    onValueChange={(v) => setFlowShiftValue(v[0])}
                    disabled={isLoading || isUpscaling}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Controls motion intensity. Higher = more motion.
                  </p>
                </div>
              )}

              {/* End Image (for FLF2V - First-Last Frame to Video) */}
              <div className="space-y-2">
                <Label>End Frame Image (Optional - for FLF2V)</Label>
                <div className="flex items-center gap-4">
                  {endImagePreview ? (
                    <div className="relative group">
                      <img
                        src={endImagePreview}
                        alt="End frame"
                        className="w-32 h-32 object-cover rounded-lg border"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="icon"
                        className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={handleClearEndImage}
                        disabled={isLoading || isUpscaling}
                      >
                        <MinusCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div
                      className="w-32 h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                      onClick={() => endImageInputRef.current?.click()}
                    >
                      <Upload className="h-8 w-8 text-muted-foreground mb-1" />
                      <span className="text-xs text-muted-foreground">Upload</span>
                    </div>
                  )}
                  <input
                    ref={endImageInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={handleEndImageFileSelect}
                    className="hidden"
                    disabled={isLoading || isUpscaling}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Upload an end frame for First-Last Frame to Video (FLF2V) generation
                </p>
              </div>
            </div>
          )}

          {/* Size (not for upscale - it has its own size options) */}
          {mode !== "upscale" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Image Size</Label>
                <span className="text-sm text-muted-foreground">{width} x {height}</span>
              </div>

              {/* Width Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Width</span>
                  <span className="text-xs font-mono">{width}px</span>
                </div>
                <Slider
                  value={[width]}
                  onValueChange={(v) => setWidth(v[0])}
                  min={100}
                  max={2048}
                  step={8}
                  disabled={isLoading || isUpscaling}
                  className="w-full"
                />
              </div>

              {/* Height Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Height</span>
                  <span className="text-xs font-mono">{height}px</span>
                </div>
                <Slider
                  value={[height]}
                  onValueChange={(v) => setHeight(v[0])}
                  min={100}
                  max={2048}
                  step={8}
                  disabled={isLoading || isUpscaling}
                  className="w-full"
                />
              </div>

              {/* Preset Buttons */}
              <div className="flex flex-wrap gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={`${preset.width}x${preset.height}`}
                    onClick={() => {
                      setWidth(preset.width);
                      setHeight(preset.height);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded border transition-colors",
                      width === preset.width && height === preset.height
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                    disabled={isLoading || isUpscaling}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Upscale Settings */}
          {mode === "upscale" && (
            <div className="space-y-4 bg-muted/50 rounded-lg p-4">
              <h3 className="font-semibold">Upscaler Settings</h3>

              {/* Upscaler Selection */}
              <div className="space-y-2">
                <Label>Upscaler</Label>
                <Select
                  value={upscalerName}
                  onValueChange={setUpscalerName}
                  disabled={isUpscaling}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableUpscalers.map((u) => (
                      <SelectItem key={u.name} value={u.name}>
                        {u.name} {u.scale > 1 ? `(${u.scale}x)` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Resize Mode */}
              <div className="space-y-2">
                <Label>Resize Mode</Label>
                <div className="grid grid-cols-2 gap-2">
                  {RESIZE_MODES.map((resizeMode) => (
                    <button
                      key={resizeMode.value}
                      onClick={() => setUpscaleResizeMode(resizeMode.value)}
                      className={cn(
                        "p-3 rounded-lg border text-left transition-colors",
                        upscaleResizeMode === resizeMode.value
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      )}
                    >
                      <div className="font-medium">{resizeMode.label}</div>
                      <div className="text-xs text-muted-foreground">{resizeMode.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Scale Factor */}
              {upscaleResizeMode === 0 && (
                <div className="space-y-2">
                  <Label>Scale Factor: {upscaleFactor}x</Label>
                  <div className="flex gap-2">
                    {UPSCALE_FACTORS.map((factor) => (
                      <button
                        key={factor}
                        onClick={() => setUpscaleFactor(factor)}
                        className={cn(
                          "px-4 py-2 rounded-lg border transition-colors",
                          upscaleFactor === factor
                            ? "border-primary bg-primary/10"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        {factor}x
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Post-generation Upscale (for non-upscale modes) */}
          {mode !== "upscale" && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="upscale-after">Upscale After Generation</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically upscale the generated image
                </p>
              </div>
              <Switch
                id="upscale-after"
                checked={upscaleAfterGeneration}
                onCheckedChange={setUpscaleAfterGeneration}
                disabled={isLoading || isUpscaling}
              />
            </div>
          )}

          {/* SD.cpp Advanced Settings */}
          {mode !== "upscale" && (
            <div className="space-y-4 pt-4 border-t border-border">
              <Button
                type="button"
                variant="ghost"
                className="w-full flex items-center justify-between p-0 h-auto"
                onClick={() => setShowAdvancedSettings(!showAdvancedSettings)}
              >
                <span className="text-sm font-medium">Advanced SD.cpp Settings</span>
                {showAdvancedSettings ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {showAdvancedSettings && (
                <div className="space-y-4 pt-4">
                  {/* CFG Scale */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cfg-scale">CFG Scale: {cfgScale.toFixed(1)}</Label>
                    </div>
                    <Slider
                      id="cfg-scale"
                      min={1}
                      max={20}
                      step={0.5}
                      value={[cfgScale]}
                      onValueChange={(v) => setCfgScale(v[0])}
                      disabled={isLoading || isUpscaling || selectedModels.length > 1}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedModels.length > 1
                        ? 'Using default settings for each selected model.'
                        : 'Classifier-free guidance scale. Higher = more prompt adherence.'}
                    </p>
                  </div>

                  {/* Sample Steps */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="sample-steps">
                        Sample Steps: {hasServerModeModel && serverModeSteps !== null ? serverModeSteps : sampleSteps}
                      </Label>
                    </div>
                    <Slider
                      id="sample-steps"
                      min={1}
                      max={100}
                      step={1}
                      value={[hasServerModeModel && serverModeSteps !== null ? serverModeSteps : sampleSteps]}
                      onValueChange={(v) => setSampleSteps(v[0])}
                      disabled={isLoading || isUpscaling || hasServerModeModel || selectedModels.length > 1}
                    />
                    <p className="text-xs text-muted-foreground">
                      {selectedModels.length > 1
                        ? 'Using default settings for each selected model.'
                        : hasServerModeModel && serverModeSteps !== null
                          ? `Steps are fixed at ${serverModeSteps} for server mode models (set via command line args).`
                          : 'Number of denoising steps. More steps = higher quality but slower.'}
                    </p>
                  </div>

                  {/* Sampling Method */}
                  <div className="space-y-2">
                    <Label htmlFor="sampling-method">Sampling Method</Label>
                    <Select value={samplingMethod} onValueChange={setSamplingMethod} disabled={isLoading || isUpscaling || selectedModels.length > 1}>
                      <SelectTrigger id="sampling-method">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SAMPLING_METHODS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedModels.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Using default settings for each selected model.
                      </p>
                    )}
                  </div>

                  {/* CLIP Skip */}
                  <div className="space-y-2">
                    <Label htmlFor="clip-skip">CLIP Skip</Label>
                    <Select value={clipSkip} onValueChange={setClipSkip} disabled={isLoading || isUpscaling || selectedModels.length > 1}>
                      <SelectTrigger id="clip-skip">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CLIP_SKIP_OPTIONS.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedModels.length > 1 && (
                      <p className="text-xs text-muted-foreground">
                        Using default settings for each selected model.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Advanced Options */}
          <div className="space-y-4 pt-4 border-t border-border">
            {/* Queue Mode */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="queue-mode">Queue Mode</Label>
                <p className="text-xs text-muted-foreground">
                  Add to queue and continue working
                </p>
              </div>
              <Switch
                id="queue-mode"
                checked={useQueue}
                onCheckedChange={setUseQueue}
                disabled={isLoading || isUpscaling}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="seed">Seed (optional)</Label>
              <Input
                id="seed"
                type="number"
                placeholder="Leave empty for random"
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
                disabled={n > 1 || isLoading || isUpscaling}
              />
              {n > 1 && (
                <p className="text-xs text-muted-foreground">
                  Seed is disabled when generating multiple images (random seeds will be used)
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="num-images">Number of Images: {n}</Label>
              </div>
              <Slider
                id="num-images"
                min={1}
                max={10}
                step={1}
                value={[n]}
                onValueChange={(v) => setN(v[0])}
                disabled={isLoading || isUpscaling}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                Generate multiple images with different random seeds
              </p>
            </div>
          </div>
        </CardContent>
    </Card>
  );
}

export default GeneratePanel;
