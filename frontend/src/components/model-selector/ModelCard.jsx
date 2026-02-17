import { useState } from "react";
import {
  Play,
  Square,
  Download,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Circle,
  Cpu,
  Sparkles,
} from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Checkbox } from "../ui/checkbox";
import { cn } from "../../lib/utils";
import { Progress } from "../ui/progress";

// Model status constants
const MODEL_STATUS = {
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  ERROR: "error",
};

/**
 * ModelCard - Card component for displaying a model in the selector
 *
 * @param {Object} props
 * @param {Object} props.model - Model data object
 * @param {boolean} props.isSelected - Whether this model is selected
 * @param {function} props.onSelect - Callback when model is selected/deselected
 * @param {function} props.onStart - Callback to start the model
 * @param {function} props.onStop - Callback to stop the model
 * @param {function} props.onDownload - Callback to download the model
 * @param {boolean} props.isActionInProgress - Whether an action is in progress
 * @param {string} props.actionType - Type of action in progress ('starting', 'stopping')
 * @param {Object} props.downloadProgress - Download progress info
 * @param {Object} props.filesStatus - File status for the model
 */
export function ModelCard({
  model,
  isSelected,
  onSelect,
  onStart,
  onStop,
  onDownload,
  isActionInProgress,
  actionType,
  downloadProgress,
  filesStatus,
}) {
  const isServerMode = model.exec_mode === "server";
  const isCliMode = model.exec_mode === "cli";
  const hasMissingFiles = filesStatus && !filesStatus.allFilesExist;
  const isRunning = model.status === MODEL_STATUS.RUNNING;
  const isStarting = model.status === MODEL_STATUS.STARTING;
  const isStopping = model.status === MODEL_STATUS.STOPPING;
  const isError = model.status === MODEL_STATUS.ERROR;

  // Get capability badges
  const getCapabilityBadges = () => {
    const badges = [];
    if (model.capabilities?.includes("text-to-image")) {
      badges.push({ label: "Text to Image", variant: "secondary" });
    }
    if (model.capabilities?.includes("image-to-image")) {
      badges.push({ label: "Image Ref", variant: "outline" });
    }
    if (model.capabilities?.includes("imgedit")) {
      badges.push({ label: "Edit", variant: "outline" });
    }
    if (model.capabilities?.includes("video")) {
      badges.push({ label: "Video", variant: "secondary" });
    }
    return badges;
  };

  const badges = getCapabilityBadges();

  return (
    <div
      className={cn(
        "relative flex items-start gap-3 p-3 rounded-lg border transition-all cursor-pointer",
        isSelected
          ? "bg-primary/10 border-primary/50 ring-1 ring-primary/20"
          : "bg-card border-border hover:bg-muted/50 hover:border-muted-foreground/30",
        hasMissingFiles && "opacity-70"
      )}
      onClick={() => onSelect?.()}
    >
      {/* Selection checkbox */}
      <div className="flex-shrink-0 pt-0.5">
        <Checkbox
          checked={isSelected}
          onChange={() => onSelect?.()}
          className="pointer-events-none"
        />
      </div>

      {/* Model icon/avatar */}
      <div className="flex-shrink-0">
        <div
          className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center",
            isSelected ? "bg-primary/20" : "bg-muted"
          )}
        >
          {isRunning ? (
            <Sparkles className="h-6 w-6 text-primary" />
          ) : (
            <Cpu className="h-6 w-6 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Model info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <h4 className="font-medium truncate">{model.name}</h4>
          {model.isNew && (
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs px-1.5 py-0">
              New
            </Badge>
          )}
          {isCliMode && (
            <Badge variant="outline" className="text-xs px-1.5 py-0">
              CLI
            </Badge>
          )}
        </div>

        {model.description && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
            {model.description}
          </p>
        )}

        {/* Capability badges */}
        {badges.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2">
            {badges.map((badge, idx) => (
              <Badge
                key={idx}
                variant={badge.variant}
                className="text-xs px-1.5 py-0"
              >
                {badge.label}
              </Badge>
            ))}
          </div>
        )}

        {/* Download progress */}
        {downloadProgress && downloadProgress.modelId === model.id && (
          <div className="mt-2">
            <Progress value={downloadProgress.progress * 100} className="h-1.5" />
            <p className="text-xs text-muted-foreground mt-1">
              Downloading... {Math.round(downloadProgress.progress * 100)}%
            </p>
          </div>
        )}

        {/* Missing files warning */}
        {hasMissingFiles && !downloadProgress && (
          <p className="text-xs text-amber-500 flex items-center gap-1 mt-1">
            <AlertCircle className="h-3 w-3" />
            Missing files
          </p>
        )}
      </div>

      {/* Status and actions */}
      <div className="flex-shrink-0 flex flex-col items-end gap-2">
        {/* Status indicator */}
        <div className="flex items-center gap-1.5">
          {isStarting || isStopping ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
              <span className="text-xs text-muted-foreground">
                {isStarting ? "Starting..." : "Stopping..."}
              </span>
            </>
          ) : isError ? (
            <>
              <AlertCircle className="h-3 w-3 text-red-500" />
              <span className="text-xs text-destructive">Error</span>
            </>
          ) : isRunning ? (
            <>
              <CheckCircle2 className="h-3 w-3 text-green-500" />
              <span className="text-xs text-green-500 font-medium">Running</span>
            </>
          ) : (
            <>
              <Circle className="h-3 w-3 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Stopped</span>
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {hasMissingFiles && model.huggingface && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDownload?.(model.id)}
              disabled={!!downloadProgress}
              className="h-7 text-xs"
            >
              <Download className="h-3 w-3 mr-1" />
              Download
            </Button>
          )}

          {isServerMode && model.mode === "on_demand" && !hasMissingFiles && (
            <>
              {isRunning ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStop?.(model.id)}
                  disabled={isActionInProgress && actionType === "stopping"}
                  className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                >
                  {isActionInProgress && actionType === "stopping" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Square className="h-3.5 w-3.5" />
                  )}
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onStart?.(model.id)}
                  disabled={isActionInProgress && actionType === "starting"}
                  className="h-7 w-7 p-0 text-green-500 hover:text-green-500"
                >
                  {isActionInProgress && actionType === "starting" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ModelCard;
