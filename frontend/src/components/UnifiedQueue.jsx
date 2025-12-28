import { useEffect, useState, useCallback, memo, useRef, useMemo } from "react";
import {
  Loader2,
  Trash2,
  Download,
  Image as ImageIcon,
  Calendar,
  Box,
  Sparkles,
  X,
  Clock,
  XCircle,
  CheckCircle2,
  Cpu,
  RefreshCw,
  Terminal,
  ChevronLeft,
  ChevronRight,
  Edit3,
  AlertTriangle,
  Info,
} from "lucide-react";
import { Card, CardContent } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "./ui/tooltip";
import { LogViewer } from "./LogViewer";
import { LightboxWithImage, LightboxGalleryWithImages } from "@didik-mulyadi/react-modal-images";
import { useGenerations } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { useWebSocket, WS_CHANNELS } from "../contexts/WebSocketContext";
import { formatDate } from "../lib/utils";
import { authenticatedFetch } from "../utils/api";

const GENERATION_STATUS = {
  PENDING: "pending",
  MODEL_LOADING: "model_loading",  // Model is being loaded/prepared
  PROCESSING: "processing",  // Actively generating image
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
  [GENERATION_STATUS.MODEL_LOADING]: {
    icon: Cpu,
    label: "Loading Model",
    color: "default",
    animate: true,
  },
  [GENERATION_STATUS.PROCESSING]: {
    icon: Loader2,
    label: "Generating",
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
  return status === GENERATION_STATUS.PENDING ||
         status === GENERATION_STATUS.MODEL_LOADING ||
         status === GENERATION_STATUS.PROCESSING;
};

// Thumbnail component moved outside parent to prevent remounting on parent re-renders
// Using memo to prevent unnecessary re-renders when generation props haven't changed
const Thumbnail = memo(function Thumbnail({ generation, onViewLogs }) {
  // Use first_image_url directly from the list data - no additional API calls needed
  const src = generation.first_image_url || null;
  const imageCount = generation.image_count || 0;

  // Show preloader for pending/processing generations
  // Use the status config to show the correct icon and label (Queued, Loading Model, or Generating)
  if (isPendingOrProcessing(generation.status)) {
    const config = getStatusConfig(generation.status);
    const StatusIcon = config.icon;
    return (
      <div className="aspect-square bg-muted rounded-lg flex flex-col items-center justify-center">
        <StatusIcon className={`h-8 w-8 text-muted-foreground mb-2 ${config.animate ? 'animate-spin' : ''}`} />
        <span className="text-xs text-muted-foreground">{config.label}</span>
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

  // For single images, use LightboxWithImage
  // For multiple images, we need to fetch the full generation data first
  // For now, we'll show the first image with a badge indicating count
  return (
    <div className="relative aspect-square w-full h-full">
      {imageCount === 1 ? (
        <LightboxWithImage
          small={src}
          large={src}
          alt={generation.prompt || "Generated image"}
          fileName={generation.prompt?.slice(0, 50) || "image"}
          hideDownload={false}
          hideZoom={false}
          className="w-full h-full object-cover rounded-lg"
        />
      ) : (
        <div className="relative w-full h-full">
          <LightboxWithImage
            small={src}
            large={src}
            alt={generation.prompt || "Generated image"}
            fileName={generation.prompt?.slice(0, 50) || "image"}
            hideDownload={false}
            hideZoom={false}
            className="w-full h-full object-cover rounded-lg"
          />
          <div className="absolute bottom-1 right-1 bg-black/70 text-white text-xs px-2 py-0.5 rounded-full pointer-events-none">
            {imageCount}
          </div>
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

export function UnifiedQueue({ onCreateMore, onEditImage }) {
  const { fetchGenerations, goToPage, nextPage, prevPage, isLoading, generations, pagination, currentPage } = useGenerations({ pageSize: 20 });
  const [selectedImage, setSelectedImage] = useState(null);
  const [galleryImages, setGalleryImages] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [failedLogsGeneration, setFailedLogsGeneration] = useState(null);
  const [isFailedLogsOpen, setIsFailedLogsOpen] = useState(false);
  const [models, setModels] = useState({});
  const [isDeleteAllOpen, setIsDeleteAllOpen] = useState(false);
  const [isCancelAllOpen, setIsCancelAllOpen] = useState(false);
  const [deleteFiles, setDeleteFiles] = useState(false);
  const [mobileInfoGeneration, setMobileInfoGeneration] = useState(null);
  const [isMobileInfoOpen, setIsMobileInfoOpen] = useState(false);

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
        fetchGenerations(currentPage);
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
        fetchGenerations(currentPage);
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
        // Convert disk path to static URL
        const filename = generation.input_image_path.split('/').pop();
        const staticUrl = `/static/input/${filename}`;

        const imageResponse = await fetch(staticUrl);
        if (!imageResponse.ok) {
          throw new Error("Failed to fetch input image");
        }
        const blob = await imageResponse.blob();
        const file = new File([blob], filename, { type: blob.type || 'image/png' });

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
        if (generation.strength !== undefined) formData.append('strength', generation.strength);

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
        fetchGenerations(currentPage);
      } else {
        throw new Error("Failed to retry");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleViewImage = async (generation) => {
    try {
      const response = await authenticatedFetch(`/api/generations/${generation.id}`);
      if (!response.ok) throw new Error("Failed to fetch generation");

      const fullGeneration = await response.json();

      if (!fullGeneration.images || fullGeneration.images.length === 0) {
        toast.error("No images found");
        return;
      }

      // For multiple images, prepare gallery data for LightboxGalleryWithImages
      if (fullGeneration.images.length > 1) {
        const galleryData = fullGeneration.images.map(img => ({
          id: img.id,
          src: img.static_url || `/api/images/${img.id}`,
          srcLarge: img.static_url || `/api/images/${img.id}`,
          fileName: generation.prompt?.slice(0, 50) || "image",
          alt: generation.prompt || "Generated image",
        }));
        setGalleryImages(galleryData);
      } else {
        // For single image, LightboxWithImage in the thumbnail handles it
        setGalleryImages(null);
      }

      setSelectedImage({
        ...generation,
        images: fullGeneration.images,
        width: fullGeneration.images[0]?.width,
        height: fullGeneration.images[0]?.height
      });
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

  const handleViewFailedLogs = (generation) => {
    setFailedLogsGeneration(generation);
    setIsFailedLogsOpen(true);
  };

  const handleViewMobileInfo = (generation) => {
    setMobileInfoGeneration(generation);
    setIsMobileInfoOpen(true);
  };

  const handleDeleteAll = async () => {
    try {
      const url = deleteFiles ? '/api/generations?delete_files=true' : '/api/generations';
      const response = await authenticatedFetch(url, {
        method: "DELETE",
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Deleted ${data.count} generation${data.count !== 1 ? 's' : ''}${deleteFiles && data.filesDeleted > 0 ? ` and ${data.filesDeleted} file${data.filesDeleted !== 1 ? 's' : ''}` : ''}`);
        fetchGenerations(currentPage);
      } else {
        throw new Error("Failed to delete all generations");
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsDeleteAllOpen(false);
      setDeleteFiles(false);
    }
  };

  const handleCancelAll = async () => {
    try {
      const response = await authenticatedFetch('/api/queue/cancel-all', {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Cancelled ${data.cancelled} job${data.cancelled !== 1 ? 's' : ''}`);
        fetchGenerations(currentPage);
      } else {
        throw new Error("Failed to cancel all jobs");
      }
    } catch (error) {
      toast.error(error.message);
    } finally {
      setIsCancelAllOpen(false);
    }
  };

  const handleEditImage = async (generation) => {
    try {
      // Get the first image URL from the generation
      let imageUrl = generation.first_image_url;

      // If no first_image_url, try to fetch the full generation data
      if (!imageUrl) {
        const response = await authenticatedFetch(`/api/generations/${generation.id}`);
        if (!response.ok) {
          toast.error("Failed to fetch generation");
          return;
        }
        const fullGeneration = await response.json();
        if (!fullGeneration.images || fullGeneration.images.length === 0) {
          toast.error("No images found");
          return;
        }
        imageUrl = fullGeneration.images[0].static_url || `/api/images/${fullGeneration.images[0].id}`;
      }

      if (!imageUrl) {
        toast.error("No image URL found");
        return;
      }

      // Fetch the image data
      const imageResponse = await fetch(imageUrl);
      if (!imageResponse.ok) {
        throw new Error("Failed to fetch image");
      }
      const blob = await imageResponse.blob();

      // Get filename from URL
      const urlParts = imageUrl.split('/');
      const filename = urlParts[urlParts.length - 1] || 'image.png';

      // Create a File object
      const file = new File([blob], filename, { type: blob.type || 'image/png' });

      // Call the onEditImage callback with the file and generation data
      if (onEditImage) {
        onEditImage(file, generation);
      }
    } catch (err) {
      console.error('Error loading image for editing:', err);
      toast.error("Failed to load image for editing");
    }
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

  // Compute if there are any pending or processing generations
  const hasPendingOrProcessing = generations.some(g =>
    g.status === GENERATION_STATUS.PENDING || g.status === GENERATION_STATUS.PROCESSING
  );

  return (
    <>
      {/* Toolbar with Delete All and Cancel All buttons */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {pagination.total} total generation{pagination.total !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setIsCancelAllOpen(true)}
            disabled={!hasPendingOrProcessing}
          >
            <X className="h-4 w-4 mr-1" />
            Cancel All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsDeleteAllOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete All
          </Button>
        </div>
      </div>

      <TooltipProvider>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {generations.map((generation) => {
            const config = getStatusConfig(generation.status);
            const StatusIcon = config.icon;
            const canCancel = isPendingOrProcessing(generation.status);

            return (
              <Tooltip key={generation.id}>
                <TooltipTrigger asChild>
                  <Card className="overflow-hidden group">
                    <div className="relative aspect-square">
                      <Thumbnail generation={generation} onViewLogs={handleViewFailedLogs} />
                      {generation.status === GENERATION_STATUS.COMPLETED && generation.image_count > 1 && (
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                          <Button
                            variant="secondary"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleViewImage(generation);
                            }}
                          >
                            <ImageIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                    <CardContent className="p-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <p className="text-sm line-clamp-2 flex-1 pr-1">{generation.prompt || "No prompt"}</p>
                      </div>
                      <div className="flex gap-2">
                        {canCancel ? (
                          // Cancel button for pending/processing
                          <Button
                            variant="destructive"
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCancel(generation.id);
                            }}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Cancel
                          </Button>
                        ) : generation.status === GENERATION_STATUS.COMPLETED ? (
                          // Download button for completed (icon only for compact view)
                          <Button
                            variant="outline"
                            size="icon"
                            className="flex-shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(generation.id);
                            }}
                          >
                            <Download className="h-3 w-3" />
                          </Button>
                        ) : (
                          // Retry button for failed/cancelled
                          <Button
                            variant="default"
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRetry(generation);
                            }}
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
                            onClick={(e) => {
                              e.stopPropagation();
                              onCreateMore(generation);
                            }}
                          >
                            <Sparkles className="h-3 w-3 mr-1" />
                            More
                          </Button>
                        )}
                        {generation.status === GENERATION_STATUS.COMPLETED && onEditImage && (
                          <Button
                            variant="secondary"
                            size="sm"
                            className="flex-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEditImage(generation);
                            }}
                          >
                            <Edit3 className="h-3 w-3 mr-1" />
                            Edit
                          </Button>
                        )}
                        {generation.status !== GENERATION_STATUS.PENDING && generation.status !== GENERATION_STATUS.PROCESSING && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(generation.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                        {/* Mobile info button - only shows on small screens */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="sm:hidden"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewMobileInfo(generation);
                          }}
                        >
                          <Info className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Box className="h-3 w-3" />
                      <span className="font-medium">Size: {generation.size || "512x512"}</span>
                    </div>
                    {generation.seed && (
                      <div className="flex items-center gap-2">
                        <Sparkles className="h-3 w-3" />
                        <span>Seed: {Math.floor(Number(generation.seed))}</span>
                      </div>
                    )}
                    {generation.sample_steps && (
                      <div className="flex items-center gap-2">
                        <Box className="h-3 w-3" />
                        <span>Steps: {generation.sample_steps}</span>
                      </div>
                    )}
                    {generation.cfg_scale && (
                      <div className="flex items-center gap-2">
                        <Cpu className="h-3 w-3" />
                        <span>CFG: {generation.cfg_scale}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Cpu className="h-3 w-3" />
                      <span>Model: {getModelName(generation.model)}</span>
                    </div>
                    {(generation.model_loading_time_ms !== undefined || generation.generation_time_ms !== undefined) && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-3 w-3" />
                        <span>
                          {generation.model_loading_time_ms !== undefined && `Model: ${(generation.model_loading_time_ms / 1000).toFixed(1)}s`}
                          {generation.model_loading_time_ms !== undefined && generation.generation_time_ms !== undefined && ' • '}
                          {generation.generation_time_ms !== undefined && `Gen: ${(generation.generation_time_ms / 1000).toFixed(1)}s`}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(generation.created_at)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusIcon className={`h-3 w-3 ${config.animate ? 'animate-spin' : ''}`} />
                      <span className="capitalize">{config.label}</span>
                    </div>
                  </div>
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>

      {/* Pagination Controls */}
      {pagination.totalPages > 1 && (
        <div className="flex flex-col sm:flex-row justify-center items-center gap-2 sm:gap-4 mt-6">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={prevPage}
              disabled={currentPage === 1 || isLoading}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              <span className="hidden sm:inline">Previous</span>
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
              <span className="hidden sm:inline">Next</span>
              <ChevronRight className="h-4 w-4 sm:ml-1" />
            </Button>
          </div>

          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {pagination.totalPages} ({pagination.total} total)
          </span>
        </div>
      )}

      {/* Gallery View Dialog for Multiple Images */}
      {galleryImages && selectedImage && (
        <Dialog open={!!galleryImages} onOpenChange={(open) => { if (!open) setGalleryImages(null); }}>
          <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => setShowLogs(!showLogs)}
                  className={showLogs ? "bg-blue-50 border-blue-200" : ""}
                  title={showLogs ? "Hide Logs" : "View Logs"}
                >
                  <Terminal className="h-4 w-4" />
                </Button>
                <DialogTitle className="truncate">{selectedImage?.prompt}</DialogTitle>
              </div>
              <DialogDescription>
                {getModelName(selectedImage?.model)} • {selectedImage?.size} • {selectedImage?.width}x{selectedImage?.height} • Seed: {selectedImage?.seed ? Math.floor(Number(selectedImage.seed)) : "Random"}
                {selectedImage?.images && (
                  <span className="ml-2">• {selectedImage.images.length} image{selectedImage.images.length > 1 ? 's' : ''}</span>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {/* Gallery section - hide when logs are shown */}
              {!showLogs && galleryImages && (
                <LightboxGalleryWithImages
                  fixedWidth="200px"
                  maxWidthLightBox="80%"
                  images={galleryImages}
                />
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
      )}

      {/* Failed Generation Logs Dialog */}
      <Dialog open={isFailedLogsOpen} onOpenChange={(open) => { setIsFailedLogsOpen(open); if (!open) setFailedLogsGeneration(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generation Logs - {failedLogsGeneration?.status === GENERATION_STATUS.FAILED ? "Failed" : "Cancelled"}</DialogTitle>
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

      {/* Mobile Generation Info Dialog */}
      <Dialog open={isMobileInfoOpen} onOpenChange={(open) => { setIsMobileInfoOpen(open); if (!open) setMobileInfoGeneration(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Generation Details</DialogTitle>
            <DialogDescription className="line-clamp-2">
              {mobileInfoGeneration?.prompt || "No prompt"}
            </DialogDescription>
          </DialogHeader>
          {mobileInfoGeneration && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Box className="h-4 w-4" />
                <span className="text-sm">Size: {mobileInfoGeneration.size || "512x512"}</span>
              </div>
              {mobileInfoGeneration.seed && (
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4" />
                  <span className="text-sm">Seed: {Math.floor(Number(mobileInfoGeneration.seed))}</span>
                </div>
              )}
              {mobileInfoGeneration.sample_steps && (
                <div className="flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  <span className="text-sm">Steps: {mobileInfoGeneration.sample_steps}</span>
                </div>
              )}
              {mobileInfoGeneration.cfg_scale && (
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4" />
                  <span className="text-sm">CFG: {mobileInfoGeneration.cfg_scale}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Cpu className="h-4 w-4" />
                <span className="text-sm">Model: {getModelName(mobileInfoGeneration.model)}</span>
              </div>
              {(mobileInfoGeneration.model_loading_time_ms !== undefined || mobileInfoGeneration.generation_time_ms !== undefined) && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4" />
                  <span className="text-sm">
                    {mobileInfoGeneration.model_loading_time_ms !== undefined && `Model: ${(mobileInfoGeneration.model_loading_time_ms / 1000).toFixed(1)}s`}
                    {mobileInfoGeneration.model_loading_time_ms !== undefined && mobileInfoGeneration.generation_time_ms !== undefined && ' • '}
                    {mobileInfoGeneration.generation_time_ms !== undefined && `Gen: ${(mobileInfoGeneration.generation_time_ms / 1000).toFixed(1)}s`}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                <span className="text-sm">{formatDate(mobileInfoGeneration.created_at)}</span>
              </div>
              <div className="flex items-center gap-2">
                {(() => {
                  const config = getStatusConfig(mobileInfoGeneration.status);
                  const StatusIcon = config.icon;
                  return (
                    <>
                      <StatusIcon className={`h-4 w-4 ${config.animate ? 'animate-spin' : ''}`} />
                      <span className="text-sm capitalize">{config.label}</span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={isDeleteAllOpen} onOpenChange={(open) => { setIsDeleteAllOpen(open); if (!open) setDeleteFiles(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Delete All Generations
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete all generations? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteFiles}
                onChange={(e) => setDeleteFiles(e.target.checked)}
                className="h-4 w-4"
              />
              <span className="text-sm">Also delete image files from disk</span>
            </label>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsDeleteAllOpen(false);
                  setDeleteFiles(false);
                }}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAll}
              >
                Delete All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel All Confirmation Dialog */}
      <Dialog open={isCancelAllOpen} onOpenChange={setIsCancelAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Cancel All Jobs
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to cancel all pending and processing jobs?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setIsCancelAllOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAll}
            >
              Cancel All Jobs
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UnifiedQueue;
