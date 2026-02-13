import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Video, Sparkles, Loader2, Upload, MinusCircle } from "lucide-react";
import { useHotkeys } from "react-hotkeys-hook";
import { useRef, useCallback } from "react";

/**
 * GenerateVideo - Prompt input for video generation mode
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {string} props.sourceImagePreview - URL of source image preview
 * @param {File} props.sourceImage - Source image file object
 * @param {function} props.onGenerate - Callback when generate is clicked
 * @param {function} props.onFileSelect - Callback when file is selected
 * @param {function} props.onClearImage - Callback to clear selected image
 */
export function GenerateVideo({
  prompt = "",
  onPromptChange,
  isLoading = false,
  disabled = false,
  sourceImagePreview = null,
  sourceImage = null,
  onGenerate,
  onFileSelect,
  onClearImage,
}) {
  const fileInputRef = useRef(null);
  const requiresPrompt = false; // Prompt is optional for video mode
  const hasImage = !!sourceImagePreview;

  // Ctrl+Enter to generate
  useHotkeys(
    ['ctrl+enter', 'cmd+enter'],
    (e) => {
      e.preventDefault();
      if (!disabled && !isLoading && prompt.trim()) {
        onGenerate?.();
      }
    },
    { enabled: !disabled && !isLoading && prompt.trim() !== '', enableOnFormTags: true }
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
      {/* Start frame image upload or preview */}
      <div className="mb-3">
        {hasImage ? (
          <div className="relative group">
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <img
                src={sourceImagePreview}
                alt="Start frame"
                className="w-16 h-16 object-cover rounded border border-border"
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {sourceImage?.name || "Selected image"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Start frame (optional)
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
              <p className="text-sm font-medium">Select a start frame (optional)</p>
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

      {/* Prompt input - NO duplicate prompt in video settings */}
      <div className="relative mb-3">
        <Textarea
          placeholder="A lovely cat running through a field of flowers..."
          value={prompt}
          onChange={(e) => onPromptChange?.(e.target.value)}
          disabled={disabled || isLoading}
          className="min-h-[80px] pr-4 resize-none bg-background"
          rows={3}
          data-testid="prompt-input"
        />
      </div>

      {/* Generate button */}
      <div className="flex items-center justify-end">
        <Button
          onClick={onGenerate}
          disabled={disabled || isLoading || requiresPrompt && !prompt.trim()}
          className="gap-2 px-6"
          data-testid="generate-button"
        >
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="hidden sm:inline">Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate
            </>
          )}
        </Button>
      </div>

      {/* Hint text */}
      <p className="text-xs text-muted-foreground mt-2 text-right">
        Press Ctrl+Enter to generate
      </p>
    </>
  );
}

export default GenerateVideo;
