import { useEffect, useState } from "react";
import { Trash2, Download, Image as ImageIcon, Eye, Calendar, Box, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Card, CardContent } from "./ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { useGenerations } from "../hooks/useImageGeneration";
import { toast } from "sonner";
import { formatDate } from "../lib/utils";

export function History({ onCreateMore }) {
  const { fetchGenerations, deleteGeneration, isLoading, generations } = useGenerations();
  const [selectedImage, setSelectedImage] = useState(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);

  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations]);

  const handleDelete = async (id) => {
    try {
      await deleteGeneration(id);
      toast.success("Generation deleted");
    } catch (err) {
      toast.error(err.message);
    }
  };

  const handleViewImage = async (generation, imageIndex = 0) => {
    try {
      // Fetch full generation with images
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
      // Use static_url directly, fallback to API fetch if not available
      let blob;
      if (image.static_url) {
        const imageResponse = await fetch(image.static_url);
        if (!imageResponse.ok) throw new Error("Failed to download image");
        blob = await imageResponse.blob();
      } else {
        const imageResponse = await fetch(`/api/images/${image.id}`);
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

  const getThumbnailUrl = (generation, index = 0) => {
    // We'll fetch images separately and get the first image's URL
    return null;
  };

  // Thumbnail component that loads image on mount
  const Thumbnail = ({ generation, index = 0 }) => {
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
            // Use API endpoint for thumbnails (more reliable than static URLs)
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

      loadImages();
    }, [generation.id]);

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
        {generations.map((generation) => (
          <Card key={generation.id} className="overflow-hidden group">
            <div className="relative aspect-square cursor-pointer" onClick={() => handleViewImage(generation, 0)}>
              <Thumbnail generation={generation} />
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
            </div>
            <CardContent className="p-3">
              <p className="text-sm line-clamp-2 mb-2">{generation.prompt || "No prompt"}</p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Calendar className="h-3 w-3" />
                <span>{formatDate(generation.created_at)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3">
                <Box className="h-3 w-3" />
                <span>{generation.size || "512x512"}</span>
                {generation.seed && <span>• Seed: {Math.floor(Number(generation.seed))}</span>}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleDownload(generation.id)}
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download
                </Button>
                {onCreateMore && (
                  <Button
                    variant="default"
                    size="sm"
                    className="flex-1"
                    onClick={() => onCreateMore(generation)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" />
                    Create More
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDelete(generation.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Image Preview Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{selectedImage?.prompt}</DialogTitle>
            <DialogDescription>
              {selectedImage?.size} • {selectedImage?.width}x{selectedImage?.height} • Seed: {selectedImage?.seed ? Math.floor(Number(selectedImage.seed)) : "Random"}
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
