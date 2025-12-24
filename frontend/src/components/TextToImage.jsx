import { useState, useEffect } from "react";
import { Wand2, Sparkles, List, ChevronDown, ChevronUp } from "lucide-react";
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

const SIZES = [
  { value: "256x256", label: "256 x 256" },
  { value: "512x512", label: "512 x 512" },
  { value: "768x768", label: "768 x 768" },
  { value: "1024x1024", label: "1024 x 1024" },
  { value: "1024x768", label: "1024 x 768 (Landscape)" },
  { value: "768x1024", label: "768 x 1024 (Portrait)" },
  { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
  { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
];

const QUALITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "hd", label: "HD" },
  { value: "standard", label: "Standard" },
];

const STYLE_OPTIONS = [
  { value: "vivid", label: "Vivid" },
  { value: "natural", label: "Natural" },
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

export function TextToImage({ onGenerated, settings, selectedModel, onModelChange }) {
  const { generateQueued, isLoading, result } = useImageGeneration();

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [n, setN] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [style, setStyle] = useState("vivid");
  const [seed, setSeed] = useState("");
  const [useQueue, setUseQueue] = useState(true);

  // SD.cpp Advanced Settings
  const [cfgScale, setCfgScale] = useState(2.5);
  const [samplingMethod, setSamplingMethod] = useState("euler");
  const [sampleSteps, setSampleSteps] = useState(20);
  const [clipSkip, setClipSkip] = useState("-1");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);

  // Apply settings when provided (from "Create More" button)
  useEffect(() => {
    if (settings) {
      if (settings.prompt) setPrompt(settings.prompt);
      if (settings.negative_prompt !== undefined) setNegativePrompt(settings.negative_prompt);
      if (settings.size) setSize(settings.size);
      if (settings.n) setN(settings.n);
      if (settings.quality) setQuality(settings.quality);
      if (settings.style) setStyle(settings.style);
      if (settings.seed) setSeed(settings.seed.toString());
    }
  }, [settings]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error("Please enter a prompt");
      return;
    }

    try {
      const params = {
        mode: 'generate',
        model: selectedModel || undefined, // Use selected model, undefined will use default
        prompt,
        negative_prompt: negativePrompt,
        size,
        n,
        quality,
        style,
        seed: seed || undefined, // Pass seed if provided
        // SD.cpp Advanced Settings
        cfg_scale: cfgScale,
        sampling_method: samplingMethod,
        sample_steps: sampleSteps,
        clip_skip: clipSkip,
      };

      if (useQueue) {
        await generateQueued(params);
        toast.success("Job added to queue! Check Queue & History for progress.");
      } else {
        await generateQueued(params);
        toast.success("Image generated successfully!");
        if (onGenerated) onGenerated();
      }
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Text to Image
        </CardTitle>
        <CardDescription>
          Generate images from text descriptions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model Selector */}
        <div className="space-y-2">
          <ModelSelector
            currentModel={selectedModel}
            onModelChange={onModelChange}
            className="w-full"
          />
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt *</Label>
          <Textarea
            id="prompt"
            placeholder="A serene landscape with rolling hills, a small cottage with a thatched roof, golden hour lighting..."
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
            placeholder="blurry, low quality, distorted, watermark..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            disabled={isLoading}
          />
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label htmlFor="size">Image Size</Label>
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

        {/* Number of Images */}
        <div className="space-y-2">
          <Label htmlFor="n">Number of Images: {n}</Label>
          <Slider
            id="n"
            min={1}
            max={10}
            step={1}
            value={[n]}
            onValueChange={(v) => setN(v[0])}
            disabled={isLoading}
          />
        </div>

        {/* Quality */}
        <div className="space-y-2">
          <Label htmlFor="quality">Quality</Label>
          <Select value={quality} onValueChange={setQuality} disabled={isLoading}>
            <SelectTrigger id="quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Style */}
        <div className="space-y-2">
          <Label htmlFor="style">Style</Label>
          <Select value={style} onValueChange={setStyle} disabled={isLoading}>
            <SelectTrigger id="style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_OPTIONS.map((s) => (
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

          <div className="space-y-2">
            <Label htmlFor="seed">Seed (optional, for reproducibility)</Label>
            <Input
              id="seed"
              type="number"
              placeholder="Leave empty for random seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Each generation uses a random seed. Set a seed to reproduce the same image.
            </p>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading}
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
                  Generate Image
                </>
              )}
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
