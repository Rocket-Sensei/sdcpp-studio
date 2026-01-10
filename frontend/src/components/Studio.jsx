import { useState, useEffect, useCallback } from "react";
import { GeneratePanel } from "./GeneratePanel";
import { UnifiedQueue } from "./UnifiedQueue";
import { Button } from "./ui/button";
import { Sheet, SheetContent, SheetTrigger } from "./ui/sheet";
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
 * @param {string} props.searchQuery - Search query for filtering generations
 * @param {Array} props.selectedStatuses - Array of selected status values for filtering
 * @param {Array} props.selectedModelsFilter - Array of selected model IDs for filtering
 */
export function Studio({ isFormCollapsed: externalIsCollapsed, onToggleForm, onCollapseChange, searchQuery, selectedStatuses, selectedModelsFilter }) {
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
      {/* Desktop Generate Sheet - Offcanvas menu */}
      <Sheet open={!isFormCollapsed} onOpenChange={(open) => setFormCollapsed(!open)}>
        {/* Generate button trigger - shown when form is collapsed */}
        {!isFormCollapsed && (
          <SheetTrigger asChild>
            <div className="sr-only">
              {/* Hidden trigger - Sheet is controlled programmatically */}
            </div>
          </SheetTrigger>
        )}

        <SheetContent side="right" className="w-full sm:w-[500px] lg:w-[600px] overflow-y-auto p-0">
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Generate</h2>
            </div>
            <GeneratePanel
              selectedModels={selectedModels}
              onModelsChange={handleModelsChange}
              settings={createMoreSettings}
              editImageSettings={editImageSettings}
              onGenerated={(...args) => {
                handleGenerated(...args);
                handleSettingsApplied();
                // Optionally close the sheet after generation
                // setFormCollapsed(true);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main content - UnifiedQueue Gallery */}
      <div className="grid grid-cols-1 gap-6">
        <UnifiedQueue
          onCreateMore={handleCreateMore}
          onEditImage={handleEditImage}
          searchQuery={searchQuery}
          selectedStatuses={selectedStatuses}
          selectedModelsFilter={selectedModelsFilter}
        />
      </div>

      {/* Floating action button for collapsed form */}
      {isFormCollapsed && (
        <Button
          onClick={toggleFormCollapse}
          size="lg"
          className="hidden lg:flex fixed bottom-6 right-6 rounded-full shadow-lg h-14 w-14 p-0 z-40"
          title="Show Generate Form"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      )}
    </div>
  );
}

export default Studio;
