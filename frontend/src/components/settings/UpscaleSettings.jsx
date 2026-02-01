import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Slider } from "../ui/slider";
import { Upload, MinusCircle, Download } from "lucide-react";
import { Button } from "../ui/button";

const UPSCALE_FACTORS = [2, 4, 8];

const RESIZE_MODES = [
  { value: 0, label: "By Factor", description: "Upscale by multiplier (e.g., 2x, 4x)" },
  { value: 1, label: "To Size", description: "Upscale to specific dimensions" },
];

/**
 * UpscaleSettings - Settings for upscale mode
 *
 * @param {Object} props
 * @param {Object} props.sourceImage - Source image file
 * @param {string} props.sourceImagePreview - URL of source image preview
 * @param {string} props.upscaleResult - URL of upscaled result
 * @param {function} props.onFileSelect - Callback for file selection
 * @param {function} props.onClearImage - Callback for clearing image
 * @param {function} props.onDownloadUpscaled - Callback for downloading upscaled image
 * @param {function} props.fileInputRef - Ref for file input element
 * @param {boolean} props.isUpscaling - Whether upscaling is in progress
 * @param {Array} props.availableUpscalers - Available upscalers
 * @param {string} props.upscalerName - Selected upscaler name
 * @param {function} props.onUpscalerNameChange - Callback for upscaler name change
 * @param {number} props.upscaleFactor - Upscale factor
 * @param {function} props.onUpscaleFactorChange - Callback for upscale factor change
 * @param {number} props.upscaleResizeMode - Resize mode (0=by factor, 1=to size)
 * @param {function} props.onUpscaleResizeModeChange - Callback for resize mode change
 * @param {number} props.upscaleTargetWidth - Target width for resize mode
 * @param {function} props.onUpscaleTargetWidthChange - Callback for target width change
 * @param {number} props.upscaleTargetHeight - Target height for resize mode
 * @param {function} props.onUpscaleTargetHeightChange - Callback for target height change
 */
export function UpscaleSettings({
  sourceImage = null,
  sourceImagePreview = null,
  upscaleResult = null,
  onFileSelect,
  onClearImage,
  onDownloadUpscaled,
  fileInputRef,
  isUpscaling = false,
  availableUpscalers = [],
  upscalerName = "",
  onUpscalerNameChange,
  upscaleFactor = 2,
  onUpscaleFactorChange,
  upscaleResizeMode = 0,
  onUpscaleResizeModeChange,
  upscaleTargetWidth = 1024,
  onUpscaleTargetWidthChange,
  onUpscaleTargetHeightChange = 1024,
}) {
  return (
    <>
      {/* Source Image Upload - Required for upscale mode */}
      <div className="space-y-2">
        <Label>Source Image *</Label>
        <div className="flex items-center gap-4">
          {(upscaleResult || sourceImagePreview) ? (
            <div className="relative group">
              <img
                src={upscaleResult || sourceImagePreview}
                alt="Source"
                className="object-cover rounded-lg border w-full max-w-md"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={onClearImage}
                disabled={isUpscaling}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
              {upscaleResult && (
                <Button
                  onClick={onDownloadUpscaled}
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
              onClick={() => fileInputRef?.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground mb-1" />
              <span className="text-xs text-muted-foreground">Upload</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={onFileSelect}
            className="hidden"
            disabled={isUpscaling}
          />
        </div>
      </div>

      {/* Upscaler Selection */}
      {availableUpscalers.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="upscaler">Upscaler</Label>
          <Select value={upscalerName} onValueChange={onUpscalerNameChange} disabled={isUpscaling}>
            <SelectTrigger id="upscaler">
              <SelectValue placeholder="Select upscaler" />
            </SelectTrigger>
            <SelectContent>
              {availableUpscalers.map((upscaler) => (
                <SelectItem key={upscaler.name} value={upscaler.name}>
                  {upscaler.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Resize Mode */}
      <div className="space-y-2">
        <Label>Resize Mode</Label>
        <div className="grid grid-cols-2 gap-2">
          {RESIZE_MODES.map((mode) => (
            <button
              key={mode.value}
              onClick={() => onUpscaleResizeModeChange?.(mode.value)}
              className={`p-3 rounded-lg border text-sm transition-colors ${
                upscaleResizeMode === mode.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border hover:border-primary/50"
              }`}
              disabled={isUpscaling}
            >
              <div className="font-medium">{mode.label}</div>
              <div className="text-xs text-muted-foreground">{mode.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Upscale Factor (when resize mode is "By Factor") */}
      {upscaleResizeMode === 0 && (
        <div className="space-y-2">
          <Label>Upscale Factor: {upscaleFactor}x</Label>
          <div className="grid grid-cols-3 gap-2">
            {UPSCALE_FACTORS.map((factor) => (
              <button
                key={factor}
                onClick={() => onUpscaleFactorChange?.(factor)}
                className={`p-3 rounded-lg border text-center transition-colors ${
                  upscaleFactor === factor
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                }`}
                disabled={isUpscaling}
              >
                {factor}x
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Target Size (when resize mode is "To Size") */}
      {upscaleResizeMode === 1 && (
        <>
          <div className="space-y-2">
            <Label htmlFor="target-width">Target Width: {upscaleTargetWidth}px</Label>
            <Slider
              id="target-width"
              min={256}
              max={4096}
              step={64}
              value={[upscaleTargetWidth]}
              onValueChange={(v) => onUpscaleTargetWidthChange?.(v[0])}
              disabled={isUpscaling}
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-height">Target Height: {upscaleTargetHeight}px</Label>
            <Slider
              id="target-height"
              min={256}
              max={4096}
              step={64}
              value={[upscaleTargetHeight]}
              onValueChange={(v) => onUpscaleTargetHeightChange?.(v[0])}
              disabled={isUpscaling}
              className="w-full"
            />
          </div>
        </>
      )}
    </>
  );
}

export default UpscaleSettings;
