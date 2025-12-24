import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  Wand2, Upload, Image as ImageIcon, Sparkles, List,
  ChevronDown, ChevronUp, Download, Loader2
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { ModelSelector } from "./ModelSelector";
import { cn } from "../lib/utils";
import { authenticatedFetch } from "../utils/api";

const MODES = [
  { value: "txt2img", label: "Text to Image", icon: Wand2, needsImage: false },
  { value: "img2img", label: "Image to Image", icon: ImageIcon, needsImage: true },
  { value: "imgedit", label: "Image Edit", icon: ImageIcon, needsImage: true },
  { value: "upscale", label: "Upscale", icon: ImageIcon, needsImage: true },
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

export function Generate({ onGenerated, settings, selectedModel, onModelChange }) {
  const { generateQueued, isLoading } = useImageGeneration();
  const fileInputRef = useRef(null);

  // Mode selection
  const [mode, setMode] = useState("txt2img");

  // Common settings
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");

  // Size as separate width/height for sliders
  const [width, setWidth] = useState(512);
  const [height, setHeight] = useState(512);
  const size = useMemo(() => `${width}x${height}`, [width, height]);

  const [seed, setSeed] = useState("");
  const [useQueue, setUseQueue] = useState(true);

  // Store full models data for applying defaults
  const [modelsData, setModelsData] = useState([]);
  const [selectedModelData, setSelectedModelData] = useState(null);

  // Image-related settings (for img2img, imgedit, upscale)
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImagePreview, setSourceImagePreview] = useState(null);
  const [upscaleResult, setUpscaleResult] = useState(null);
  const [isUpscaling, setIsUpscaling] = useState(false);

  // Upscale settings
  const [upscaleAfterGeneration, setUpscaleAfterGeneration] = useState(false);
  const [upscaleFactor, setUpscaleFactor] = useState(2);
  const [upscaleResizeMode, setUpscaleResizeMode] = useState(0);
  const [upscalerName, setUpscalerName] = useState("RealESRGAN 4x+");
  const [availableUpscalers, setAvailableUpscalers] = useState([]);

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

  // Fetch models data to apply defaults
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

  // Apply model defaults when model changes
  useEffect(() => {
    if (!selectedModel || !modelsData.length) return;

    const model = modelsData.find(m => m.id === selectedModel);
    if (!model) return;

    setSelectedModelData(model);

    // Apply default_size from model config
    if (model.default_size) {
      const [w, h] = model.default_size.split('x').map(Number);
      if (w && h) {
        setWidth(w);
        setHeight(h);
      }
    }

    // Apply generation_params from model config
    if (model.generation_params) {
      const params = model.generation_params;
      if (params.cfg_scale !== undefined) setCfgScale(params.cfg_scale);
      if (params.sample_steps !== undefined) setSampleSteps(params.sample_steps);
      if (params.sampling_method) setSamplingMethod(params.sampling_method);
      if (params.clip_skip !== undefined) setClipSkip(params.clip_skip.toString());
    }
  }, [selectedModel, modelsData]);

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
      if (settings.seed) setSeed(settings.seed.toString());
      if (settings.type === 'edit' || settings.type === 'variation') {
        setMode(settings.type === 'edit' ? 'imgedit' : 'img2img');
      }
    }
  }, [settings]);

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

  const handleGenerate = async () => {
    // Validate based on mode
    if (mode !== "upscale" && !prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    if (MODES.find(m => m.value === mode)?.needsImage && !sourceImage && !upscaleResult) {
      toast.error("Please select a source image");
      return;
    }

    try {
      if (mode === "upscale") {
        await handleUpscale();
        return;
      }

      // For generation modes
      const params = {
        mode: mode === "imgedit" ? "edit" : mode === "img2img" ? "variation" : "generate",
        model: selectedModel || undefined,
        prompt,
        negative_prompt: negativePrompt,
        size,
        seed: seed || undefined,
        // SD.cpp Advanced Settings
        cfg_scale: cfgScale,
        sampling_method: samplingMethod,
        sample_steps: sampleSteps,
        clip_skip: clipSkip,
      };

      // Add image for img2img modes
      if ((mode === "img2img" || mode === "imgedit") && sourceImage) {
        params.image = sourceImage;
      }

      if (useQueue) {
        await generateQueued(params);
        toast.success("Job added to queue! Check Gallery for progress.");
        // Don't navigate when using queue - user may want to queue more images
        return;
      } else {
        await generateQueued(params);
        toast.success("Image generated successfully!");
      }

      // Only navigate to gallery when NOT using queue
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
  const filterCapabilities = useMemo(() => {
    if (mode === "img2img" || mode === "imgedit") {
      return ["image-to-image"];
    }
    return ["text-to-image"];
  }, [mode]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <currentModeConfig.icon className="h-5 w-5" />
          {currentModeConfig.label}
        </CardTitle>
        <CardDescription>
          {mode === "txt2img" && "Generate images from text descriptions"}
          {mode === "img2img" && "Create variations of images"}
          {mode === "imgedit" && "Edit and transform images"}
          {mode === "upscale" && "Enhance and upscale images"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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
                    "flex flex-col items-center gap-1.5 p-3 rounded-lg border text-center transition-colors",
                    mode === modeOption.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="text-xs">{modeOption.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Model Selector */}
        <div className="space-y-2">
          <ModelSelector
            currentModel={selectedModel}
            onModelChange={onModelChange}
            className="w-full"
            filterCapabilities={filterCapabilities}
          />
        </div>

        {/* Image Upload for modes that need it */}
        {currentModeConfig.needsImage && (
          <div className="space-y-2">
            <Label>Source Image *</Label>
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
                    ×
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
                  mode === "txt2img"
                    ? "A serene landscape with rolling hills, a small cottage with a thatched roof, golden hour lighting..."
                    : mode === "imgedit"
                    ? "Transform this image into a watercolor painting..."
                    : "Create a variation of this image..."
                }
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                disabled={isLoading || isUpscaling}
              />
            </div>

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
          </>
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

            {/* Model default indicator */}
            {selectedModelData?.default_size && (
              <div className="text-xs text-muted-foreground">
                Model default: {selectedModelData.default_size}
              </div>
            )}
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
                    disabled={isLoading || isUpscaling}
                  />
                  <p className="text-xs text-muted-foreground">
                    Classifier-free guidance scale. Higher = more prompt adherence.
                  </p>
                </div>

                {/* Sample Steps */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="sample-steps">Sample Steps: {sampleSteps}</Label>
                  </div>
                  <Slider
                    id="sample-steps"
                    min={1}
                    max={100}
                    step={1}
                    value={[sampleSteps]}
                    onValueChange={(v) => setSampleSteps(v[0])}
                    disabled={isLoading || isUpscaling}
                  />
                  <p className="text-xs text-muted-foreground">
                    Number of denoising steps. More steps = higher quality but slower.
                  </p>
                </div>

                {/* Sampling Method */}
                <div className="space-y-2">
                  <Label htmlFor="sampling-method">Sampling Method</Label>
                  <Select value={samplingMethod} onValueChange={setSamplingMethod} disabled={isLoading || isUpscaling}>
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
                </div>

                {/* CLIP Skip */}
                <div className="space-y-2">
                  <Label htmlFor="clip-skip">CLIP Skip</Label>
                  <Select value={clipSkip} onValueChange={setClipSkip} disabled={isLoading || isUpscaling}>
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
              disabled={isLoading || isUpscaling}
            />
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading || isUpscaling || (currentModeConfig.needsImage && !sourceImage && !upscaleResult)}
          className="w-full"
          size="lg"
        >
          {(isLoading || isUpscaling) ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {isUpscaling ? "Upscaling..." : useQueue ? "Adding to Queue..." : "Generating..."}
            </>
          ) : (
            <>
              {mode === "upscale" ? (
                <>
                  <currentModeConfig.icon className="h-4 w-4 mr-2" />
                  Upscale Image
                </>
              ) : useQueue ? (
                <>
                  <List className="h-4 w-4 mr-2" />
                  Add to Queue
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
      </CardContent>
    </Card>
  );
}
