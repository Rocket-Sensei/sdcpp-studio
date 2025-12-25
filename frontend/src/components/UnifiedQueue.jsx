import { useEffect, useState, useCallback, memo, useRef, useMemo } from "react";
import {
  Loader2,
  Trash2,
  Download,
  Image as ImageIcon,
  Eye,
  Calendar,
  Box,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Sparkles,
  X,
  Clock,
  XCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { LogViewer } from "./LogViewer";
import { useGenerations } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { useWebSocket, WS_CHANNELS } from "../contexts/WebSocketContext";
import { formatDate } from "../lib/utils";
import { authenticatedFetch } from "../utils/api";

const GENERATION_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const STATUS_CONFIG = {
  [GENERATION_STATUS.PENDING]: {
    icon: Clock,
    label: "Queued",
    color: "secondary",
  },
  [GENERATION_STATUS.PROCESSING]: {
    icon: Loader2,
    label: "Processing",
    color: "default",
    animate: true,
  },
  [GENERATION_STATUS.COMPLETED]: {
    icon: CheckCircle2,
    label: "Completed",
    color: "outline",
    variant: "success",
  },
  [GENERATION_STATUS.FAILED]: {
    icon: XCircle,
    label: "Failed",
    color: "destructive",
  },
  [GENERATION_STATUS.CANCELLED]: {
    icon: XCircle,
    label: "Cancelled",
    color: "secondary",
  },
};

// Helper functions - defined outside component to avoid recreation on each render
const getStatusConfig = (status) => {
  return STATUS_CONFIG[status] || STATUS_CONFIG[GENERATION_STATUS.PENDING];
};

const isPendingOrProcessing = (status) => {
  return status === GENERATION_STATUS.PENDING || status === GENERATION_STATUS.PROCESSING;
};

// Thumbnail component moved outside parent to prevent remounting on parent re-renders
// Using memo to prevent unnecessary re-renders when generation props haven't changed
const Thumbnail = memo(function Thumbnail({ generation, onViewLogs }) {
  // Use first_image_url directly from the list data - no additional API calls needed
  const src = generation.first_image_url || null;
  const imageCount = generation.image_count || 0;

  // Show preloader for pending/processing generations
  if (isPendingOrProcessing(generation.status)) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-2" />
        <span className="text-xs text-muted-foreground">Generating...</span>
      </div>
    );
  }

  // Show failed state with View Logs button
  if (generation.status === GENERATION_STATUS.FAILED || generation.status === GENERATION_STATUS.CANCELLED) {
    return (
      <div className="aspect-square bg-destructive/10 rounded-lg flex flex-col items-center justify-center p-4">
        <XCircle className="h-8 w-8 text-destructive mb-3" />
        <span className="text-xs text-destructive mb-3">
          {generation.status === GENERATION_STATUS.FAILED ? "Failed" : "Cancelled"}
        </span>
        {generation.error && (
          <span className="text-xs text-destructive/70 mb-3 text-center line-clamp-2">
            {generation.error}
          </span>
        )}
        <Button
          variant="outline"
          size="sm"
          onClick={() => onViewLogs && onViewLogs(generation)}
          className="text-xs"
        >
          <Terminal className="h-3 w-3 mr-1" />
          View Logs
        </Button>
      </div>
    );
  }

  if (!src) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex items-center justify-center">
        <ImageIcon className="h-8 w-8 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="relative">
      <img src={src} alt={generation.prompt} className="w-full h-full object-cover" loading="lazy" />
      {imageCount > 1 && (
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
          {imageCount}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for memo
  // Only re-render if these specific props change
  return (
    prevProps.generation.id === nextProps.generation.id &&
    prevProps.generation.status === nextProps.generation.status &&
    prevProps.generation.first_image_url === nextProps.generation.first_image_url
  );
});

export function UnifiedQueue({ onCreateMore }) {
  const { fetchGenerations, goToPage, nextPage, prevPage, isLoading, generations, pagination, currentPage } = useGenerations({ pageSize: 20 });
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [failedLogsGeneration, setFailedLogsGeneration] = useState(null);
  const [isFailedLogsOpen, setIsFailedLogsOpen] = useState(false);
  const [models, setModels] = useState({});

  // Use a ref to track fetchGenerations so the WebSocket onMessage callback doesn't change
  const fetchGenerationsRef = useRef(() => fetchGenerations(currentPage));
  useEffect(() => {
    fetchGenerationsRef.current = () => fetchGenerations(currentPage);
  }, [fetchGenerations, currentPage]);

  // Fetch models on mount to get model names
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await authenticatedFetch('/api/models');
        if (response.ok) {
          const data = await response.json();
          // Create a map of model ID to model name
          const modelMap = {};
          if (data.models) {
            data.models.forEach(model => {
              modelMap[model.id] = model.name || model.id;
            });
          }
          setModels(modelMap);
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    };
    fetchModels();
  }, []);

  // Helper function to get model name from model ID
  const getModelName = useCallback((modelId) => {
    if (!modelId) return 'Unknown Model';
    return models[modelId] || modelId;
  }, [models]);

  // WebSocket connection for real-time updates - use ref to keep callback stable
  // This prevents constant re-subscription
  const handleWebSocketMessage = useCallback((message) => {
    // Refresh generations when receiving relevant WebSocket messages
    if (message.channel === WS_CHANNELS.QUEUE) {
      // Queue updates: job_created, job_updated, job_completed, job_failed
      if (message.type === 'job_updated' ||
          message.type === 'job_completed' ||
          message.type === 'job_failed') {
        fetchGenerationsRef.current();
      }
    } else if (message.channel === WS_CHANNELS.GENERATIONS) {
      // Generation completions
      if (message.type === 'generation_complete') {
        fetchGenerationsRef.current();
      }
    }
  }, []); // No dependencies - uses ref instead

  // Stable WebSocket options using useMemo to prevent re-subscription on every render
  const webSocketOptions = useMemo(
    () => ({
      channels: [WS_CHANNELS.QUEUE, WS_CHANNELS.GENERATIONS],
      onMessage: handleWebSocketMessage,
    }),
    [] // Empty deps - options never change
  );

  useWebSocket(webSocketOptions);

  // Initial fetch on mount
  useEffect(() => {
    fetchGenerations();
  }, []); // Only fetch once on mount

  const handleCancel = async (id) => {
    try {
      const response = await authenticatedFetch(`/api/queue/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success("Generation cancelled");
        fetchGenerations();
      } else {
        throw new Error("Failed to cancel");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${id}`, {
        method: "DELETE",
      });
      if (response.ok) {
        toast.success("Generation deleted");
        fetchGenerations();
      } else {
        throw new Error("Failed to delete");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleRetry = async (generation) => {
    try {
      const endpoint = generation.type === 'edit'
        ? '/api/queue/edit'
        : generation.type === 'variation'
        ? '/api/queue/variation'
        : '/api/queue/generate';

      let body;
      let headers = {};

      if ((generation.type === 'edit' || generation.type === 'variation') && generation.input_image_path) {
        // For edit/variation, we need to send the image file
        // Since we only have the path, we'll need to fetch the image first
        const imageResponse = await fetch(generation.input_image_path);
        if (!imageResponse.ok) {
          throw new Error("Failed to fetch input image");
        }
        const blob = await imageResponse.blob();
        const file = new File([blob], 'input.png', { type: 'image/png' });

        const formData = new FormData();
        formData.append('image', file);
        formData.append('prompt', generation.prompt || '');
        formData.append('negative_prompt', generation.negative_prompt || '');
        formData.append('model', generation.model);
        formData.append('size', generation.size || '512x512');
        if (generation.seed) formData.append('seed', generation.seed);
        if (generation.cfg_scale) formData.append('cfg_scale', generation.cfg_scale);
        if (generation.sampling_method) formData.append('sampling_method', generation.sampling_method);
        if (generation.sample_steps) formData.append('sample_steps', generation.sample_steps);
        if (generation.clip_skip) formData.append('clip_skip', generation.clip_skip);

        body = formData;
      } else {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify({
          prompt: generation.prompt || '',
          negative_prompt: generation.negative_prompt || '',
          model: generation.model,
          size: generation.size || '512x512',
          seed: generation.seed,
          cfg_scale: generation.cfg_scale,
          sampling_method: generation.sampling_method,
          sample_steps: generation.sample_steps,
          clip_skip: generation.clip_skip,
        });
      }

      const response = await authenticatedFetch(endpoint, {
        method: 'POST',
        headers,
        body
      });

      if (response.ok) {
        toast.success("Generation requeued");
        fetchGenerations();
      } else {
        throw new Error("Failed to retry");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleViewImage = async (generation, imageIndex = 0) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${generation.id}`);
      if (!response.ok) throw new Error("Failed to fetch generation");

      const fullGeneration = await response.json();

      if (!fullGeneration.images || fullGeneration.images.length === 0) {
        toast.error("No images found");
        return;
      }

      const image = fullGeneration.images[imageIndex];

      setSelectedImage({
        ...generation,
        images: fullGeneration.images,
        currentImageIndex: imageIndex,
        // Use static_url directly, fallback to API endpoint if not available
        imageUrl: image.static_url || `/api/images/${image.id}`,
        width: image.width,
        height: image.height
      });
      setIsDialogOpen(true);
    } catch (err) {
      toast.error("Failed to load image");
    }
  };

  const handleDownload = async (generationId, imageIndex = 0) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${generationId}`);
      if (!response.ok) throw new Error("Failed to fetch generation");

      const generation = await response.json();

      if (!generation.images || generation.images.length === 0) {
        toast.error("No images found");
        return;
      }

      const image = generation.images[imageIndex];
      // Use static_url directly, fallback to API fetch if not available
      let blob;
      if (image.static_url) {
        const imageResponse = await fetch(image.static_url);
        if (!imageResponse.ok) throw new Error("Failed to download image");
        blob = await imageResponse.blob();
      } else {
        const imageResponse = await authenticatedFetch(`/api/images/${image.id}`);
        if (!imageResponse.ok) throw new Error("Failed to download image");
        blob = await imageResponse.blob();
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sd-generated-${generationId}-${imageIndex}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Image downloaded");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handlePreviousImage = () => {
    if (selectedImage && selectedImage.currentImageIndex > 0) {
      const newIndex = selectedImage.currentImageIndex - 1;
      const image = selectedImage.images[newIndex];
      setSelectedImage({
        ...selectedImage,
        currentImageIndex: newIndex,
        // Use static_url directly, fallback to API endpoint if not available
        imageUrl: image.static_url || `/api/images/${image.id}`
      });
    }
  };

  const handleNextImage = () => {
    if (selectedImage && selectedImage.currentImageIndex < selectedImage.images.length - 1) {
      const newIndex = selectedImage.currentImageIndex + 1;
      const image = selectedImage.images[newIndex];
      setSelectedImage({
        ...selectedImage,
        currentImageIndex: newIndex,
        // Use static_url directly, fallback to API endpoint if not available
        imageUrl: image.static_url || `/api/images/${image.id}`
      });
    }
  };

  const handleViewFailedLogs = (generation) => {
    setFailedLogsGeneration(generation);
    setIsFailedLogsOpen(true);
  };

  if (generations.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <ImageIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No generations yet</h3>
            <p className="text-muted-foreground">
              Generate your first image to see it here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {generations.map((generation) => {
          const config = getStatusConfig(generation.status);
          const StatusIcon = config.icon;
          const canCancel = isPendingOrProcessing(generation.status);

          return (
            <Card key={generation.id} className="overflow-hidden group">
              <div
                className="relative aspect-square cursor-pointer"
                onClick={() => {
                  if (generation.status === GENERATION_STATUS.COMPLETED) {
                    handleViewImage(generation, 0);
                  }
                }}
              >
                <Thumbnail generation={generation} onViewLogs={handleViewFailedLogs} />
                {generation.status === GENERATION_STATUS.COMPLETED && (
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewImage(generation, 0);
                      }}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <p className="text-sm line-clamp-2 flex-1">{generation.prompt || "No prompt"}</p>
                  <Badge variant={config.color} className="flex-shrink-0">
                    <StatusIcon className={`h-3 w-3 ${config.animate ? "animate-spin" : ""}`} />
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Calendar className="h-3 w-3" />
                  <span>{formatDate(generation.created_at)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                  <Cpu className="h-3 w-3" />
                  <span>{getModelName(generation.model)}</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                  <Box className="h-3 w-3" />
                  <span>{generation.size || "512x512"}</span>
                  {generation.seed && <span>• Seed: {Math.floor(Number(generation.seed))}</span>}
                </div>
                <div className="flex gap-2">
                  {canCancel ? (
                    // Cancel button for pending/processing
                    <Button
                      variant="destructive"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleCancel(generation.id)}
                    >
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </Button>
                  ) : generation.status === GENERATION_STATUS.COMPLETED ? (
                    // Download button for completed
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDownload(generation.id)}
                    >
                      <Download className="h-3 w-3 mr-1" />
                      Download
                    </Button>
                  ) : (
                    // Retry button for failed/cancelled
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleRetry(generation)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retry
                    </Button>
                  )}
                  {generation.status === GENERATION_STATUS.COMPLETED && onCreateMore && (
                    <Button
                      variant="default"
                      size="sm"
                      className="flex-1"
                      onClick={() => onCreateMore(generation)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" />
                      More
                    </Button>
                  )}
                  {generation.status !== GENERATION_STATUS.PENDING && generation.status !== GENERATION_STATUS.PROCESSING && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(generation.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          <Button
            variant="outline"
            size="sm"
            onClick={prevPage}
            disabled={currentPage === 1 || isLoading}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>

          {/* Page numbers */}
          <div className="flex gap-1">
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => {
              let pageNum;
              if (pagination.totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= pagination.totalPages - 2) {
                pageNum = pagination.totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }

              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "outline"}
                  size="sm"
                  onClick={() => goToPage(pageNum)}
                  disabled={isLoading}
                  className="min-w-[40px]"
                >
                  {pageNum}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={nextPage}
            disabled={currentPage === pagination.totalPages || isLoading}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>

          <span className="text-sm text-muted-foreground ml-2">
            Page {currentPage} of {pagination.totalPages} ({pagination.total} total)
          </span>
        </div>
      )}

      {/* Image Preview Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setShowLogs(false); }}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="truncate pr-4">{selectedImage?.prompt}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLogs(!showLogs)}
                className={showLogs ? "bg-blue-50 border-blue-200" : ""}
              >
                <Terminal className="h-4 w-4 mr-2" />
                {showLogs ? "Hide Logs" : "View Logs"}
              </Button>
            </div>
            <DialogDescription>
              {getModelName(selectedImage?.model)} • {selectedImage?.size} • {selectedImage?.width}x{selectedImage?.height} • Seed: {selectedImage?.seed ? Math.floor(Number(selectedImage.seed)) : "Random"}
              {selectedImage?.images && selectedImage.images.length > 1 && (
                <span className="ml-2">• Image {selectedImage.currentImageIndex + 1} of {selectedImage.images.length}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Image section - hide when logs are shown */}
            {!showLogs && selectedImage?.imageUrl && (
              <div className="relative">
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.prompt}
                  className="w-full rounded-lg"
                />
                {selectedImage.images && selectedImage.images.length > 1 && (
                  <>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute left-2 top-1/2 -translate-y-1/2"
                      onClick={handlePreviousImage}
                      disabled={selectedImage.currentImageIndex === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      className="absolute right-2 top-1/2 -translate-y-1/2"
                      onClick={handleNextImage}
                      disabled={selectedImage.currentImageIndex === selectedImage.images.length - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            )}
            {/* Log viewer - show when logs are enabled */}
            {showLogs && selectedImage?.id && (
              <div className="h-[500px]">
                <LogViewer generationId={selectedImage.id} />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Failed Generation Logs Dialog */}
      <Dialog open={isFailedLogsOpen} onOpenChange={(open) => { setIsFailedLogsOpen(open); if (!open) setFailedLogsGeneration(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Generation Logs - {failedLogsGeneration?.status === GENERATION_STATUS.FAILED ? "Failed" : "Cancelled"}</DialogTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsFailedLogsOpen(false)}
              >
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
            <DialogDescription>
              {failedLogsGeneration?.prompt || "No prompt"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {failedLogsGeneration?.error && (
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-3">
                <p className="text-sm font-medium text-destructive">Error:</p>
                <p className="text-sm text-destructive/80">{failedLogsGeneration.error}</p>
              </div>
            )}
            <div className="h-[500px]">
              <LogViewer generationId={failedLogsGeneration?.id} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UnifiedQueue;
