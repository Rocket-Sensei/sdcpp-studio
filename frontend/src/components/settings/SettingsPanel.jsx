import { useState, useEffect } from "react";
import {
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Video,
  Upload,
  MinusCircle,
} from "lucide-react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "../ui/sheet";
import { ImageCountSelector } from "./ImageCountSelector";
import { cn } from "../../lib/utils";

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
];

const MODES = [
  { value: "image", label: "Image", icon: ImageIcon, description: "Text to Image / Image to Image" },
  { value: "imgedit", label: "Edit", icon: ImageIcon, description: "Image Edit" },
  { value: "video", label: "Video", icon: Video, description: "Text/Image to Video" },
  { value: "upscale", label: "Upscale", icon: ImageIcon, description: "Upscale" },
];

/**
 * SettingsPanel - Generation settings in a side sheet
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the sheet is open
 * @param {function} props.onOpenChange - Callback when open state changes
 * @param {Object} props.settings - Current settings object
 * @param {function} props.onSettingsChange - Callback when settings change
 * @param {boolean} props.supportsNegativePrompt - Whether negative prompts are supported
 * @param {boolean} props.hasServerModeModel - Whether a server mode model is selected
 * @param {number} props.serverModeSteps - Fixed steps for server mode models
 * @param {boolean} props.multipleModelsSelected - Whether multiple models are selected
 * @param {boolean} props.disabled - Whether settings are disabled
 */
