import { useState, useRef } from "react";
import {
  Sparkles,
  Settings2,
  ChevronDown,
  Loader2,
  ImagePlus,
  Upload,
  X,
} from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import { toast } from "sonner";

/**
 * PromptBar - Full-width prompt input with generate button
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {Object} props.modelsMap - Map of model ID to model name
 * @param {function} props.onModelSelectorOpen - Callback to open model selector
 * @param {function} props.onSettingsOpen - Callback to open settings panel
 * @param {function} props.onGenerate - Callback when generate is clicked
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the prompt bar is disabled
 * @param {File} props.sourceImage - Source image for img2img
 * @param {function} props.onSourceImageChange - Callback when source image changes
 * @param {string} props.sourceImagePreview - Preview URL for source image
 * @param {function} props.onSourceImageClear - Callback to clear source image
 * @param {string} props.mode - Current generation mode
 */
export function PromptBar({
  prompt = "",
  onPromptChange,
  selectedModels = [],
  modelsMap = {},
  onModelSelectorOpen,
  onSettingsOpen,
  onGenerate,
  isLoading = false,
  disabled = false,
  sourceImage,
  sourceImagePreview,
  onSourceImageChange,
  onSourceImageClear,
  mode = "image",
}) {
  const fileInputRef = useRef(null);

  // Get display text for selected models
  const getModelDisplayText = () => {
    if (selectedModels.length === 0) {
      return "Select Models";
    }
    if (selectedModels.length === 1) {
      return modelsMap[selectedModels[0]] || selectedModels[0];
    }
    return `${selectedModels.length} models selected`;
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast.error("Image size must be less than 50MB");
      return;
    }

    onSourceImageChange?.(file);
  };

  const handleKeyDown = (e) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!disabled && !isLoading && selectedModels.length > 0) {
        onGenerate?.();
      }
    }
  };

  const showImageUpload = mode === "image" || mode === "imgedit";
  const requiresImage = mode === "imgedit" || mode === "upscale";
  const requiresPrompt = mode !== "upscale";

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm" data-testid="prompt-bar">
      {/* Model selector row */}
      <div className="flex items-center gap-2 mb-3">
        <Button
          variant="outline"
          size="sm"
          onClick={onModelSelectorOpen}
          disabled={disabled}
          className="gap-2"
          data-testid="model-selector-button"
        >
          <Settings2 className="h-4 w-4" />
          <span className="truncate max-w-[200px]">{getModelDisplayText()}</span>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </Button>

        {selectedModels.length > 1 && (
          <Badge variant="secondary" className="text-xs">
            Multi-model
          </Badge>
        )}

        {/* Hidden selected model count for tests */}
        <div className="hidden" data-testid="selected-model-count">{selectedModels.length}</div>
      </div>

      {/* Source image preview for img2img */}
      {showImageUpload && sourceImagePreview && (
        <div className="relative mb-3 inline-block">
          <img
            src={sourceImagePreview}
            alt="Source"
            className="h-20 w-20 object-cover rounded-lg border"
          />
          <Button
            type="button"
            variant="destructive"
            size="icon"
            className="absolute -top-2 -right-2 h-5 w-5"
            onClick={onSourceImageClear}
            disabled={disabled || isLoading}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Prompt input */}
      <div className="relative">
        <Textarea
          placeholder={
            mode === "upscale"
              ? "Select an image to upscale"
              : mode === "imgedit"
              ? "Describe how to edit the image..."
              : sourceImage
              ? "Describe how to transform this image..."
              : "Describe the image you want to generate..."
          }
          value={prompt}
          onChange={(e) => onPromptChange?.(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isLoading || mode === "upscale"}
          className={cn(
            "min-h-[80px] pr-4 resize-none bg-background",
            mode === "upscale" && "opacity-50"
          )}
          rows={3}
          data-testid="prompt-input"
        />
      </div>

      {/* Action row */}
      <div className="flex items-center justify-between mt-3 gap-2">
        <div className="flex items-center gap-2">
          {/* Image upload button */}
          {showImageUpload && (
            <>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isLoading}
                className="gap-1.5"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="hidden sm:inline">Add</span>
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFileSelect}
                className="hidden"
                disabled={disabled || isLoading}
              />
            </>
          )}

          {/* Settings button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onSettingsOpen}
            disabled={disabled}
            className="gap-1.5"
            data-testid="settings-button"
          >
            <Settings2 className="h-4 w-4" />
            <span className="hidden sm:inline">Settings</span>
          </Button>
        </div>

        {/* Generate button */}
        <Button
          onClick={onGenerate}
          disabled={
            disabled ||
            isLoading ||
            selectedModels.length === 0 ||
            (requiresPrompt && !prompt.trim()) ||
            (requiresImage && !sourceImage)
          }
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
    </div>
  );
}

export default PromptBar;
