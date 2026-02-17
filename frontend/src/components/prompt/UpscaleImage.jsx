import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Image as ImageIcon, Loader2, Upload, MinusCircle } from "lucide-react";
import { useRef, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * UpscaleImage - Prompt input for upscale mode
 * Includes image selection widget and upscaler selector
 *
 * @param {Object} props
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {string} props.sourceImagePreview - URL of source image preview
 * @param {File} props.sourceImage - Source image file object
 * @param {function} props.onGenerate - Callback when generate is clicked
 * @param {function} props.onFileSelect - Callback when file is selected
 * @param {function} props.onClearImage - Callback to clear the selected image
 * @param {Array} props.availableUpscalers - Available upscalers
 * @param {string} props.upscalerName - Selected upscaler name
 * @param {function} props.onUpscalerNameChange - Callback for upscaler name change
 */
export function UpscaleImage({
  isLoading = false,
  disabled = false,
  sourceImagePreview = null,
  sourceImage = null,
  onGenerate,
  onFileSelect,
  onClearImage,
  availableUpscalers = [],
  upscalerName = "",
  onUpscalerNameChange,
}) {
  const fileInputRef = useRef(null);

  const hasImage = !!sourceImagePreview;

  // Ctrl+Enter to upscale (when image is selected)
  useHotkeys(
    ['ctrl+enter', 'cmd+enter'],
    (e) => {
      e.preventDefault();
      if (!disabled && !isLoading && hasImage) {
        onGenerate?.();
      }
    },
    { enabled: !disabled && !isLoading && hasImage }
  );

  const handleUploadClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback((e) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect?.(file);
    }
  }, [onFileSelect]);

  const handleClearImage = useCallback((e) => {
    e.stopPropagation();
    onClearImage?.();
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, [onClearImage]);

  return (
    <>
      {/* Source image upload or preview */}
      <div className="mb-3">
        {hasImage ? (
          <div className="relative group">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <img
                src={sourceImagePreview}
                alt="Source"
                className="w-16 h-16 object-cover rounded border border-border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {sourceImage?.name || "Selected image"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Ready to upscale
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleClearImage}
                disabled={disabled || isLoading}
              >
                <MinusCircle className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex items-center gap-3 p-4 border border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors"
            onClick={handleUploadClick}
          >
            <div className="flex items-center justify-center w-10 h-10 bg-muted rounded-full">
              <Upload className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Select an image to upscale</p>
              <p className="text-xs text-muted-foreground">Click to browse or drag and drop</p>
            </div>
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
          disabled={disabled || isLoading}
        />
      </div>

      {/* Upscaler Selection - show when image is selected */}
      {hasImage && availableUpscalers.length > 0 && (
        <div className="mb-3 space-y-2">
          <Label htmlFor="upscaler">Upscaler</Label>
          <Select value={upscalerName} onValueChange={onUpscalerNameChange} disabled={disabled || isLoading}>
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

      {/* Generate button */}
      <div className="flex items-center justify-end">
        <Button
          onClick={onGenerate}
          disabled={disabled || isLoading || !hasImage}
          className="gap-2 px-6"
          data-testid="generate-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Upscaling...</span>
            </>
          ) : (
            <>
              <ImageIcon className="h-4 w-4" />
              Upscale
            </>
          )}
        </Button>
      </div>

      {/* Hint text */}
      {!hasImage && (
        <p className="text-xs text-muted-foreground mt-2 text-right">
          Supported formats: PNG, JPEG, WebP
        </p>
      )}
    </>
  );
}

export default UpscaleImage;
