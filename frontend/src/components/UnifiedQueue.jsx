import { useEffect, useState, useCallback, memo } from "react";
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
  Sparkles,
  X,
  Clock,
  XCircle,
  CheckCircle2,
  Wifi,
  WifiOff,
  Cpu,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { useGenerations } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { useWebSocket, WS_CHANNELS } from "../hooks/useWebSocket";
import { formatDate } from "../lib/utils";

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
// This is critical because the parent polls every 3 seconds and would otherwise cause
// all thumbnails to remount and reload their images
const Thumbnail = memo(function Thumbnail({ generation }) {
  const [src, setSrc] = useState(null);
  const [imageCount, setImageCount] = useState(0);

  useEffect(() => {
    const loadImages = async () => {
      try {
        const response = await fetch(`/api/generations/${generation.id}`);
        if (!response.ok) return;

        const gen = await response.json();
        if (gen.images && gen.images.length > 0) {
          setImageCount(gen.images.length);
          const imgResponse = await fetch(`/api/images/${gen.images[0].id}`);
          if (imgResponse.ok) {
            const blob = await imgResponse.blob();
            setSrc(URL.createObjectURL(blob));
          }
        }
      } catch (e) {
        console.error("Failed to load thumbnail", e);
      }
    };

    // Only load images for completed generations
    if (generation.status === GENERATION_STATUS.COMPLETED) {
      loadImages();
    }
  }, [generation.id, generation.status]);

  // Show preloader for pending/processing generations
  if (isPendingOrProcessing(generation.status)) {
    return (
      <div className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center">
        <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-2" />
        <span className="text-xs text-muted-foreground">Generating...</span>
      </div>
    );
  }

  // Show failed state
  if (generation.status === GENERATION_STATUS.FAILED || generation.status === GENERATION_STATUS.CANCELLED) {
    return (
      <div className="aspect-square bg-destructive/10 rounded-lg flex flex-col items-center justify-center">
        <XCircle className="h-8 w-8 text-destructive mb-2" />
        <span className="text-xs text-destructive">
          {generation.status === GENERATION_STATUS.FAILED ? "Failed" : "Cancelled"}
        </span>
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
      <img src={src} alt={generation.prompt} className="w-full h-full object-cover" />
      {imageCount > 1 && (
        <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full">
          {imageCount}
        </div>
      )}
    </div>
  );
});

export function UnifiedQueue({ onCreateMore }) {
  const { fetchGenerations, isLoading, generations } = useGenerations();
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [models, setModels] = useState({});

  // Fetch models on mount to get model names
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const response = await fetch('/api/models');
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

  // WebSocket connection for real-time updates
  const { isConnected: isWsConnected } = useWebSocket({
    channels: [WS_CHANNELS.QUEUE, WS_CHANNELS.GENERATIONS],
    onMessage: (message) => {
      // Refresh generations when receiving relevant WebSocket messages
      if (message.channel === WS_CHANNELS.QUEUE) {
        // Queue updates: job_created, job_updated, job_completed, job_failed
        if (message.type === 'job_updated' ||
            message.type === 'job_completed' ||
            message.type === 'job_failed') {
          fetchGenerations();
        }
      } else if (message.channel === WS_CHANNELS.GENERATIONS) {
        // Generation completions
        if (message.type === 'generation_complete') {
          fetchGenerations();
        }
      }
    },
    onConnectionChange: (isConnected) => {
      if (isConnected) {
        console.log('[UnifiedQueue] WebSocket connected');
      } else {
        console.log('[UnifiedQueue] WebSocket disconnected');
      }
    },
  });

  // Initial fetch on mount
  useEffect(() => {
    fetchGenerations();
  }, []); // Only fetch once on mount

  const handleCancel = async (id) => {
    try {
      const response = await fetch(`/api/queue/${id}`, {
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
      const response = await fetch(`/api/generations/${id}`, {
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

  const handleViewImage = async (generation, imageIndex = 0) => {
    try {
      const response = await fetch(`/api/generations/${generation.id}`);
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
        imageUrl: `/api/images/${image.id}`,
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
      const response = await fetch(`/api/generations/${generationId}`);
      if (!response.ok) throw new Error("Failed to fetch generation");

      const generation = await response.json();

      if (!generation.images || generation.images.length === 0) {
        toast.error("No images found");
        return;
      }

      const image = generation.images[imageIndex];
      const imageResponse = await fetch(`/api/images/${image.id}`);
      if (!imageResponse.ok) throw new Error("Failed to download image");

      const blob = await imageResponse.blob();
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
        imageUrl: `/api/images/${image.id}`
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
        imageUrl: `/api/images/${image.id}`
      });
    }
  };

  if (generations.length === 0 && !isLoading) {
    return (
      <Card>
        <CardContent className="py-12">
          <div className="text-center">
            <div className="flex items-center justify-center gap-2 mb-4">
              {isWsConnected ? (
                <Wifi className="h-4 w-4 text-green-500" />
              ) : (
                <WifiOff className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground">
                {isWsConnected ? 'Real-time updates enabled' : 'Real-time updates disconnected'}
              </span>
            </div>
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
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {isWsConnected ? (
            <Wifi className="h-4 w-4 text-green-500" title="Real-time updates enabled" />
          ) : (
            <WifiOff className="h-4 w-4 text-muted-foreground" title="Real-time updates disconnected" />
          )}
          <span className="text-xs text-muted-foreground">
            {isWsConnected ? 'Live' : 'Offline'}
          </span>
        </div>
      </div>
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
                <Thumbnail generation={generation} />
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
                  {generation.seed && <span>• Seed: {generation.seed}</span>}
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
                    // Remove button for failed/cancelled
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={() => handleDelete(generation.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Remove
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

      {/* Image Preview Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedImage?.prompt}</DialogTitle>
            <DialogDescription>
              {getModelName(selectedImage?.model)} • {selectedImage?.size} • {selectedImage?.width}x{selectedImage?.height} • Seed: {selectedImage?.seed || "Random"}
              {selectedImage?.images && selectedImage.images.length > 1 && (
                <span className="ml-2">• Image {selectedImage.currentImageIndex + 1} of {selectedImage.images.length}</span>
              )}
            </DialogDescription>
          </DialogHeader>
          {selectedImage?.imageUrl && (
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
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UnifiedQueue;
