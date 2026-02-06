import { Label } from "../ui/label";
import { Slider } from "../ui/slider";

const UPSCALE_FACTORS = [2, 4, 8];

const RESIZE_MODES = [
  { value: 0, label: "By Factor", description: "Upscale by multiplier (e.g., 2x, 4x)" },
  { value: 1, label: "To Size", description: "Upscale to specific dimensions" },
];

/**
 * UpscaleSettings - Settings for upscale mode
 * Note: Image selection and upscaler selection are handled in the top form (UpscaleImage component)
 * Upscale results appear in the main gallery (UnifiedQueue), not as inline preview
 *
 * @param {Object} props
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
  upscaleFactor = 2,
  onUpscaleFactorChange,
  upscaleResizeMode = 0,
  onUpscaleResizeModeChange,
  upscaleTargetWidth = 1024,
  onUpscaleTargetWidthChange,
  upscaleTargetHeight = 1024,
  onUpscaleTargetHeightChange,
}) {
  return (
    <>
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
              className="w-full"
            />
          </div>
        </>
      )}
    </>
  );
}

export default UpscaleSettings;
