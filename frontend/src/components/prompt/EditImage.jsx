import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "../../lib/utils";
import { useHotkeys } from "react-hotkeys-hook";

/**
 * EditImage - Prompt input for image edit mode
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {string} props.sourceImagePreview - URL of source image preview
 * @param {function} props.onGenerate - Callback when generate is clicked
 */
export function EditImage({
  prompt = "",
  onPromptChange,
  isLoading = false,
  disabled = false,
  sourceImagePreview = null,
  onGenerate,
}) {
  const requiresPrompt = true;

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

  return (
    <>
      {/* Source image preview */}
      {sourceImagePreview && (
        <div className="mb-3">
          <img
            src={sourceImagePreview}
            alt="Source"
            className="w-16 h-16 object-cover rounded border border-border"
          />
        </div>
      )}

      {/* Prompt input */}
      <div className="relative mb-3">
        <Textarea
          placeholder="Transform this image into a watercolor painting..."
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

export default EditImage;
