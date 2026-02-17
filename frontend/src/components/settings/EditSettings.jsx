import { Label } from "../ui/label";
import { Textarea } from "../ui/textarea";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import ImageSettings from "./ImageSettings";

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

/**
 * EditSettings - Settings for image edit mode
 * Note: Source image upload is now in PromptBar/EditImage
 *
 * @param {Object} props
 * @param {string} props.negativePrompt - Negative prompt text
 * @param {function} props.onNegativePromptChange - Callback for negative prompt change
 * @param {boolean} props.supportsNegativePrompt - Whether negative prompt is supported
 * @param {number} props.width - Image width
 * @param {number} props.height - Image height
 * @param {function} props.onWidthChange - Callback for width change
 * @param {function} props.onHeightChange - Callback for height change
 * @param {number} props.cfgScale - CFG scale value
 * @param {function} props.onCfgScaleChange - Callback for CFG scale change
 * @param {string} props.samplingMethod - Sampling method
 * @param {function} props.onSamplingMethodChange - Callback for sampling method change
 * @param {number} props.sampleSteps - Sample steps
 * @param {function} props.onSampleStepsChange - Callback for sample steps change
 * @param {string} props.clipSkip - Clip skip value
 * @param {function} props.onClipSkipChange - Callback for clip skip change
 * @param {boolean} props.hasServerModeModel - Whether server mode model is selected
 * @param {number} props.serverModeSteps - Server mode steps value
 * @param {number} props.seed - Seed value
 * @param {function} props.onSeedChange - Callback for seed change
 * @param {number} props.n - Number of images
 * @param {function} props.onNChange - Callback for n change
 * @param {boolean} props.useQueue - Whether to use queue mode
 * @param {function} props.onUseQueueChange - Callback for queue mode change
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.isUpscaling - Whether upscaling is in progress
 * @param {boolean} props.selectedModelsMultiple - Whether multiple models are selected
 */
export function EditSettings({
  negativePrompt = "",
  onNegativePromptChange,
  supportsNegativePrompt = true,
  width = 512,
  onWidthChange,
  height = 512,
  onHeightChange,
  cfgScale = 2.5,
  onCfgScaleChange,
  samplingMethod = "euler",
  onSamplingMethodChange,
  sampleSteps = 20,
  onSampleStepsChange,
  clipSkip = "-1",
  onClipSkipChange,
  hasServerModeModel = false,
  serverModeSteps = null,
  seed = "",
  onSeedChange,
  n = 1,
  onNChange,
  useQueue = true,
  onUseQueueChange,
  isLoading = false,
  isUpscaling = false,
  selectedModelsMultiple = false,
}) {
  return (
    <>
      {/* Negative Prompt - Only show if supported */}
      {supportsNegativePrompt && (
        <div className="space-y-2">
          <Label htmlFor="negative-prompt">Negative Prompt</Label>
          <Textarea
            id="negative-prompt"
            placeholder="blurry, low quality, distorted, watermark..."
            value={negativePrompt}
            onChange={(e) => onNegativePromptChange?.(e.target.value)}
            rows={2}
            disabled={isLoading || isUpscaling}
          />
        </div>
      )}

      {/* Advanced Settings (CFG, Sampling, Steps, Clip Skip) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label>Advanced Settings</Label>
        </div>

        {/* CFG Scale */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="cfg-scale">CFG Scale: {cfgScale}</Label>
            {selectedModelsMultiple && (
              <Badge variant="secondary" className="text-xs">
                Multi-model
              </Badge>
            )}
          </div>
          <Slider
            id="cfg-scale"
            min={0}
            max={20}
            step={0.1}
            value={[cfgScale]}
            onValueChange={(v) => onCfgScaleChange?.(v[0])}
            disabled={isLoading || isUpscaling || selectedModelsMultiple}
            className="w-full"
          />
          {selectedModelsMultiple && (
            <p className="text-xs text-muted-foreground">
              CFG scale must be set individually for each model
            </p>
          )}
        </div>

        {/* Sampling Method */}
        <div className="space-y-2">
          <Label htmlFor="sampling-method">Sampling Method</Label>
          <Select value={samplingMethod} onValueChange={onSamplingMethodChange} disabled={isLoading || isUpscaling || selectedModelsMultiple}>
            <SelectTrigger id="sampling-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SAMPLING_METHODS.map((method) => (
                <SelectItem key={method.value} value={method.value}>
                  {method.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedModelsMultiple && (
            <p className="text-xs text-muted-foreground">
              Sampling method must be set individually for each model
            </p>
          )}
        </div>

        {/* Sample Steps */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="sample-steps">Sample Steps: {sampleSteps}</Label>
            {hasServerModeModel && serverModeSteps && (
              <Badge variant="outline" className="text-xs">
                Server: {serverModeSteps}
              </Badge>
            )}
          </div>
          <Slider
            id="sample-steps"
            min={1}
            max={50}
            step={1}
            value={[sampleSteps]}
            onValueChange={(v) => onSampleStepsChange?.(v[0])}
            disabled={isLoading || isUpscaling || hasServerModeModel || selectedModelsMultiple}
            className="w-full"
          />
          {hasServerModeModel && (
            <p className="text-xs text-muted-foreground">
              Steps are fixed for server mode models (set in model configuration)
            </p>
          )}
          {selectedModelsMultiple && (
            <p className="text-xs text-muted-foreground">
              Sample steps must be set individually for each model
            </p>
          )}
        </div>

        {/* Clip Skip */}
        <div className="space-y-2">
          <Label htmlFor="clip-skip">Clip Skip</Label>
          <Select value={clipSkip} onValueChange={onClipSkipChange} disabled={isLoading || isUpscaling || selectedModelsMultiple}>
            <SelectTrigger id="clip-skip">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CLIP_SKIP_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedModelsMultiple && (
            <p className="text-xs text-muted-foreground">
              Clip skip must be set individually for each model
            </p>
          )}
        </div>
      </div>

      {/* Common Settings */}
      <div className="space-y-4 pt-4 border-t">
        {/* Queue Mode */}
        <div className="flex items-center justify-between">
          <div>
            <Label htmlFor="queue-mode">Queue Mode</Label>
            <p className="text-xs text-muted-foreground">
              Add to queue and continue working
            </p>
          </div>
          <Switch
            id="queue-mode"
            checked={useQueue}
            onCheckedChange={onUseQueueChange}
            disabled={isLoading || isUpscaling}
          />
        </div>

        {/* Seed */}
        <div className="space-y-2">
          <Label htmlFor="seed">Seed (optional)</Label>
          <Input
            id="seed"
            type="number"
            placeholder="Leave empty for random"
            value={seed}
            onChange={(e) => onSeedChange?.(e.target.value)}
            disabled={n > 1 || isLoading || isUpscaling}
          />
          {n > 1 && (
            <p className="text-xs text-muted-foreground">
              Seed is disabled when generating multiple images (random seeds will be used)
            </p>
          )}
        </div>

        {/* Number of Images */}
        <div className="space-y-2">
          <Label htmlFor="num-images">Number of Images: {n}</Label>
          <Slider
            id="num-images"
            min={1}
            max={10}
            step={1}
            value={[n]}
            onValueChange={(v) => onNChange?.(v[0])}
            disabled={isLoading || isUpscaling}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Generate multiple images with different random seeds
          </p>
        </div>
      </div>
    </>
  );
}

export default EditSettings;
