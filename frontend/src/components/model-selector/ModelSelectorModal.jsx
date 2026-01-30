import { useState, useEffect, useCallback, useRef } from "react";
import { X, Loader2, Cpu, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { ModelCard } from "./ModelCard";
import { cn } from "../../lib/utils";
import { toast } from "sonner";
import { authenticatedFetch } from "../../utils/api";
import { useDownloadProgress } from "../../hooks/useWebSocket";

const API_BASE = "/api/models";

// Download status constants
const DOWNLOAD_STATUS = {
  PENDING: "pending",
  DOWNLOADING: "downloading",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Filter models based on category tab
 */
const filterModelsByCategory = (models, category) => {
  switch (category) {
    case "image":
      return models.filter(
        (m) =>
          m.capabilities?.includes("text-to-image") &&
          !m.capabilities?.includes("video")
      );
    case "video":
      return models.filter((m) => m.capabilities?.includes("video"));
    case "legacy":
      // Legacy models - could be defined by a flag or older models
      return models.filter((m) => m.isLegacy === true);
    default:
      return models;
  }
};

/**
 * ModelSelectorModal - Modal for selecting models with tabbed categories
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the modal is open
 * @param {function} props.onOpenChange - Callback when open state changes
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {function} props.onModelsChange - Callback when selection changes
 * @param {string} props.mode - Current generation mode for filtering
 */
export function ModelSelectorModal({
  open,
  onOpenChange,
  selectedModels = [],
  onModelsChange,
  mode = null,
}) {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("image");
  const [actionInProgress, setActionInProgress] = useState({});
  const [modelFilesStatus, setModelFilesStatus] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);

  const fetchModelsRef = useRef(null);

  // Fetch models
  const fetchModels = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${API_BASE}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      const allModels = data.models || [];

      setModels(allModels);

      // Extract file status
      const fileStatusMap = {};
      for (const model of allModels) {
        if (model.fileStatus) {
          fileStatusMap[model.id] = model.fileStatus;
        }
      }
      setModelFilesStatus(fileStatusMap);

      return data;
    } catch (err) {
      console.error("Error fetching models:", err);
      toast.error("Failed to load models");
      return null;
    }
  }, []);

  // Initial fetch when modal opens
  useEffect(() => {
    if (open) {
      setIsLoading(true);
      fetchModels().finally(() => setIsLoading(false));
    }
  }, [open, fetchModels]);

  // Keep ref updated for polling
  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  // Poll for status updates when modal is open
  useEffect(() => {
    if (!open) return;

    const interval = setInterval(() => {
      fetchModelsRef.current?.();
    }, 5000);

    return () => clearInterval(interval);
  }, [open]);

  // Poll download progress
  const pollDownloadProgress = useCallback(
    (jobId, modelId) => {
      const interval = setInterval(async () => {
        try {
          const response = await authenticatedFetch(
            `${API_BASE}/download/${jobId}`
          );
          if (response.ok) {
            const data = await response.json();
            setDownloadProgress({
              status: data.status,
              progress: data.progress || 0,
              modelId,
            });

            if (
              data.status === DOWNLOAD_STATUS.COMPLETED ||
              data.status === DOWNLOAD_STATUS.FAILED ||
              data.status === DOWNLOAD_STATUS.CANCELLED
            ) {
              clearInterval(interval);
              if (data.status === DOWNLOAD_STATUS.COMPLETED) {
                toast.success("Model downloaded successfully");
                await fetchModels();
              }
              setTimeout(() => setDownloadProgress(null), 2000);
            }
          }
        } catch (error) {
          console.error("Error polling download progress:", error);
          clearInterval(interval);
        }
      }, 1000);
    },
    [fetchModels]
  );

  // WebSocket download progress handler
  useDownloadProgress((message) => {
    if (message.type === "progress" || message.type === "started") {
      setDownloadProgress({
        status: message.data.status || DOWNLOAD_STATUS.DOWNLOADING,
        progress: (message.data.overallProgress || 0) / 100,
        modelId: message.data.modelId,
      });
    } else if (message.type === "complete") {
      setDownloadProgress((prev) => ({
        ...prev,
        status: DOWNLOAD_STATUS.COMPLETED,
        progress: 1,
      }));
      toast.success("Model downloaded successfully");
      fetchModels();
      setTimeout(() => setDownloadProgress(null), 3000);
    } else if (message.type === "failed") {
      setDownloadProgress((prev) => ({
        ...prev,
        status: DOWNLOAD_STATUS.FAILED,
      }));
      toast.error(message.data.error || "Download failed");
    } else if (message.type === "cancelled") {
      setDownloadProgress(null);
      toast.info("Download cancelled");
    }
  });

  // Start a model
  const startModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "starting" }));
    try {
      const response = await authenticatedFetch(`${API_BASE}/${modelId}/start`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to start model");
      }
      await fetchModels();
      const model = models.find((m) => m.id === modelId);
      toast.success(`Starting ${model?.name || modelId}...`);
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
      const response = await authenticatedFetch(`${API_BASE}/${modelId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to stop model");
      }
      await fetchModels();
      const model = models.find((m) => m.id === modelId);
      toast.success(`${model?.name || modelId} has been stopped`);
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
      setDownloadProgress({
        status: DOWNLOAD_STATUS.PENDING,
        progress: 0,
        modelId,
      });

      const response = await authenticatedFetch(
        `${API_BASE}/${modelId}/download`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setDownloadProgress({
          status: DOWNLOAD_STATUS.DOWNLOADING,
          progress: 0,
          modelId,
        });

        pollDownloadProgress(data.downloadId, modelId);
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }
    } catch (error) {
      console.error("Error downloading model:", error);
      setDownloadProgress(null);
      toast.error(error.message);
    }
  };

  // Toggle model selection
  const toggleModelSelection = (modelId) => {
    const newSelection = selectedModels.includes(modelId)
      ? selectedModels.filter((id) => id !== modelId)
      : [...selectedModels, modelId];
    onModelsChange?.(newSelection);
  };

  // Select all visible models
  const selectAllVisible = () => {
    const visibleModels = filterModelsByCategory(models, activeTab);
    const visibleIds = visibleModels
      .filter((m) => {
        const filesStatus = modelFilesStatus[m.id];
        return !filesStatus || filesStatus.allFilesExist;
      })
      .map((m) => m.id);
    const newSelection = [...new Set([...selectedModels, ...visibleIds])];
    onModelsChange?.(newSelection);
  };

  // Deselect all
  const deselectAll = () => {
    onModelsChange?.([]);
  };

  // Get filtered models for current tab
  const filteredModels = filterModelsByCategory(models, activeTab);

  // Count models with missing files
  const modelsWithFiles = filteredModels.filter((m) => {
    const filesStatus = modelFilesStatus[m.id];
    return !filesStatus || filesStatus.allFilesExist;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2">
              <Cpu className="h-5 w-5" />
              Models
            </DialogTitle>
          </div>
        </DialogHeader>

        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-4 pt-2 flex-shrink-0">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="video">Video</TabsTrigger>
              <TabsTrigger value="legacy">Legacy</TabsTrigger>
            </TabsList>
          </div>

          {/* Selection controls */}
          <div className="px-4 py-2 flex items-center justify-between border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">
                Selected: {selectedModels.length}/{models.length}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={selectAllVisible}
                disabled={modelsWithFiles.length === 0}
              >
                Select All
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={deselectAll}
                disabled={selectedModels.length === 0}
              >
                Deselect All
              </Button>
            </div>
          </div>

          {/* Model list */}
          <div className="flex-1 min-h-0 overflow-hidden">
            {isLoading ? (
              <div className="flex items-center justify-center h-48">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading models...
                </span>
              </div>
            ) : (
              <TabsContent value={activeTab} className="m-0 h-full">
                <ScrollArea className="h-full">
                  <div className="p-4 space-y-2">
                    {/* Featured "Auto" option */}
                    {activeTab === "image" && (
                      <div
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border bg-gradient-to-r from-primary/10 to-primary/5 border-primary/30 cursor-pointer hover:border-primary/50 transition-colors mb-4"
                        )}
                        onClick={() => {
                          // Auto mode could select a default model
                          // For now, just show it as a featured option
                        }}
                      >
                        <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center">
                          <Sparkles className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">Auto</h4>
                          <p className="text-sm text-muted-foreground">
                            An intelligent Preset that selects the best model
                            for your prompt
                          </p>
                        </div>
                      </div>
                    )}

                    {filteredModels.length === 0 ? (
                      <div className="text-center py-12">
                        <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">
                          No models available
                        </h3>
                        <p className="text-muted-foreground">
                          No models configured for this category
                        </p>
                      </div>
                    ) : (
                      filteredModels.map((model) => (
                        <ModelCard
                          key={model.id}
                          model={model}
                          isSelected={selectedModels.includes(model.id)}
                          onSelect={() => toggleModelSelection(model.id)}
                          onStart={startModel}
                          onStop={stopModel}
                          onDownload={downloadModel}
                          isActionInProgress={!!actionInProgress[model.id]}
                          actionType={actionInProgress[model.id]}
                          downloadProgress={downloadProgress}
                          filesStatus={modelFilesStatus[model.id]}
                        />
                      ))
                    )}
                  </div>
                </ScrollArea>
              </TabsContent>
            )}
          </div>
        </Tabs>

        {/* Footer with done button */}
        <div className="p-4 border-t flex-shrink-0">
          <Button className="w-full" onClick={() => onOpenChange?.(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ModelSelectorModal;
