import { Textarea } from "../ui/textarea";
import { Button } from "../ui/button";
import { Sparkles, Loader2 } from "lucide-react";

/**
 * GenerateVideo - Prompt input for video generation mode
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {function} props.onGenerate - Callback when generate is clicked
 */
export function GenerateVideo({
  prompt = "",
  onPromptChange,
  isLoading = false,
  disabled = false,
  onGenerate,
}) {
  const requiresPrompt = true;

  return (
    <>
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
