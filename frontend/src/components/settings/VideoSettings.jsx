import { Label } from "../ui/label";
import { Slider } from "../ui/slider";
import { Switch } from "../ui/switch";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Badge } from "../ui/badge";
import { Upload, MinusCircle } from "lucide-react";
import { useRef, useCallback } from "react";

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
 * VideoSettings - Settings for video generation mode
 * Note: NO duplicate prompt input - prompt is handled in PromptBar/GenerateVideo
 * Note: Start frame upload is now in PromptBar/GenerateVideo
 *
 * @param {Object} props
 * @param {Object} props.endImage - End frame image file
 * @param {string} props.endImagePreview - URL of end frame image preview
 * @param {function} props.onEndImageFileSelect - Callback for end image file selection
 * @param {function} props.onClearEndImage - Callback for clearing end image
 * @param {function} props.endImageInputRef - Ref for end image input element
 * @param {number} props.videoFrames - Number of video frames
 * @param {function} props.onVideoFramesChange - Callback for video frames change
 * @param {number} props.videoFps - Video FPS
 * @param {function} props.onVideoFpsChange - Callback for video FPS change
 * @param {boolean} props.flowShift - Whether flow shift is enabled
 * @param {function} props.onFlowShiftChange - Callback for flow shift toggle
 * @param {number} props.flowShiftValue - Flow shift value
 * @param {function} props.onFlowShiftValueChange - Callback for flow shift value change
 * @param {number} props.width - Image width
 * @param {function} props.onWidthChange - Callback for width change
 * @param {number} props.height - Image height
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
export function VideoSettings({
  endImage = null,
  endImagePreview = null,
  onEndImageFileSelect,
  onClearEndImage,
  endImageInputRef,
  videoFrames = 33,
  onVideoFramesChange,
  videoFps = 24,
  onVideoFpsChange,
  flowShift = false,
  onFlowShiftChange,
  flowShiftValue = 3.0,
  onFlowShiftValueChange,
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
  const size = `${width}x${height}`;

  return (
    <>
      {/* Video Frames */}
      <div className="space-y-2">
        <Label htmlFor="video-frames">Video Frames: {videoFrames}</Label>
        <Slider
          id="video-frames"
          min={1}
          max={120}
          step={1}
          value={[videoFrames]}
          onValueChange={(v) => onVideoFramesChange?.(v[0])}
          disabled={isLoading || isUpscaling}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Number of frames in the video (more frames = longer video)
        </p>
      </div>

      {/* Video FPS */}
      <div className="space-y-2">
        <Label htmlFor="video-fps">Video FPS: {videoFps}</Label>
        <Slider
          id="video-fps"
          min={1}
          max={60}
          step={1}
          value={[videoFps]}
          onValueChange={(v) => onVideoFpsChange?.(v[0])}
          disabled={isLoading || isUpscaling}
          className="w-full"
        />
        <p className="text-xs text-muted-foreground">
          Frames per second for the output video
        </p>
      </div>

      {/* Flow Shift */}
      <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
        <div className="flex-1">
          <Label htmlFor="flow-shift" className="cursor-pointer">
            Flow Shift
          </Label>
          <p className="text-xs text-muted-foreground">
            Enable flow shift for improved motion consistency
          </p>
        </div>
        <Switch
          id="flow-shift"
          checked={flowShift}
          onCheckedChange={onFlowShiftChange}
          disabled={isLoading || isUpscaling}
        />
      </div>

      {flowShift && (
        <div className="space-y-2">
          <Label htmlFor="flow-shift-value">Flow Shift Value: {flowShiftValue.toFixed(1)}</Label>
          <Slider
            id="flow-shift-value"
            min={0}
            max={10}
            step={0.1}
            value={[flowShiftValue]}
            onValueChange={(v) => onFlowShiftValueChange?.(v[0])}
            disabled={isLoading || isUpscaling}
            className="w-full"
          />
        </div>
      )}

      {/* End Frame Image (Optional) */}
      <div className="space-y-2">
        <Label>End Frame Image (Optional)</Label>
        <div className="flex items-center gap-4">
          {endImagePreview ? (
            <div className="relative group">
              <img
                src={endImagePreview}
                alt="End frame"
                className="w-32 h-32 object-cover rounded-lg border"
              />
              <button
                type="button"
                className="absolute -top-2 -right-2 h-6 w-6 bg-destructive text-destructive-foreground rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                onClick={onClearEndImage}
                disabled={isLoading || isUpscaling}
              >
                <MinusCircle className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div
              className="w-32 h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
              onClick={() => endImageInputRef?.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Upload</span>
            </div>
          )}
          <input
            ref={endImageInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onEndImageFileSelect}
            className="hidden"
            disabled={isLoading || isUpscaling}
          />
        </div>
      </div>

      {/* Size Settings */}
      <div className="space-y-2">
        <Label>Size: {size}</Label>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
          {SIZE_PRESETS.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                onWidthChange?.(preset.width);
                onHeightChange?.(preset.height);
              }}
              className={`text-xs p-2 rounded border transition-colors ${
                size === preset.label
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
              disabled={isLoading || isUpscaling}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

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

export default VideoSettings;
