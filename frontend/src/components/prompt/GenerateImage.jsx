import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * GenerateImage - Prompt input for image generation mode
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {boolean} props.showStrength - Whether to show strength indicator (for img2img)
 * @param {number} props.strength - Current strength value
 * @param {function} props.onGenerate - Callback when generate is clicked
 */
export function GenerateImage({
  prompt = "",
  onPromptChange,
  isLoading = false,
  disabled = false,
  showStrength = false,
  strength = 0.75,
  onGenerate,
}) {
  const requiresPrompt = true;

  return (
    <>
      {/* Prompt input */}
      <div className="relative mb-3">
        <Textarea
          placeholder={
            showStrength
              ? "Transform this image into a watercolor painting..."
              : "A serene landscape with rolling hills, a small cottage with a thatched roof, golden hour lighting..."
          }
          value={prompt}
          onChange={(e) => onPromptChange?.(e.target.value)}
          disabled={disabled || isLoading}
          className="min-h-[80px] pr-4 resize-none bg-background"
          rows={3}
          data-testid="prompt-input"
        />
        {showStrength && (
          <div className="absolute bottom-2 right-2 text-xs text-muted-foreground bg-background px-2 py-1 rounded">
            Strength: {strength.toFixed(2)}
          </div>
        )}
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

export default GenerateImage;
