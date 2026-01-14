import { useState, useEffect, useCallback, useRef } from "react";
import { X, Download, Pause, Play, RotateCcw, AlertCircle, Check, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { cn } from "../lib/utils.jsx";

/**
 * ModelDownload Component
 *
 * A dialog component for displaying and managing model download progress.
 *
 * @param {Object} props
 * @param {boolean} props.open - Whether the dialog is open
 * @param {Function} props.onOpenChange - Callback when dialog open state changes
 * @param {Object} props.download - Download status object
 * @param {string} props.download.id - Download job ID
 * @param {string} props.download.modelId - Model ID being downloaded
 * @param {string} props.download.modelName - Display name of the model
 * @param {string} props.download.repo - HuggingFace repo name
 * @param {string} props.download.status - Status: pending, downloading, paused, completed, failed, cancelled
 * @param {number} props.download.progress - Progress percentage (0-100)
 * @param {number} props.download.bytesDownloaded - Total bytes downloaded
 * @param {number} props.download.totalBytes - Total bytes to download
 * @param {number} props.download.speed - Current download speed in bytes/second
 * @param {number} props.download.eta - Estimated time to completion in seconds
 * @param {Array} props.download.files - Array of file download statuses
 * @param {string} props.download.error - Error message if failed
 * @param {Function} props.onCancel - Callback when cancel button is clicked
 * @param {Function} props.onPause - Callback when pause button is clicked
 * @param {Function} props.onResume - Callback when resume button is clicked
 * @param {Function} props.onRetry - Callback when retry button is clicked
 * @param {Function} props.onClose - Callback when close button is clicked
 */
export function ModelDownload({
  open,
  onOpenChange,
  download = null,
  onCancel,
  onPause,
  onResume,
  onRetry,
  onClose,
}) {
  const autoCloseTimerRef = useRef(null);
  const [showAutoCloseMessage, setShowAutoCloseMessage] = useState(false);

  // Auto-close when download completes
  useEffect(() => {
    // Clear any existing timer
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    setShowAutoCloseMessage(false);

    if (download?.status === "completed" && open) {
      setShowAutoCloseMessage(true);
      autoCloseTimerRef.current = setTimeout(() => {
        setShowAutoCloseMessage(false);
        handleAutoClose();
      }, 3000); // Auto-close after 3 seconds
    }

    return () => {
      if (autoCloseTimerRef.current) {
        clearTimeout(autoCloseTimerRef.current);
        autoCloseTimerRef.current = null;
      }
      setShowAutoCloseMessage(false);
    };
  }, [download?.status, open]);

  const handleAutoClose = () => {
    if (onClose) {
      onClose();
    } else {
      onOpenChange(false);
    }
  };

  const handleCancel = () => {
    if (onCancel && download) {
      onCancel(download.id);
    }
  };

  const handlePause = () => {
    if (onPause && download) {
      onPause(download.id);
    }
  };

  const handleResume = () => {
    if (onResume && download) {
      onResume(download.id);
    }
  };

  const handleRetry = () => {
    if (onRetry && download) {
      onRetry(download.id);
    }
  };

  const handleClose = () => {
    // Prevent closing if download is in progress
    if (download?.status === "downloading") {
      return;
    }

    if (onClose) {
      onClose();
    } else {
      onOpenChange(false);
    }
  };

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0 || !bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  // Format speed to human readable
  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond || bytesPerSecond === 0) return "0 B/s";
    return formatBytes(bytesPerSecond) + "/s";
  };

  // Format ETA to human readable
  const formatETA = (seconds) => {
    if (!seconds || seconds === Infinity || seconds < 0) return "--:--";

    if (seconds < 60) {
      return `${Math.floor(seconds)}s`;
    } else if (seconds < 3600) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}m ${secs}s`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      return `${hours}h ${mins}m`;
    }
  };

  // Get status icon
  const getStatusIcon = () => {
    switch (download?.status) {
      case "pending":
        return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />;
      case "downloading":
        return <Download className="h-5 w-5 text-primary animate-bounce" />;
      case "paused":
        return <Pause className="h-5 w-5 text-yellow-500" />;
      case "completed":
        return <Check className="h-5 w-5 text-green-500" />;
      case "failed":
        return <AlertCircle className="h-5 w-5 text-destructive" />;
      case "cancelled":
        return <X className="h-5 w-5 text-muted-foreground" />;
      default:
        return null;
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (download?.status) {
      case "pending":
        return "Starting download...";
      case "downloading":
        return "Downloading...";
      case "paused":
        return "Paused";
      case "completed":
        return "Download complete!";
      case "failed":
        return "Download failed";
      case "cancelled":
        return "Download cancelled";
      default:
        return "";
    }
  };

  // Get progress bar color based on status
  const getProgressColor = () => {
    switch (download?.status) {
      case "failed":
        return "bg-destructive";
      case "completed":
        return "bg-green-500";
      case "paused":
        return "bg-yellow-500";
      default:
        return "bg-primary";
    }
  };

  // Check if download can be cancelled
  const canCancel = () => {
    return download?.status === "pending" || download?.status === "downloading" || download?.status === "paused";
  };

  // Check if pause/resume is available
  const canPause = () => {
    return download?.status === "downloading";
  };

  const canResume = () => {
    return download?.status === "paused";
  };

  const canRetry = () => {
    return download?.status === "failed";
  };

  const canClose = () => {
    return download?.status !== "downloading" && download?.status !== "pending";
  };

  if (!download) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center gap-3">
            {getStatusIcon()}
            <div className="flex-1">
              <DialogTitle className="text-lg">{download.modelName || "Model Download"}</DialogTitle>
              <DialogDescription className="text-xs font-mono mt-1">
                {download.repo}
              </DialogDescription>
            </div>
            {(canClose() || download.status === "completed") && (
              <button
                onClick={handleClose}
                className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </button>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Status Text */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">{getStatusText()}</span>
            <span className="text-sm font-medium">{download.progress?.toFixed(1) || 0}%</span>
          </div>

          {/* Progress Bar */}
          <div className="relative">
            <Progress
              value={download.progress || 0}
              className={cn("h-3", download.status === "failed" && "bg-destructive/20")}
            />
            {download.status === "downloading" && (
              <div className="absolute inset-0 h-full w-full animate-pulse bg-primary/10 rounded-full pointer-events-none" />
            )}
          </div>

          {/* Download Stats */}
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Downloaded</p>
              <p className="text-sm font-medium">
                {formatBytes(download.bytesDownloaded || 0)} / {formatBytes(download.totalBytes || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">Speed</p>
              <p className="text-sm font-medium">
                {download.status === "downloading" ? formatSpeed(download.speed) : "--"}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">ETA</p>
              <p className="text-sm font-medium">
                {download.status === "downloading" ? formatETA(download.eta) : "--"}
              </p>
            </div>
          </div>

          {/* Error Display */}
          {download.status === "failed" && download.error && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-destructive">Download Error</p>
                <p className="text-xs text-muted-foreground mt-1">{download.error}</p>
              </div>
            </div>
          )}

          {/* Multiple File Progress */}
          {download.files && download.files.length > 1 && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">Files</p>
              <div className="space-y-1.5 max-h-32 overflow-y-auto">
                {download.files.map((file, index) => (
                  <div key={index} className="flex items-center gap-2 text-xs">
                    <div className="flex-1 truncate" title={file.path}>
                      {file.path}
                    </div>
                    <div className="flex-shrink-0 w-16 text-right">
                      {file.status === "completed" ? (
                        <Check className="h-3 w-3 text-green-500 inline" />
                      ) : file.status === "downloading" ? (
                        <Loader2 className="h-3 w-3 animate-spin text-primary inline" />
                      ) : file.status === "failed" ? (
                        <AlertCircle className="h-3 w-3 text-destructive inline" />
                      ) : file.status === "pending" ? (
                        <span className="text-muted-foreground">Waiting</span>
                      ) : null}
                    </div>
                    <div className="flex-shrink-0 w-12 text-right">
                      {file.progress !== undefined ? `${file.progress.toFixed(0)}%` : "--"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Auto-close countdown for completed downloads */}
          {download.status === "completed" && showAutoCloseMessage && (
            <div className="text-center text-xs text-muted-foreground">
              Closing automatically in 3 seconds...
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {canCancel() && (
            <Button variant="destructive" onClick={handleCancel} size="sm">
              <X className="h-4 w-4" />
              Cancel
            </Button>
          )}

          {canPause() && (
            <Button variant="secondary" onClick={handlePause} size="sm">
              <Pause className="h-4 w-4" />
              Pause
            </Button>
          )}

          {canResume() && (
            <Button variant="secondary" onClick={handleResume} size="sm">
              <Play className="h-4 w-4" />
              Resume
            </Button>
          )}

          {canRetry() && (
            <Button variant="default" onClick={handleRetry} size="sm">
              <RotateCcw className="h-4 w-4" />
              Retry
            </Button>
          )}

          {canClose() && download.status !== "completed" && (
            <Button variant="outline" onClick={handleClose} size="sm">
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Hook for managing model download dialog state
 * @returns {Object} Download dialog state and handlers
 */
export function useModelDownload() {
  const [isOpen, setIsOpen] = useState(false);
  const [download, setDownload] = useState(null);

  const openDownload = (downloadData) => {
    setDownload(downloadData);
    setIsOpen(true);
  };

  const closeDownload = () => {
    setIsOpen(false);
  };

  const updateDownload = (updates) => {
    setDownload((prev) => ({ ...prev, ...updates }));
  };

  return {
    isOpen,
    download,
    openDownload,
    closeDownload,
    updateDownload,
    setIsOpen,
  };
}

export default ModelDownload;