export function SettingsPanel({
  open,
  onOpenChange,
  settings = {},
  onSettingsChange,
  supportsNegativePrompt = false,
  hasServerModeModel = false,
  serverModeSteps = null,
  multipleModelsSelected = false,
  disabled = false,
}) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Destructure settings with defaults
  const {
    mode = "image",
    negativePrompt = "",
    width = 1024,
    height = 1024,
    n = 1,
    seed = "",
    strength = 0.75,
    cfgScale = 2.5,
    samplingMethod = "euler",
    sampleSteps = 20,
    clipSkip = "-1",
    useQueue = true,
    upscaleAfterGeneration = false,
  } = settings;

  // Update a single setting
  const updateSetting = (key, value) => {
    onSettingsChange?.({ ...settings, [key]: value });
  };

  const currentModeConfig = MODES.find((m) => m.value === mode);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[400px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>Generation Settings</SheetTitle>
        </SheetHeader>

        <div className="space-y-6">
          {/* Mode Selector */}
          <div className="space-y-2">
            <Label>Generation Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((modeOption) => {
                const Icon = modeOption.icon;
                return (
                  <button
                    key={modeOption.value}
                    onClick={() => updateSetting("mode", modeOption.value)}
                    disabled={disabled}
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

          {/* Negative Prompt */}
          {supportsNegativePrompt && mode !== "upscale" && (
            <div className="space-y-2">
              <Label htmlFor="negative-prompt">Negative Prompt</Label>
              <Textarea
                id="negative-prompt"
                placeholder="blurry, low quality, distorted, watermark..."
                value={negativePrompt}
                onChange={(e) => updateSetting("negativePrompt", e.target.value)}
                rows={2}
                disabled={disabled}
              />
            </div>
          )}

          {/* Image Size */}
          {mode !== "upscale" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Image Size</Label>
                <span className="text-sm text-muted-foreground">
                  {width} x {height}
                </span>
              </div>

              {/* Width Slider */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Width</span>
                  <span className="text-xs font-mono">{width}px</span>
                </div>
                <Slider
                  value={[width]}
                  onValueChange={(v) => updateSetting("width", v[0])}
                  min={100}
                  max={2048}
                  step={8}
                  disabled={disabled}
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
                  onValueChange={(v) => updateSetting("height", v[0])}
                  min={100}
                  max={2048}
                  step={8}
                  disabled={disabled}
                />
              </div>

              {/* Preset Buttons */}
              <div className="flex flex-wrap gap-2">
                {SIZE_PRESETS.map((preset) => (
                  <button
                    key={`${preset.width}x${preset.height}`}
                    onClick={() => {
                      updateSetting("width", preset.width);
                      updateSetting("height", preset.height);
                    }}
                    disabled={disabled}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded border transition-colors",
                      width === preset.width && height === preset.height
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Number of Images */}
          <div className="space-y-2">
            <Label>Number of Images</Label>
            <ImageCountSelector
              value={n}
              onChange={(v) => updateSetting("n", v)}
              disabled={disabled}
            />
            <p className="text-xs text-muted-foreground">
              Generate multiple images with different random seeds
            </p>
          </div>

          {/* Strength for img2img */}
          {mode === "image" && settings.hasSourceImage && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Strength</Label>
                <span className="text-sm text-muted-foreground">
                  {strength.toFixed(2)}
                </span>
              </div>
              <Slider
                min={0}
                max={1}
                step={0.01}
                value={[strength]}
                onValueChange={(v) => updateSetting("strength", v[0])}
                disabled={disabled}
              />
              <p className="text-xs text-muted-foreground">
                How much to transform the source image
              </p>
            </div>
          )}

          {/* Seed */}
          <div className="space-y-2">
            <Label htmlFor="seed">Seed (optional)</Label>
            <Input
              id="seed"
              type="number"
              placeholder="Leave empty for random"
              value={seed}
              onChange={(e) => updateSetting("seed", e.target.value)}
              disabled={n > 1 || disabled}
            />
            {n > 1 && (
              <p className="text-xs text-muted-foreground">
                Seed is disabled when generating multiple images
              </p>
            )}
          </div>

          {/* Queue Mode */}
          <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
            <div className="space-y-0.5">
              <Label htmlFor="queue-mode">Queue Mode</Label>
              <p className="text-xs text-muted-foreground">
                Add to queue and continue working
              </p>
            </div>
            <Switch
              id="queue-mode"
              checked={useQueue}
              onCheckedChange={(v) => updateSetting("useQueue", v)}
              disabled={disabled}
            />
          </div>

          {/* Advanced Settings */}
          {mode !== "upscale" && (
            <div className="space-y-4 pt-4 border-t">
              <Button
                type="button"
                variant="ghost"
                className="w-full flex items-center justify-between p-0 h-auto"
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span className="text-sm font-medium">Advanced Settings</span>
                {showAdvanced ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>

              {showAdvanced && (
                <div className="space-y-4 pt-2">
                  {/* CFG Scale */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>CFG Scale</Label>
                      <span className="text-sm text-muted-foreground">
                        {cfgScale.toFixed(1)}
                      </span>
                    </div>
                    <Slider
                      min={1}
                      max={20}
                      step={0.5}
                      value={[cfgScale]}
                      onValueChange={(v) => updateSetting("cfgScale", v[0])}
                      disabled={disabled || multipleModelsSelected}
                    />
                    {multipleModelsSelected && (
                      <p className="text-xs text-muted-foreground">
                        Using default for each model
                      </p>
                    )}
                  </div>

                  {/* Sample Steps */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Sample Steps</Label>
                      <span className="text-sm text-muted-foreground">
                        {hasServerModeModel && serverModeSteps !== null
                          ? serverModeSteps
                          : sampleSteps}
                      </span>
                    </div>
                    <Slider
                      min={1}
                      max={100}
                      step={1}
                      value={[
                        hasServerModeModel && serverModeSteps !== null
                          ? serverModeSteps
                          : sampleSteps,
                      ]}
                      onValueChange={(v) => updateSetting("sampleSteps", v[0])}
                      disabled={disabled || hasServerModeModel || multipleModelsSelected}
                    />
                    {hasServerModeModel && serverModeSteps !== null && (
                      <p className="text-xs text-muted-foreground">
                        Steps fixed at {serverModeSteps} for server mode
                      </p>
                    )}
                  </div>

                  {/* Sampling Method */}
                  <div className="space-y-2">
                    <Label>Sampling Method</Label>
                    <Select
                      value={samplingMethod}
                      onValueChange={(v) => updateSetting("samplingMethod", v)}
                      disabled={disabled || multipleModelsSelected}
                    >
                      <SelectTrigger>
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
                    <Label>CLIP Skip</Label>
                    <Select
                      value={clipSkip}
                      onValueChange={(v) => updateSetting("clipSkip", v)}
                      disabled={disabled || multipleModelsSelected}
                    >
                      <SelectTrigger>
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

          {/* Upscale After Generation */}
          {mode !== "upscale" && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div className="space-y-0.5">
                <Label htmlFor="upscale-after">Upscale After Generation</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically upscale generated images
                </p>
              </div>
              <Switch
                id="upscale-after"
                checked={upscaleAfterGeneration}
                onCheckedChange={(v) => updateSetting("upscaleAfterGeneration", v)}
                disabled={disabled}
              />
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default SettingsPanel;
