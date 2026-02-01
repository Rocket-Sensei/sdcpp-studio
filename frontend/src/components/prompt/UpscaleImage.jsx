import { Button } from "../ui/button";
import { Image as ImageIcon, Loader2 } from "lucide-react";

/**
 * UpscaleImage - Prompt input for upscale mode
 * Note: Upscale mode does NOT require a prompt input
 *
 * @param {Object} props
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {string} props.sourceImagePreview - URL of source image preview
 * @param {function} props.onGenerate - Callback when generate is clicked
 * @param {function} props.onImageUpload - Callback to trigger image upload
 */
export function UpscaleImage({
  isLoading = false,
  disabled = false,
  sourceImagePreview = null,
  onGenerate,
  onImageUpload,
}) {
  const hasImage = !!sourceImagePreview;

  return (
    <>
      {/* Source image preview or upload prompt */}
      <div className="mb-3">
        {hasImage ? (
          <div className="flex items-center gap-3">
            <img
              src={sourceImagePreview}
              alt="Source"
              className="w-16 h-16 object-cover rounded border border-border"
            />
            <span className="text-sm text-muted-foreground">Image ready for upscaling</span>
          </div>
        ) : (
          <div
            className="flex items-center gap-2 p-3 border border-dashed rounded-lg cursor-pointer hover:border-primary transition-colors"
            onClick={onImageUpload}
          >
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Select an image to upscale</span>
          </div>
        )}
      </div>

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
      <p className="text-xs text-muted-foreground mt-2 text-right">
        Select an image above to upscale
      </p>
    </>
  );
}

export default UpscaleImage;
