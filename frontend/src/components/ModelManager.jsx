import { useEffect, useState, useCallback } from "react";
import {
  Play,
  StopCircle,
  Download,
  RefreshCw,
  Settings,
  Server,
  Terminal,
  Circle,
  Loader2,
  Eye,
  XCircle,
  CheckCircle2,
  Clock,
  HardDrive,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog";
import { Progress } from "./ui/progress";
import { useToast } from "../hooks/useToast";
import { cn } from "../lib/utils";

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

// Status configurations
const STATUS_CONFIG = {
  [MODEL_STATUS.STOPPED]: {
    icon: Circle,
    label: "Stopped",
    color: "secondary",
    bgColor: "bg-slate-500",
  },
  [MODEL_STATUS.STARTING]: {
    icon: Loader2,
    label: "Starting",
    color: "default",
    animate: true,
    bgColor: "bg-blue-500",
  },
  [MODEL_STATUS.RUNNING]: {
    icon: CheckCircle2,
    label: "Running",
    color: "success",
    bgColor: "bg-green-500",
  },
  [MODEL_STATUS.STOPPING]: {
    icon: Loader2,
    label: "Stopping",
    color: "default",
    animate: true,
    bgColor: "bg-orange-500",
  },
  [MODEL_STATUS.ERROR]: {
    icon: XCircle,
    label: "Error",
    color: "destructive",
    bgColor: "bg-red-500",
  },
};

export function ModelManager() {
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [actionInProgress, setActionInProgress] = useState({});
  const [selectedModel, setSelectedModel] = useState(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [modelFilesStatus, setModelFilesStatus] = useState({});
  const { addToast } = useToast();

  // Fetch all models
  const fetchModels = useCallback(async () => {
    try {
      const response = await fetch("/api/models");
      if (response.ok) {
        const data = await response.json();
        const modelsList = data.models || [];
        setModels(modelsList);

        // Fetch file status for each model with HuggingFace config
        for (const model of modelsList) {
          if (model.huggingface) {
            fetchModelFilesStatus(model.id);
          }
        }
      } else {
        throw new Error("Failed to fetch models");
      }
    } catch (error) {
      console.error("Error fetching models:", error);
      addToast("Error", "Failed to load models", "destructive");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [addToast]);

  // Fetch model files status
  const fetchModelFilesStatus = useCallback(async (modelId) => {
    try {
      const response = await fetch(`/api/models/${modelId}/files/status`);
      if (response.ok) {
        const data = await response.json();
        setModelFilesStatus(prev => ({
          ...prev,
          [modelId]: data
        }));
      }
    } catch (error) {
      console.error("Error fetching model files status:", error);
    }
  }, []);

  // Refresh model statuses
  const refreshModels = async () => {
    setIsRefreshing(true);
    await fetchModels();
  };

  // Start a model
  const startModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "starting" }));
    try {
      const response = await fetch(`/api/models/${modelId}/start`, {
        method: "POST",
      });
      if (response.ok) {
        addToast("Success", `Model ${modelId} is starting`, "default");
        await fetchModels();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start model");
      }
    } catch (error) {
      console.error("Error starting model:", error);
      addToast("Error", error.message, "destructive");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Stop a model
  const stopModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "stopping" }));
    try {
      const response = await fetch(`/api/models/${modelId}/stop`, {
        method: "POST",
      });
      if (response.ok) {
        addToast("Success", `Model ${modelId} is stopping`, "default");
        await fetchModels();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to stop model");
      }
    } catch (error) {
      console.error("Error stopping model:", error);
      addToast("Error", error.message, "destructive");
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Download a model
  const downloadModel = async (modelId) => {
    const model = models.find((m) => m.id === modelId);
    setSelectedModel(model);
    setShowDownloadDialog(true);
    setDownloadProgress({ status: DOWNLOAD_STATUS.PENDING, progress: 0 });

    try {
      // Use the new endpoint that uses model config
      const response = await fetch(`/api/models/${modelId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setDownloadProgress({
          status: DOWNLOAD_STATUS.DOWNLOADING,
          jobId: data.downloadId,
          progress: 0,
          modelName: model.name,
          repo: data.repo,
        });

        // Poll for download progress
        pollDownloadProgress(data.downloadId, modelId);
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }
    } catch (error) {
      console.error("Error downloading model:", error);
      setDownloadProgress({ status: DOWNLOAD_STATUS.FAILED, error: error.message });
      addToast("Error", error.message, "destructive");
    }
  };

  // Poll download progress
  const pollDownloadProgress = async (jobId, modelId) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/models/download/${jobId}`);
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
              addToast("Success", "Model downloaded successfully", "success");
              // Refresh file status for this model
              if (modelId) {
                fetchModelFilesStatus(modelId);
              }
              await fetchModels();
            }
          }
        }
      } catch (error) {
        console.error("Error polling download progress:", error);
        clearInterval(interval);
      }
    }, 1000);
  };

  // Cancel download
  const cancelDownload = async () => {
    if (downloadProgress?.jobId) {
      try {
        await fetch(`/api/models/download/${downloadProgress.jobId}`, {
          method: "DELETE",
        });
        setDownloadProgress({ status: DOWNLOAD_STATUS.CANCELLED });
        addToast("Cancelled", "Download cancelled", "default");
      } catch (error) {
        console.error("Error cancelling download:", error);
      }
    }
    setShowDownloadDialog(false);
  };

  // Show model details
  const showModelDetails = (model) => {
    setSelectedModel(model);
    setShowDetailsDialog(true);
  };

  // Get status config
  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG[MODEL_STATUS.STOPPED];
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchModels();
    const interval = setInterval(fetchModels, 5000);
    return () => clearInterval(interval);
  }, [fetchModels]);

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
      <Card>
        <CardContent className="py-12">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Model Manager
              </CardTitle>
              <CardDescription>
                Manage and monitor Stable Diffusion models
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refreshModels}
              disabled={isRefreshing}
            >
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {models.length === 0 ? (
            <div className="text-center py-12">
              <Server className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No models configured</h3>
              <p className="text-muted-foreground">
                Add models to your models.yml configuration file
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Model
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Status
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Mode
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Type
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">
                      Port
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((model) => {
                    const statusConfig = getStatusConfig(model.status);
                    const StatusIcon = statusConfig.icon;
                    const isLoadingAction =
                      actionInProgress[model.id] === "starting" ||
                      actionInProgress[model.id] === "stopping";
                    const canStart =
                      model.status === MODEL_STATUS.STOPPED ||
                      model.status === MODEL_STATUS.ERROR;
                    const canStop = model.status === MODEL_STATUS.RUNNING;

                    return (
                      <tr key={model.id} className="border-b border-border hover:bg-muted/50">
                        <td className="py-4 px-4">
                          <div>
                            <div className="font-medium">{model.name || model.id}</div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {model.description}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={statusConfig.color} className="gap-1.5">
                            <StatusIcon
                              className={cn(
                                "h-3 w-3",
                                statusConfig.animate && "animate-spin"
                              )}
                            />
                            {statusConfig.label}
                          </Badge>
                          {model.status === MODEL_STATUS.ERROR && model.error && (
                            <div className="text-xs text-destructive mt-1">{model.error}</div>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <Badge
                            variant={model.mode === "preload" ? "default" : "secondary"}
                          >
                            {model.mode === "preload" ? "Preload" : "On Demand"}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant="outline" className="gap-1.5">
                            {model.exec_mode === "cli" ? (
                              <Terminal className="h-3 w-3" />
                            ) : (
                              <Server className="h-3 w-3" />
                            )}
                            {model.exec_mode === "cli" ? "CLI" : "Server"}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <span className="font-mono text-sm">
                            {model.port || "-"}
                          </span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            {model.huggingface && modelFilesStatus[model.id] && !modelFilesStatus[model.id].allFilesExist ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => downloadModel(model.id)}
                                className="gap-1.5"
                                title={`Missing files: ${modelFilesStatus[model.id].files.filter(f => !f.exists).map(f => f.fileName).join(", ")}`}
                              >
                                <Download className="h-3.5 w-3.5" />
                                Download
                              </Button>
                            ) : model.exec_mode === "cli" ? (
                              <Badge variant="secondary" className="gap-1.5">
                                <Terminal className="h-3 w-3" />
                                CLI Mode (on-demand)
                              </Badge>
                            ) : model.status === MODEL_STATUS.RUNNING ? (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => stopModel(model.id)}
                                disabled={isLoadingAction}
                                className="gap-1.5"
                              >
                                {isLoadingAction ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <StopCircle className="h-3.5 w-3.5" />
                                )}
                                Unload
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant={model.status === MODEL_STATUS.STARTING ? "secondary" : "default"}
                                onClick={() => startModel(model.id)}
                                disabled={isLoadingAction || model.status === MODEL_STATUS.STARTING || model.status === MODEL_STATUS.STOPPING}
                                className="gap-1.5"
                              >
                                {isLoadingAction ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : model.status === MODEL_STATUS.STARTING ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Play className="h-3.5 w-3.5" />
                                )}
                                Load
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => showModelDetails(model)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Model Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Model Details
            </DialogTitle>
            <DialogDescription>
              View and manage model configuration
            </DialogDescription>
          </DialogHeader>
          {selectedModel && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="space-y-3">
                <h3 className="font-semibold">Basic Information</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">ID:</span>
                    <p className="font-mono mt-1">{selectedModel.id}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="mt-1">{selectedModel.name}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Description:</span>
                    <p className="mt-1">{selectedModel.description}</p>
                  </div>
                </div>
              </div>

              {/* Status */}
              <div className="space-y-3">
                <h3 className="font-semibold">Status</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Current Status:</span>
                    <div className="mt-1">
                      <Badge variant={getStatusConfig(selectedModel.status).color}>
                        {getStatusConfig(selectedModel.status).label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Downloaded:</span>
                    <div className="mt-1">
                      <Badge variant={selectedModel.downloaded ? "success" : "secondary"}>
                        {selectedModel.downloaded ? "Yes" : "No"}
                      </Badge>
                    </div>
                  </div>
                  {selectedModel.pid && (
                    <div>
                      <span className="text-muted-foreground">Process ID:</span>
                      <p className="font-mono mt-1">{selectedModel.pid}</p>
                    </div>
                  )}
                  {selectedModel.port && (
                    <div>
                      <span className="text-muted-foreground">Port:</span>
                      <p className="font-mono mt-1">{selectedModel.port}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Configuration */}
              <div className="space-y-3">
                <h3 className="font-semibold">Configuration</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Mode:</span>
                    <div className="mt-1">
                      <Badge
                        variant={selectedModel.mode === "preload" ? "default" : "secondary"}
                      >
                        {selectedModel.mode === "preload" ? "Preload" : "On Demand"}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Execution Mode:</span>
                    <div className="mt-1">
                      <Badge variant="outline" className="gap-1.5">
                        {selectedModel.exec_mode === "cli" ? (
                          <Terminal className="h-3 w-3" />
                        ) : (
                          <Server className="h-3 w-3" />
                        )}
                        {selectedModel.exec_mode === "cli" ? "CLI" : "Server"}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>

              {/* Command */}
              <div className="space-y-3">
                <h3 className="font-semibold">Command</h3>
                <div className="bg-muted rounded-md p-3">
                  <code className="text-sm font-mono break-all">
                    {selectedModel.command}
                  </code>
                </div>
                {selectedModel.args && selectedModel.args.length > 0 && (
                  <div className="bg-muted rounded-md p-3">
                    <div className="text-xs text-muted-foreground mb-2">Arguments:</div>
                    <code className="text-xs font-mono break-all">
                      {selectedModel.args.join(" ")}
                    </code>
                  </div>
                )}
              </div>

              {/* API Endpoint */}
              {selectedModel.api && (
                <div className="space-y-3">
                  <h3 className="font-semibold">API Endpoint</h3>
                  <div className="bg-muted rounded-md p-3">
                    <code className="text-sm font-mono break-all">
                      {selectedModel.api}
                    </code>
                  </div>
                </div>
              )}

              {/* HuggingFace Info */}
              {selectedModel.huggingface && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    HuggingFace
                  </h3>
                  <div className="text-sm">
                    <div>
                      <span className="text-muted-foreground">Repository:</span>
                      <p className="font-mono mt-1">{selectedModel.huggingface.repo}</p>
                    </div>
                    {selectedModel.huggingface.files && (
                      <div className="mt-3">
                        <span className="text-muted-foreground">Files:</span>
                        <ul className="mt-2 space-y-1">
                          {selectedModel.huggingface.files.map((file, idx) => (
                            <li key={idx} className="font-mono text-xs bg-muted p-2 rounded">
                              {file.path} → {file.dest}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Download Path */}
              {selectedModel.download_path && (
                <div className="space-y-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    Storage
                  </h3>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Download Path:</span>
                    <p className="font-mono mt-1 text-xs break-all">{selectedModel.download_path}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Download Progress Dialog */}
      <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Download Model
            </DialogTitle>
            <DialogDescription>
              {selectedModel?.name || selectedModel?.id}
            </DialogDescription>
          </DialogHeader>
          {downloadProgress && (
            <div className="space-y-4">
              {downloadProgress.status === DOWNLOAD_STATUS.PENDING && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}

              {downloadProgress.status === DOWNLOAD_STATUS.DOWNLOADING && (
                <div className="space-y-4">
                  <Progress value={downloadProgress.progress * 100} className="h-3" />
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {Math.round(downloadProgress.progress * 100)}%
                    </span>
                    <div className="text-right">
                      {downloadProgress.bytesDownloaded && downloadProgress.totalBytes && (
                        <div className="font-mono">
                          {formatBytes(downloadProgress.bytesDownloaded)} /{" "}
                          {formatBytes(downloadProgress.totalBytes)}
                        </div>
                      )}
                      {downloadProgress.speed && (
                        <div className="text-muted-foreground text-xs">
                          {formatSpeed(downloadProgress.speed)}
                          {downloadProgress.eta && ` • ${formatETA(downloadProgress.eta)} left`}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {downloadProgress.status === DOWNLOAD_STATUS.COMPLETED && (
                <div className="flex flex-col items-center py-8 text-center">
                  <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Download Complete!</h3>
                  <p className="text-muted-foreground">
                    The model has been downloaded and is ready to use.
                  </p>
                </div>
              )}

              {downloadProgress.status === DOWNLOAD_STATUS.FAILED && (
                <div className="flex flex-col items-center py-8 text-center">
                  <XCircle className="h-16 w-16 text-red-500 mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Download Failed</h3>
                  <p className="text-destructive">{downloadProgress.error}</p>
                </div>
              )}

              {downloadProgress.status === DOWNLOAD_STATUS.CANCELLED && (
                <div className="flex flex-col items-center py-8 text-center">
                  <Circle className="h-16 w-16 text-muted-foreground mb-4" />
                  <h3 className="font-semibold text-lg mb-2">Download Cancelled</h3>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            {downloadProgress?.status === DOWNLOAD_STATUS.DOWNLOADING && (
              <Button variant="destructive" onClick={cancelDownload}>
                Cancel Download
              </Button>
            )}
            {downloadProgress?.status === DOWNLOAD_STATUS.COMPLETED && (
              <Button onClick={() => setShowDownloadDialog(false)}>Done</Button>
            )}
            {downloadProgress?.status === DOWNLOAD_STATUS.FAILED && (
              <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
                Close
              </Button>
            )}
            {downloadProgress?.status === DOWNLOAD_STATUS.CANCELLED && (
              <Button variant="outline" onClick={() => setShowDownloadDialog(false)}>
                Close
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
