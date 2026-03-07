import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Send } from "lucide-react";

/**
 * GenerateText - Text generation component for LLM chat/completions
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the input is disabled
 * @param {function} props.onGenerate - Callback when generate is clicked
 */
export function GenerateText({
  prompt = "",
  onPromptChange,
  isLoading = false,
  disabled = false,
  onGenerate,
}) {
  return (
    <div className="flex flex-col gap-3">
      <Textarea
        placeholder="Enter your prompt for text generation..."
        value={prompt}
        onChange={(e) => onPromptChange?.(e.target.value)}
        disabled={disabled || isLoading}
        className="min-h-[100px] resize-none"
        data-testid="text-prompt-input"
      />
      
      <div className="flex justify-end">
        <Button
          onClick={onGenerate}
          disabled={disabled || isLoading || !prompt.trim()}
          data-testid="generate-text-button"
        >
          <Send className="h-4 w-4 mr-2" />
          {isLoading ? "Generating..." : "Generate"}
        </Button>
      </div>
    </div>
  );
}

export default GenerateText;
