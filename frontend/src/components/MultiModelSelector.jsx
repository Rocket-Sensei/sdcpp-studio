import { useState, useEffect, useCallback, useRef } from "react";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Download,
  Circle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { cn } from "../lib/utils";
import { toast } from "sonner";

const API_BASE = "/api/models";

// Model status constants
const MODEL_STATUS = {
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  ERROR: "error",
};

// Download status constants
const DOWNLOAD_STATUS = {
  PENDING: "pending",
  DOWNLOADING: "downloading",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Filter models based on mode
 * @param {Array} allModels - All models from API
 * @param {string} mode - Mode to filter by ('txt2img', 'img2img', 'imgedit', 'upscale')
 * @returns {Array} Filtered models
 */
const filterModels = (allModels, mode) => {
  switch (mode) {
    case "txt2img":
      return allModels.filter((m) => m.capabilities?.includes("text-to-image"));
    case "img2img":
      // All models support img2img via --init-img
      return allModels.filter((m) => m.capabilities?.includes("text-to-image"));
    case "imgedit":
      // Only models with imgedit capability support --ref-image
      return allModels.filter((m) => m.capabilities?.includes("imgedit"));
    case "upscale":
      return []; // Upscale doesn't use models directly
    default:
      return allModels;
  }
};

/**
 * MultiModelSelector Component
 *
 * A multi-select checkbox list for models with inline controls (start/stop/download).
 *
 * @param {Object} props
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {function} props.onModelsChange - Callback when model selection changes
 * @param {string[]} props.filterCapabilities - Optional capability filter (e.g., ['text-to-image'])
 * @param {string} props.mode - Mode for filtering ('txt2img', 'img2img', 'imgedit', 'upscale')
 * @param {string} props.className - Additional CSS classes
 */
export function MultiModelSelector({
  selectedModels = [],
  onModelsChange,
  filterCapabilities = null,
  mode = null,
  className = "",
}) {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState({});
  const [expandedModels, setExpandedModels] = useState({});
  const [modelFilesStatus, setModelFilesStatus] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);

  // Keep a ref to the latest fetchModels function for polling
  const fetchModelsRef = useRef(null);

  // Fetch all models
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      let filteredModels = data.models || [];

      // Apply filterCapabilities if provided
      if (filterCapabilities && Array.isArray(filterCapabilities)) {
        filteredModels = filteredModels.filter((model) => {
          const modelCapabilities = model.capabilities || [];
          return filterCapabilities.some((cap) => modelCapabilities.includes(cap));
        });
      }

      // Apply mode filter if provided
      if (mode) {
        filteredModels = filterModels(filteredModels, mode);
      }

      setModels(filteredModels);

      // Fetch file status for models with HuggingFace config
      for (const model of filteredModels) {
        if (model.huggingface) {
          fetchModelFilesStatus(model.id);
        }
      }

      return data;
    } catch (err) {
      console.error("Error fetching models:", err);
      toast.error("Failed to load models");
      return null;
    }
  }, [filterCapabilities, mode]);

  // Fetch model files status
  const fetchModelFilesStatus = useCallback(async (modelId) => {
    try {
      const response = await fetch(`${API_BASE}/${modelId}/files/status`);
      if (response.ok) {
        const data = await response.json();
        setModelFilesStatus((prev) => ({
          ...prev,
          [modelId]: data,
        }));
      }
    } catch (error) {
      console.error("Error fetching model files status:", error);
    }
  }, []);

  // Poll download progress
  const pollDownloadProgress = useCallback((jobId, modelId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${API_BASE}/download/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setDownloadProgress({
            status: data.status,
            progress: data.progress || 0,
            bytesDownloaded: data.bytes_downloaded,
            totalBytes: data.total_bytes,
            speed: data.speed,
            eta: data.eta,
            error: data.error,
            files: data.files,
          });

          if (
            data.status === DOWNLOAD_STATUS.COMPLETED ||
            data.status === DOWNLOAD_STATUS.FAILED ||
            data.status === DOWNLOAD_STATUS.CANCELLED
          ) {
            clearInterval(interval);
            if (data.status === DOWNLOAD_STATUS.COMPLETED) {
              toast.success("Model downloaded successfully");
              fetchModelFilesStatus(modelId);
              await fetchModels();
            }
          }
        }
      } catch (error) {
        console.error("Error polling download progress:", error);
        clearInterval(interval);
      }
    }, 1000);
  }, [fetchModelFilesStatus, fetchModels]);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchModels();
      setIsLoading(false);
    };
    loadInitialData();
  }, [fetchModels]);

  // Keep ref updated
  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  // Poll for status updates every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchModelsRef.current?.();
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Start a model
  const startModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "starting" }));
    try {
      const response = await fetch(`${API_BASE}/${modelId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to start model: ${response.statusText}`);
      }
      await fetchModels();
      toast.success(`Starting ${getModelById(modelId)?.name || modelId}...`);
    } catch (err) {
      console.error("Error starting model:", err);
      toast.error(err.message);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Stop a model
  const stopModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "stopping" }));
    try {
      const response = await fetch(`${API_BASE}/${modelId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to stop model: ${response.statusText}`);
      }
      await fetchModels();
      toast.success(`${getModelById(modelId)?.name || modelId} has been stopped`);
    } catch (err) {
      console.error("Error stopping model:", err);
      toast.error(err.message);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Download a model
  const downloadModel = async (modelId) => {
    try {
      setDownloadProgress({ status: DOWNLOAD_STATUS.PENDING, progress: 0, modelId });

      const response = await fetch(`${API_BASE}/${modelId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setDownloadProgress({
          status: DOWNLOAD_STATUS.DOWNLOADING,
          jobId: data.downloadId,
          progress: 0,
          modelName: getModelById(modelId)?.name,
          repo: data.repo,
          modelId,
        });

        pollDownloadProgress(data.downloadId, modelId);
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }
    } catch (error) {
      console.error("Error downloading model:", error);
      setDownloadProgress({ status: DOWNLOAD_STATUS.FAILED, error: error.message });
      toast.error(error.message);
    }
  };

  // Get model by ID
  const getModelById = (modelId) => {
    return models.find((m) => m.id === modelId);
  };

  // Toggle model selection
  const toggleModelSelection = (modelId) => {
    const newSelection = selectedModels.includes(modelId)
      ? selectedModels.filter((id) => id !== modelId)
      : [...selectedModels, modelId];
    onModelsChange?.(newSelection);
  };

  // Toggle expand/collapse
  const toggleExpand = (modelId) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelId]: !prev[modelId],
    }));
  };

  // Select all models
  const selectAll = () => {
    const allIds = models.map((m) => m.id);
    onModelsChange?.(allIds);
  };

  // Deselect all models
  const deselectAll = () => {
    onModelsChange?.([]);
  };

  // Status indicator component
  const StatusIndicator = ({ status, className }) => {
    const isRunning = status === MODEL_STATUS.RUNNING;
    const isTransitioning =
      status === MODEL_STATUS.STARTING || status === MODEL_STATUS.STOPPING;
    const isError = status === MODEL_STATUS.ERROR;

    if (isTransitioning) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
          <span className="text-xs text-muted-foreground">
            {status === MODEL_STATUS.STARTING ? "Starting..." : "Stopping..."}
          </span>
        </div>
      );
    }

    if (isError) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-xs text-destructive">Error</span>
        </div>
      );
    }

    if (isRunning) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <CheckCircle2 className="h-3 w-3 text-green-500" />
          <span className="text-xs text-green-600 font-medium">Running</span>
        </div>
      );
    }

    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <Circle className="h-3 w-3 text-gray-400" />
        <span className="text-xs text-muted-foreground">Stopped</span>
      </div>
    );
  };

  // Format file size
  const formatBytes = (bytes) => {
    if (!bytes) return "Unknown";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Format speed
  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return "";
    return formatBytes(bytesPerSecond) + "/s";
  };

  // Format ETA
  const formatETA = (seconds) => {
    if (!seconds) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No models available</h3>
        <p className="text-muted-foreground">
          {mode
            ? `No models configured for ${mode} mode`
            : "No models configured. Add models to your configuration files."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-5 w-5 text-muted-foreground" />
          <h3 className="font-semibold">Models</h3>
          <Badge variant="secondary" className="text-xs">
            Selected: {selectedModels.length}/{models.length}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={selectAll} disabled={selectedModels.length === models.length}>
            Select All
          </Button>
          <Button size="sm" variant="outline" onClick={deselectAll} disabled={selectedModels.length === 0}>
            Deselect All
          </Button>
        </div>
      </div>

      {/* Download progress display */}
      {downloadProgress && downloadProgress.status === DOWNLOAD_STATUS.DOWNLOADING && (
        <div className="bg-muted rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Downloading {downloadProgress.modelName || "model"}...</span>
            <span className="text-muted-foreground">{Math.round(downloadProgress.progress * 100)}%</span>
          </div>
          <div className="w-full bg-primary/10 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${downloadProgress.progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {downloadProgress.bytesDownloaded && downloadProgress.totalBytes && (
              <span>
                {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.totalBytes)}
              </span>
            )}
            <div className="text-right">
              {downloadProgress.speed && <span>{formatSpeed(downloadProgress.speed)}</span>}
              {downloadProgress.eta && <span> • {formatETA(downloadProgress.eta)} left</span>}
            </div>
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="space-y-2">
        {models.map((model) => {
          const isSelected = selectedModels.includes(model.id);
          const isExpanded = expandedModels[model.id];
          const filesStatus = modelFilesStatus[model.id];
          const hasMissingFiles = filesStatus && !filesStatus.allFilesExist;
          const isServerMode = model.exec_mode === "server";
          const isCliMode = model.exec_mode === "cli";

          return (
            <div
              key={model.id}
              className={cn(
                "border rounded-lg overflow-hidden transition-colors",
                isSelected ? "bg-primary/5 border-primary/50" : "bg-card border-border hover:bg-muted/50"
              )}
            >
              {/* Main row */}
              <div className="flex items-center gap-3 p-3">
                {/* Expand/collapse button */}
                <button
                  onClick={() => toggleExpand(model.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleModelSelection(model.id)}
                  className="flex-shrink-0"
                />

                {/* Model info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{model.name}</span>
                    {isCliMode && (
                      <Badge variant="outline" className="gap-1 text-xs">
                        <Cpu className="h-3 w-3" />
                        CLI
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    {model.port && <span className="font-mono">:{model.port}</span>}
                    <span>•</span>
                    <span>{model.mode === "preload" ? "Preload" : "On-demand"}</span>
                  </div>
                </div>

                {/* Status indicator */}
                <StatusIndicator status={model.status} className="flex-shrink-0" />

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasMissingFiles && model.huggingface && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadModel(model.id)}
                      disabled={!!downloadProgress}
                      className="gap-1.5"
                      title="Download model files"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  )}

                  {isServerMode && model.mode === "on_demand" && (
                    <>
                      {model.status === MODEL_STATUS.RUNNING ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => stopModel(model.id)}
                          disabled={actionInProgress[model.id] === "stopping"}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                          title="Stop model"
                        >
                          {actionInProgress[model.id] === "stopping" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => startModel(model.id)}
                          disabled={actionInProgress[model.id] === "starting"}
                          className="h-8 w-8 p-0 text-green-500 hover:text-green-500"
                          title="Start model"
                        >
                          {actionInProgress[model.id] === "starting" ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Play className="h-4 w-4" />
                          )}
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/30 p-3 space-y-2 text-sm">
                  {model.description && (
                    <div>
                      <span className="text-muted-foreground">Description: </span>
                      <span>{model.description}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {model.port && (
                      <div>
                        <span className="text-muted-foreground">Port: </span>
                        <span className="font-mono">{model.port}</span>
                      </div>
                    )}

                    <div>
                      <span className="text-muted-foreground">Mode: </span>
                      <span>{model.mode === "preload" ? "Preload" : "On-demand"}</span>
                    </div>

                    <div>
                      <span className="text-muted-foreground">Type: </span>
                      <span>{model.exec_mode === "cli" ? "CLI" : "Server"}</span>
                    </div>

                    {model.capabilities && model.capabilities.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Capabilities: </span>
                        <span>{model.capabilities.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Files status */}
                  {filesStatus && filesStatus.files && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Files: </span>
                      <div className="space-y-1 mt-1">
                        {filesStatus.files.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            {file.exists ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                            )}
                            <span className={cn(file.exists ? "text-foreground" : "text-destructive")}>
                              {file.fileName} {file.exists ? "" : "(missing)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* HuggingFace repo info */}
                  {model.huggingface && (
                    <div className="text-xs text-muted-foreground">
                      <span>HF Repo: {model.huggingface.repo}</span>
                    </div>
                  )}

                  {/* Error message */}
                  {model.status === MODEL_STATUS.ERROR && model.error && (
                    <div className="text-xs text-destructive">
                      Error: {model.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default MultiModelSelector;
