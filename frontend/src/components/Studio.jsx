import { useState, useEffect, useCallback } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { Button } from "./ui/button";
import { Sparkles, ChevronDown } from "lucide-react";

// Default editing model
const DEFAULT_EDIT_MODEL = "qwen-image-edit";

const STORAGE_KEY = "studio-form-collapsed";

/**
 * Studio Component - A unified page merging Generate and Gallery functionality
 *
 * Features:
 * - Side-by-side layout with collapsible Generate form
 * - Left sidebar (1/3 width): GeneratePanel (collapsible)
 * - Right area (2/3 width): UnifiedQueue gallery
 * - "Create More" button handling from UnifiedQueue
 * - Persistent collapse state via localStorage
 * - Responsive design (stacked on mobile, side-by-side on desktop)
 *
 * @param {Object} props
 * @param {boolean} props.isFormCollapsed - External control of form collapse state
 * @param {Function} props.onToggleForm - Callback when form toggle is requested
 * @param {Function} props.onCollapseChange - Callback when collapse state changes (for parent to track state)
 */
export function Studio({ isFormCollapsed: externalIsCollapsed, onToggleForm, onCollapseChange }) {
  // State for selected models (array of model IDs)
  const [selectedModels, setSelectedModels] = useState([]);

  // Settings from "Create More" button click
  const [createMoreSettings, setCreateMoreSettings] = useState(null);

  // State for edit image mode
  const [editImageSettings, setEditImageSettings] = useState(null);

  // Form collapse state with localStorage persistence
  // Use external state if provided, otherwise use internal state
  const [internalIsCollapsed, setIsFormCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved === "true";
    }
    return false;
  });

  // Determine whether to use external or internal state
  const isFormCollapsed = externalIsCollapsed ?? internalIsCollapsed;

  // Internal setter that persists to localStorage and notifies parent
  const setFormCollapsed = useCallback((value) => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(value));
    }
    setIsFormCollapsed(value);
    onCollapseChange?.(value);
  }, [onCollapseChange]);

  // Persist collapse state to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, String(isFormCollapsed));
    }
  }, [isFormCollapsed]);

  // Handle "Create More" from UnifiedQueue
  // Sets the selected model and applies settings from the generation
  const handleCreateMore = useCallback((generation) => {
    setCreateMoreSettings(generation);
    setEditImageSettings(null); // Clear edit settings when creating more
    if (generation.model) {
      setSelectedModels([generation.model]);
    }
    // Expand form when creating more
    const newValue = false;
    setFormCollapsed(newValue);
  }, [setFormCollapsed]);

  // Handle "Edit Image" from UnifiedQueue
  // Sets the image for editing, switches to imgedit mode, and sets default edit model
  const handleEditImage = useCallback((imageFile, generation) => {
    // Create a temporary object URL for preview
    const imageUrl = URL.createObjectURL(imageFile);

    // Set up edit settings with the image
    setEditImageSettings({
      imageFile,
      imageUrl,
      type: 'edit',
      // Preserve prompt if available
      prompt: generation.prompt || '',
      // Clear other settings for a fresh edit
      negative_prompt: '',
      size: generation.size || '1024x1024',
    });
    setCreateMoreSettings(null); // Clear create more settings when editing

    // Set the default editing model
    setSelectedModels([DEFAULT_EDIT_MODEL]);

    // Expand form when editing
    setFormCollapsed(false);
  }, [setFormCollapsed]);

  // Handle generation complete
  // Gallery auto-refreshes via WebSocket, so this is mainly for any additional actions
  const handleGenerated = useCallback(() => {
    // The gallery will auto-refresh via WebSocket subscription
    // This callback can be used for additional actions if needed
  }, []);

  // Toggle form collapse state - use external callback or internal toggle
  const toggleFormCollapse = useCallback(() => {
    if (onToggleForm) {
      onToggleForm();
    } else {
      setFormCollapsed((prev) => !prev);
    }
  }, [onToggleForm, setFormCollapsed]);

  // Handle model selection change
  const handleModelChange = useCallback((modelId) => {
    if (modelId) {
      // If modelId is provided, set it as the only selected model
      setSelectedModels([modelId]);
    } else {
      // Clear selection if no modelId
      setSelectedModels([]);
    }
  }, []);

  // Handle models array change (for GeneratePanel)
  const handleModelsChange = useCallback((models) => {
    setSelectedModels(models);
  }, []);

  // Clear createMoreSettings and editImageSettings after they have been applied
  const handleSettingsApplied = useCallback(() => {
    setCreateMoreSettings(null);
    setEditImageSettings(null);
  }, []);

  return (
    <div className="container mx-auto p-4">
      {/* Main grid layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left sidebar - Generate Panel (desktop only) */}
        {!isFormCollapsed && (
          <div className="hidden lg:block lg:col-span-1">
            <GeneratePanel
              selectedModels={selectedModels}
              onModelsChange={handleModelsChange}
              settings={createMoreSettings}
              editImageSettings={editImageSettings}
              onGenerated={(...args) => {
                handleGenerated(...args);
                handleSettingsApplied();
              }}
            />
          </div>
        )}

        {/* Right area - UnifiedQueue Gallery */}
        <div className={isFormCollapsed ? "lg:col-span-3" : "lg:col-span-2"}>
          <UnifiedQueue onCreateMore={handleCreateMore} onEditImage={handleEditImage} />
        </div>
      </div>

      {/* Floating action button for collapsed form (desktop only) */}
      {isFormCollapsed && (
        <Button
          onClick={toggleFormCollapse}
          size="lg"
          className="hidden lg:flex fixed bottom-6 right-6 rounded-full shadow-lg h-14 w-14 p-0"
          title="Show Generate Form"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}

export default Studio;
