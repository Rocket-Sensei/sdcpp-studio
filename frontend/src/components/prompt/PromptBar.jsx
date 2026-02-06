import { useRef } from "react";
import {
  Settings2,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { cn } from "../../lib/utils";
import { GenerateImage } from "./GenerateImage";
import { EditImage } from "./EditImage";
import { GenerateVideo } from "./GenerateVideo";
import { UpscaleImage } from "./UpscaleImage";
import { MultiModelSelector } from "../MultiModelSelector";

// Generation modes
const MODES = [
  { value: "image", label: "Image", icon: ImageIcon, description: "Text to Image / Image to Image" },
  { value: "imgedit", label: "Edit", icon: ImageIcon, description: "Image Edit" },
  { value: "video", label: "Video", icon: Video, description: "Text/Image to Video" },
  { value: "upscale", label: "Upscale", icon: ImageIcon, description: "Upscale" },
];

/**
 * PromptBar - Main generation form panel (top)
 * Mode selector and model selection are shared, prompt input is mode-specific
 *
 * @param {Object} props
 * @param {string} props.prompt - Current prompt text
 * @param {function} props.onPromptChange - Callback when prompt changes
 * @param {string} props.mode - Current generation mode
 * @param {function} props.onModeChange - Callback when mode changes
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {Object} props.modelsMap - Map of model ID to model name
 * @param {function} props.onSettingsToggle - Callback to toggle settings panel
 * @param {boolean} props.settingsOpen - Whether settings panel is open
 * @param {function} props.onGenerate - Callback when generate is clicked
 * @param {boolean} props.isLoading - Whether generation is in progress
 * @param {boolean} props.disabled - Whether the prompt bar is disabled
 * @param {string} props.sourceImagePreview - URL of source image preview (for edit/upscale modes)
 * @param {File} props.sourceImage - Source image file object (for upscale mode)
 * @param {function} props.onFileSelect - Callback when file is selected (for upscale mode)
 * @param {function} props.onClearImage - Callback to clear the selected image (for upscale mode)
 * @param {Array} props.availableUpscalers - Available upscalers (for upscale mode)
 * @param {string} props.upscalerName - Selected upscaler name (for upscale mode)
 * @param {function} props.onUpscalerNameChange - Callback for upscaler name change (for upscale mode)
 * @param {number} props.strength - Strength value for img2img (for image mode)
 */
export function PromptBar({
  prompt = "",
  onPromptChange,
  mode = "image",
  onModeChange,
  selectedModels = [],
  onModelsChange,
  modelsMap = {},
  onSettingsToggle,
  settingsOpen = false,
  onGenerate,
  isLoading = false,
  disabled = false,
  sourceImagePreview = null,
  sourceImage = null,
  onFileSelect,
  onClearImage,
  availableUpscalers = [],
  upscalerName = "",
  onUpscalerNameChange,
  strength = 0.75,
}) {
  // Determine if we should show strength indicator (image mode with source image)
  const showStrength = mode === "image" && sourceImagePreview;

  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm" data-testid="generate-panel">
      {/* Header row with title and settings button */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Generate</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={onSettingsToggle}
          className={cn(
            "gap-1.5",
            settingsOpen && "bg-primary/10 border-primary"
          )}
        >
          <Settings2 className="h-4 w-4" />
          <span className="hidden sm:inline">Settings</span>
        </Button>
      </div>

      {/* Generation Mode Selector - SHARED between top and bottom panels */}
      <div className="mb-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {MODES.map((modeOption) => {
            const Icon = modeOption.icon;
            return (
              <button
                key={modeOption.value}
                onClick={() => onModeChange?.(modeOption.value)}
                className={cn(
                  "flex items-center justify-center gap-2 p-2 rounded-lg border transition-colors",
                  mode === modeOption.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:border-primary/50"
                )}
                title={modeOption.description}
                disabled={disabled}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="text-xs font-medium">{modeOption.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Model selector row - NOT shown for upscale mode */}
      {mode !== "upscale" && (
        <div className="mb-3">
          <MultiModelSelector
            selectedModels={selectedModels}
            onModelsChange={onModelsChange}
            mode={mode}
            className="bg-muted/30 rounded-lg p-2"
          />
          {/* Hidden selected model count for tests */}
          <div className="hidden" data-testid="selected-model-count">{selectedModels.length}</div>
        </div>
      )}

      {/* Mode-specific prompt input */}
      {mode === "image" && (
        <GenerateImage
          prompt={prompt}
          onPromptChange={onPromptChange}
          isLoading={isLoading}
          disabled={disabled}
          showStrength={showStrength}
          strength={strength}
          onGenerate={onGenerate}
        />
      )}

      {mode === "imgedit" && (
        <EditImage
          prompt={prompt}
          onPromptChange={onPromptChange}
          isLoading={isLoading}
          disabled={disabled}
          sourceImagePreview={sourceImagePreview}
          onGenerate={onGenerate}
        />
      )}

      {mode === "video" && (
        <GenerateVideo
          prompt={prompt}
          onPromptChange={onPromptChange}
          isLoading={isLoading}
          disabled={disabled}
          onGenerate={onGenerate}
        />
      )}

      {mode === "upscale" && (
        <UpscaleImage
          isLoading={isLoading}
          disabled={disabled}
          sourceImagePreview={sourceImagePreview}
          sourceImage={sourceImage}
          onGenerate={onGenerate}
          onFileSelect={onFileSelect}
          onClearImage={onClearImage}
          availableUpscalers={availableUpscalers}
          upscalerName={upscalerName}
          onUpscalerNameChange={onUpscalerNameChange}
        />
      )}
    </div>
  );
}

export default PromptBar;
