import { memo } from "react";
import {
  Download,
  Sparkles,
  Edit3,
  Trash2,
  ChevronRight,
  Loader2,
  Clock,
  Cpu,
  XCircle,
  CheckCircle2,
  RefreshCw,
  X,
  Terminal,
  Image as ImageIcon,
} from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { cn } from "../../lib/utils";
import { LightboxWithImage } from "../Lightbox";

// Generation status constants
const GENERATION_STATUS = {
  PENDING: "pending",
  MODEL_LOADING: "model_loading",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const STATUS_CONFIG = {
  [GENERATION_STATUS.PENDING]: {
    icon: Clock,
    label: "Queued",
    animate: false,
  },
  [GENERATION_STATUS.MODEL_LOADING]: {
    icon: Cpu,
    label: "Loading Model",
    animate: true,
  },
  [GENERATION_STATUS.PROCESSING]: {
    icon: Loader2,
    label: "Generating",
    animate: true,
  },
  [GENERATION_STATUS.COMPLETED]: {
    icon: CheckCircle2,
    label: "Completed",
    animate: false,
  },
  [GENERATION_STATUS.FAILED]: {
    icon: XCircle,
    label: "Failed",
    animate: false,
  },
  [GENERATION_STATUS.CANCELLED]: {
    icon: XCircle,
    label: "Cancelled",
    animate: false,
  },
};

const isPendingOrProcessing = (status) => {
  return (
    status === GENERATION_STATUS.PENDING ||
    status === GENERATION_STATUS.MODEL_LOADING ||
    status === GENERATION_STATUS.PROCESSING
  );
};

/**
 * ImageCard - Redesigned card for displaying a generation in the gallery
 *
 * @param {Object} props
 * @param {Object} props.generation - Generation data
 * @param {string} props.modelName - Display name for the model
 * @param {function} props.onDownload - Download handler
 * @param {function} props.onIterate - Create more like this handler
 * @param {function} props.onEdit - Edit image handler
 * @param {function} props.onDelete - Delete handler
 * @param {function} props.onViewDetails - View details/info handler
 * @param {function} props.onViewLogs - View logs handler
 * @param {function} props.onCancel - Cancel pending job handler
 * @param {function} props.onRetry - Retry failed generation handler
 */
export const ImageCard = memo(function ImageCard({
  generation,
  modelName,
  onDownload,
  onIterate,
  onEdit,
  onDelete,
  onViewDetails,
  onViewLogs,
  onCancel,
  onRetry,
}) {
  const status = generation.status;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG[GENERATION_STATUS.PENDING];
  const StatusIcon = config.icon;
  const isActive = isPendingOrProcessing(status);
  const isCompleted = status === GENERATION_STATUS.COMPLETED;
  const isFailed = status === GENERATION_STATUS.FAILED || status === GENERATION_STATUS.CANCELLED;
  const imageCount = generation.image_count || 0;
  const src = generation.first_image_url || null;

  // Render thumbnail content based on status
  const renderThumbnail = () => {
    // Active generation - show status
    if (isActive) {
      return (
        <div className="aspect-square bg-muted rounded-t-lg flex flex-col items-center justify-center">
          <StatusIcon
            className={cn(
              "h-8 w-8 text-muted-foreground mb-2",
              config.animate && "animate-spin"
            )}
          />
          <span className="text-xs text-muted-foreground">{config.label}</span>
        </div>
      );
    }

    // Failed - show error state
    if (isFailed) {
      return (
        <div className="aspect-square bg-destructive/10 rounded-t-lg flex flex-col items-center justify-center p-4">
          <XCircle className="h-8 w-8 text-destructive mb-3" />
          <span className="text-xs text-destructive mb-2">
            {status === GENERATION_STATUS.FAILED ? "Failed" : "Cancelled"}
          </span>
          {generation.error && (
            <span className="text-xs text-destructive/70 text-center line-clamp-2 mb-2">
              {generation.error}
            </span>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onViewLogs?.(generation);
            }}
            className="text-xs"
          >
            <Terminal className="h-3 w-3 mr-1" />
            View Logs
          </Button>
        </div>
      );
    }

    // No image available
    if (!src) {
      return (
        <div className="aspect-square bg-muted rounded-t-lg flex items-center justify-center">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      );
    }

    // Completed with image
    return (
      <div className="relative aspect-square">
        <LightboxWithImage
          small={src}
          large={src}
          alt={generation.prompt || "Generated image"}
          fileName={generation.prompt?.slice(0, 50) || "image"}
          hideDownload={false}
          hideZoom={false}
          className="w-full h-full object-cover rounded-t-lg"
        />
        {imageCount > 1 && (
          <Badge
            variant="secondary"
            className="absolute bottom-2 right-2 bg-black/70 text-white border-0 text-xs"
          >
            +{imageCount - 1}
          </Badge>
        )}
      </div>
    );
  };

  return (
    <Card className="overflow-hidden group">
      {/* Thumbnail */}
      {renderThumbnail()}

      <CardContent className="p-3 space-y-2">
        {/* Prompt text - truncated */}
        <p className="text-sm line-clamp-2 min-h-[2.5rem]">
          {generation.prompt || "No prompt"}
        </p>

        {/* Action buttons row */}
        <div className="flex items-center gap-1">
          {isActive ? (
            // Cancel button for active jobs
            <Button
              variant="destructive"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onCancel?.(generation.id);
              }}
            >
              <X className="h-3 w-3 mr-1" />
              Cancel
            </Button>
          ) : isFailed ? (
            // Retry button for failed
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={(e) => {
                e.stopPropagation();
                onRetry?.(generation);
              }}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Retry
            </Button>
          ) : (
            // Action buttons for completed
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDownload?.(generation.id);
                    }}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Download</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    size="icon"
                    className="h-8 w-8 bg-primary/90 hover:bg-primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      onIterate?.(generation);
                    }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create more like this</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEdit?.(generation);
                    }}
                  >
                    <Edit3 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Edit image</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(generation.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Delete</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails?.(generation);
                    }}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View details</TooltipContent>
              </Tooltip>
            </>
          )}
        </div>

        {/* Model name badge */}
        {modelName && (
          <div className="pt-1 border-t border-border/50">
            <p className="text-xs text-muted-foreground truncate">{modelName}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
},
(prevProps, nextProps) => {
  return (
    prevProps.generation.id === nextProps.generation.id &&
    prevProps.generation.status === nextProps.generation.status &&
    prevProps.generation.first_image_url === nextProps.generation.first_image_url &&
    prevProps.modelName === nextProps.modelName
  );
});

export default ImageCard;
