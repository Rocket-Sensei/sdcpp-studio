import { useState, useEffect, useCallback } from "react";
import { Circle, Play, Square, Loader2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { cn } from "../lib/utils";
import { useToast } from "../hooks/useToast";

const API_BASE = "/api/models";

// Model status constants
const MODEL_STATUS = {
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  ERROR: "error",
};

/**
 * Compact model selector component for the app header
 * Displays a dropdown to select models with status indicators and start/stop controls
 *
 * @param {Object} props
 * @param {string} props.currentModel - Currently selected model ID
 * @param {function} props.onModelChange - Callback when model selection changes
 * @param {string} props.className - Additional CSS classes
 * @param {Array<string>} props.filterCapabilities - Optional capability filter (e.g., ['image-to-image'])
 */
export function ModelSelector({ currentModel, onModelChange, className = "", filterCapabilities = null }) {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState(null);
  const [error, setError] = useState(null);
  const { addToast } = useToast();

  // Fetch available models (includes running status from backend)
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();

      // Filter models by capabilities if filterCapabilities is provided
      let filteredModels = data.models || [];
      if (filterCapabilities && Array.isArray(filterCapabilities)) {
        filteredModels = filteredModels.filter(model => {
          const modelCapabilities = model.capabilities || [];
          // Check if model has at least one of the required capabilities
          return filterCapabilities.some(cap => modelCapabilities.includes(cap));
        });
      }

      setModels(filteredModels);

      // Set default model if none selected
      if (!currentModel && data.default) {
        // data.default might be an object (with id property) or a string
        const defaultModelId = typeof data.default === 'object' ? data.default.id : data.default;
        onModelChange?.(defaultModelId);
      }
      setError(null);
    } catch (err) {
      console.error("Error fetching models:", err);
      setError(err.message);
    }
  }, [currentModel, onModelChange, filterCapabilities]);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchModels();
      setIsLoading(false);
    };
    loadInitialData();
  }, [fetchModels]);

  // Poll for status updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchModels();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchModels]);

  // Start a model
  const startModel = async (modelId) => {
    setActionInProgress(modelId);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/${modelId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Failed to start model: ${response.statusText}`);
      }
      await fetchModels();
      addToast("Model Starting", `Starting ${getModelById(modelId)?.name || modelId}...`, "default");
    } catch (err) {
      console.error("Error starting model:", err);
      setError(err.message);
      addToast("Start Failed", err.message, "destructive");
    } finally {
      setActionInProgress(null);
    }
  };

  // Stop a model
  const stopModel = async (modelId) => {
    setActionInProgress(modelId);
    setError(null);
    try {
      const response = await fetch(`${API_BASE}/${modelId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error(`Failed to stop model: ${response.statusText}`);
      }
      await fetchModels();
      addToast("Model Stopped", `${getModelById(modelId)?.name || modelId} has been stopped`, "default");
    } catch (err) {
      console.error("Error stopping model:", err);
      setError(err.message);
      addToast("Stop Failed", err.message, "destructive");
    } finally {
      setActionInProgress(null);
    }
  };

  // Handle model selection change
  const handleModelChange = (modelId) => {
    onModelChange?.(modelId);
    const model = getModelById(modelId);
    if (model) {
      addToast(
        "Model Selected",
        `Selected ${model.name || model.id}`,
        "default"
      );
    }
  };

  // Get model running status
  const getModelStatus = (modelId) => {
    const model = models.find((m) => m.id === modelId);
    // Use status from model object, fallback to stopped
    return model?.status?.status || MODEL_STATUS.STOPPED;
  };

  // Get model port
  const getModelPort = (modelId) => {
    const model = models.find((m) => m.id === modelId);
    // Use port from model status object
    return model?.status?.port;
  };

  // Get model by ID
  const getModelById = (modelId) => {
    return models.find((m) => m.id === modelId);
  };

  // Get current model data
  const currentModelData = getModelById(currentModel);

  // Status indicator component
  const StatusIndicator = ({ status, className }) => {
    const isRunning = status === MODEL_STATUS.RUNNING;
    const isTransitioning =
      status === MODEL_STATUS.STARTING || status === MODEL_STATUS.STOPPING;
    const isError = status === MODEL_STATUS.ERROR;

    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {isTransitioning ? (
          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
        ) : (
          <Circle
            className={cn(
              "h-2.5 w-2.5",
              isError
                ? "fill-red-500 text-red-500"
                : isRunning
                  ? "fill-green-500 text-green-500"
                  : "fill-gray-500 text-gray-500"
            )}
          />
        )}
        <span className="text-xs text-muted-foreground hidden sm:inline">
          {isTransitioning
            ? status === MODEL_STATUS.STARTING
              ? "Starting..."
              : "Stopping..."
            : isError
              ? "Error"
              : isRunning
                ? "Running"
                : "Stopped"}
        </span>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={cn("text-sm text-muted-foreground", className)}>
        No models available
      </div>
    );
  }

  const currentStatus = currentModel ? getModelStatus(currentModel) : MODEL_STATUS.STOPPED;
  const currentPort = currentModel ? getModelPort(currentModel) : null;
  const isCurrentModelOnDemand = currentModelData?.mode === "on_demand";

  return (
    <div className={cn("flex items-center gap-2 sm:gap-3", className)}>
      {/* Model Selector Dropdown */}
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground hidden sm:inline">
          Model:
        </span>
        <Select value={currentModel || ""} onValueChange={handleModelChange}>
          <SelectTrigger className="w-[160px] sm:w-[200px] h-8 text-sm">
            <SelectValue placeholder="Select model">
              {currentModelData && (
                <div className="flex items-center gap-2 truncate">
                  <StatusIndicator status={currentStatus} />
                  <span className="truncate">{currentModelData.name}</span>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {models.map((model) => {
              const status = getModelStatus(model.id);
              const port = getModelPort(model.id);
              return (
                <SelectItem key={model.id} value={model.id}>
                  <div className="flex items-center gap-2 py-1">
                    <StatusIndicator status={status} />
                    <div className="flex flex-col">
                      <span className="font-medium">{model.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {model.description || model.id}
                        </span>
                        {port && (
                          <span className="text-xs text-muted-foreground">
                            :{port}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Start/Stop Controls for on_demand models */}
      {currentModel && isCurrentModelOnDemand && (
        <div className="flex items-center gap-1">
          {currentStatus === MODEL_STATUS.RUNNING ? (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive"
              onClick={() => stopModel(currentModel)}
              disabled={actionInProgress === currentModel}
              title="Stop model"
            >
              {actionInProgress === currentModel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4" />
              )}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-green-500 hover:text-green-500"
              onClick={() => startModel(currentModel)}
              disabled={actionInProgress === currentModel}
              title="Start model"
            >
              {actionInProgress === currentModel ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      )}

      {/* Port display for running models */}
      {currentPort && (
        <div className="hidden md:flex items-center gap-1 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded">
          <span>Port:</span>
          <span className="font-mono font-medium">{currentPort}</span>
        </div>
      )}

      {/* Error display */}
      {error && (
        <div className="text-xs text-destructive hidden sm:inline max-w-[200px] truncate">
          {error}
        </div>
      )}
    </div>
  );
}

export default ModelSelector;
