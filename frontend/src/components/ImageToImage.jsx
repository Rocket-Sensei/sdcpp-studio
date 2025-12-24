import { useState, useRef, useMemo } from "react";
import { Upload, Image as ImageIcon, Sparkles, X, List, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Slider } from "./ui/slider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useToast } from "../hooks/useToast";
import { ModelSelector } from "./ModelSelector";

const SIZES = [
  { value: "256x256", label: "256 x 256" },
  { value: "512x512", label: "512 x 512" },
  { value: "768x768", label: "768 x 768" },
  { value: "1024x1024", label: "1024 x 1024" },
];

const MODE_OPTIONS = [
  { value: "edit", label: "Image Edit (img2img)" },
  { value: "variation", label: "Variation" },
];

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

export function ImageToImage({ onGenerated, selectedModel, onModelChange }) {
  const { addToast } = useToast();
  const { generateQueued, isLoading } = useImageGeneration();

  const fileInputRef = useRef(null);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [mode, setMode] = useState("edit");
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImagePreview, setSourceImagePreview] = useState(null);
  const [useQueue, setUseQueue] = useState(true);

  // SD.cpp Advanced Settings
  const [cfgScale, setCfgScale] = useState(2.5);
  const [samplingMethod, setSamplingMethod] = useState("euler");
  const [sampleSteps, setSampleSteps] = useState(20);
  const [clipSkip, setClipSkip] = useState("-1");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Memoize filterCapabilities to prevent unnecessary ModelSelector re-renders
  const filterCapabilities = useMemo(() => ['image-to-image'], []);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast("Error", "Please select an image file", "destructive");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      addToast("Error", "Image size must be less than 50MB", "destructive");
      return;
    }

    setSourceImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setSourceImage(null);
    setSourceImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast("Error", "Please enter a prompt", "destructive");
      return;
    }

    if (!sourceImage) {
      addToast("Error", "Please select a source image", "destructive");
      return;
    }

    try {
      await generateQueued({
        mode,
        model: selectedModel || undefined, // Use selected model, undefined will use default
        prompt,
        negative_prompt: negativePrompt,
        size,
        image: sourceImage,
        // SD.cpp Advanced Settings
        cfg_scale: cfgScale,
        sampling_method: samplingMethod,
        sample_steps: sampleSteps,
        clip_skip: clipSkip,
      });

      addToast("Success", `Job added to queue! Check the Queue tab for progress.`);
      if (onGenerated) onGenerated();
    } catch (err) {
      addToast("Error", err.message, "destructive");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Image to Image
        </CardTitle>
        <CardDescription>
          Edit images or create variations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model Selector */}
        <div className="space-y-2">
          <ModelSelector
            currentModel={selectedModel}
            onModelChange={onModelChange}
            className="w-full"
            filterCapabilities={filterCapabilities}
          />
        </div>

        {/* Source Image Upload */}
        <div className="space-y-2">
          <Label>Source Image *</Label>
          <div className="flex items-center gap-4">
            {sourceImagePreview ? (
              <div className="relative group">
                <img
                  src={sourceImagePreview}
                  alt="Source"
                  className="w-32 h-32 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleClearImage}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
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
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Mode Selection */}
        <div className="space-y-2">
          <Label htmlFor="mode">Mode</Label>
          <Select value={mode} onValueChange={setMode} disabled={isLoading}>
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt *</Label>
          <Textarea
            id="prompt"
            placeholder={mode === "edit"
              ? "Transform this image into a watercolor painting..."
              : "Create a variation of this image..."}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            disabled={isLoading}
          />
        </div>

        {/* Negative Prompt */}
        <div className="space-y-2">
          <Label htmlFor="negative-prompt">Negative Prompt</Label>
          <Textarea
            id="negative-prompt"
            placeholder="blurry, low quality, distorted..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            disabled={isLoading}
          />
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label htmlFor="size">Output Size</Label>
          <Select value={size} onValueChange={setSize} disabled={isLoading}>
            <SelectTrigger id="size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* SD.cpp Advanced Settings */}
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
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Classifier-free guidance scale. Higher = more prompt adherence, lower = more creativity.
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
                  disabled={isLoading}
                />
                <p className="text-xs text-muted-foreground">
                  Number of denoising steps. More steps = higher quality but slower.
                </p>
              </div>

              {/* Sampling Method */}
              <div className="space-y-2">
                <Label htmlFor="sampling-method">Sampling Method</Label>
                <Select value={samplingMethod} onValueChange={setSamplingMethod} disabled={isLoading}>
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
                <p className="text-xs text-muted-foreground">
                  The sampling algorithm. Euler is fast and reliable.
                </p>
              </div>

              {/* CLIP Skip */}
              <div className="space-y-2">
                <Label htmlFor="clip-skip">CLIP Skip</Label>
                <Select value={clipSkip} onValueChange={setClipSkip} disabled={isLoading}>
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
                <p className="text-xs text-muted-foreground">
                  Number of CLIP layers to skip. Can affect style and detail.
                </p>
              </div>
            </div>
          )}
        </div>

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
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading || !sourceImage}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Adding to Queue...
            </>
          ) : (
            <>
              {useQueue ? (
                <>
                  <List className="h-4 w-4 mr-2" />
                  Add to Queue
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  {mode === "edit" ? "Edit Image" : "Create Variation"}
                </>
              )}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
