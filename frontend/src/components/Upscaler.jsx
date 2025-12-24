import { useState, useCallback, useEffect } from "react";
import { Upload, Download, Sparkles, Image as ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "../lib/utils";

const RESIZE_MODES = [
  { value: 0, label: "By Factor", description: "Upscale by multiplier (e.g., 2x, 4x)" },
  { value: 1, label: "To Size", description: "Upscale to specific dimensions" },
];

export function Upscaler({ onUpscaled }) {
  const [upscalers, setUpscalers] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [resultImage, setResultImage] = useState(null);
  const [isUpscaling, setIsUpscaling] = useState(false);

  // Upscaling parameters
  const [resizeMode, setResizeMode] = useState(0);
  const [upscaleFactor, setUpscaleFactor] = useState(2.0);
  const [targetWidth, setTargetWidth] = useState(1024);
  const [targetHeight, setTargetHeight] = useState(1024);
  const [upscaler1, setUpscaler1] = useState("RealESRGAN 4x+");
  const [upscaler2, setUpscaler2] = useState("None");
  const [upscaler2Visibility, setUpscaler2Visibility] = useState(0);

  // Fetch available upscalers on mount
  useEffect(() => {
    fetch("/sdapi/v1/upscalers")
      .then((res) => res.json())
      .then((data) => {
        setUpscalers(data);
        if (data.length > 0) {
          setUpscaler1(data[0].name);
        }
      })
      .catch((err) => {
        console.error("Failed to fetch upscalers:", err);
        toast.error("Failed to load upscalers");
      });
  }, []);

  // Handle file selection
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(file);
      setPreviewUrl(e.target.result);
      setResultImage(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle drop
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(file);
      setPreviewUrl(e.target.result);
      setResultImage(null);
    };
    reader.readAsDataURL(file);
  }, []);

  // Handle drag over
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
  }, []);

  // Upscale image
  const handleUpscale = async () => {
    if (!previewUrl) {
      toast.error("Please select an image first");
      return;
    }

    setIsUpscaling(true);
    try {
      // Extract base64 data from data URL
      const base64Data = previewUrl.split("base64,")?.[1] || previewUrl;

      const response = await fetch("/sdapi/v1/extra-single-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Data,
          resize_mode: resizeMode,
          upscaling_resize: upscaleFactor,
          upscaling_resize_w: targetWidth,
          upscaling_resize_h: targetHeight,
          upscaler_1: upscaler1,
          upscaler_2: upscaler2,
          extras_upscaler_2_visibility: upscaler2Visibility / 100,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Upscaling failed");
      }

      const data = await response.json();
      const resultDataUrl = `data:image/png;base64,${data.image}`;
      setResultImage(resultDataUrl);

      toast.success("Image upscaled successfully!");
      if (onUpscaled) {
        onUpscaled(resultDataUrl);
      }
    } catch (err) {
      console.error("Upscaling error:", err);
      toast.error(err.message || "Failed to upscale image");
    } finally {
      setIsUpscaling(false);
    }
  };

  // Download result
  const handleDownload = () => {
    if (!resultImage) return;

    const link = document.createElement("a");
    link.href = resultImage;
    link.download = `upscaled_${Date.now()}.png`;
    link.click();
    toast.success("Image downloaded");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" />
          Image Upscaler
        </h2>
        <p className="text-muted-foreground">
          Enhance and upscale your images using AI upscalers
        </p>
      </div>

      {/* Image Upload */}
      <div className="space-y-4">
        <div
          className={cn(
            "border-2 border-dashed rounded-lg p-8 text-center transition-colors",
            "hover:border-primary/50 hover:bg-accent/5",
            selectedImage ? "border-success" : "border-border"
          )}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
        >
          {!previewUrl ? (
            <label className="cursor-pointer">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <div>
                  <p className="font-medium">Drop an image here or click to upload</p>
                  <p className="text-sm text-muted-foreground">
                    PNG, JPG, WEBP supported
                  </p>
                </div>
              </div>
            </label>
          ) : (
            <div className="space-y-4">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-64 mx-auto rounded-lg"
              />
              <div className="flex justify-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                  <button className="btn-secondary">
                    Change Image
                  </button>
                </label>
                {resultImage && (
                  <button onClick={() => setResultImage(null)} className="btn-secondary">
                    Clear Result
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upscaler Settings */}
      <div className="space-y-4 bg-card rounded-lg p-4 border border-border">
        <h3 className="font-semibold">Upscaler Settings</h3>

        {/* Upscaler Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Upscaler</label>
          <select
            value={upscaler1}
            onChange={(e) => setUpscaler1(e.target.value)}
            className="w-full p-2 rounded-md border border-input bg-background"
          >
            {upscalers.map((u) => (
              <option key={u.name} value={u.name}>
                {u.name} {u.scale > 1 ? `(${u.scale}x)` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Resize Mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Resize Mode</label>
          <div className="grid grid-cols-2 gap-2">
            {RESIZE_MODES.map((mode) => (
              <button
                key={mode.value}
                onClick={() => setResizeMode(mode.value)}
                className={cn(
                  "p-3 rounded-lg border text-left transition-colors",
                  resizeMode === mode.value
                    ? "border-primary bg-primary/10"
                    : "border-border hover:border-primary/50"
                )}
              >
                <div className="font-medium">{mode.label}</div>
                <div className="text-xs text-muted-foreground">{mode.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Scale Factor or Target Size */}
        {resizeMode === 0 ? (
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Scale Factor: {upscaleFactor}x
            </label>
            <input
              type="range"
              min="1"
              max="8"
              step="0.5"
              value={upscaleFactor}
              onChange={(e) => setUpscaleFactor(parseFloat(e.target.value))}
              className="w-full"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Width (px)</label>
              <input
                type="number"
                min="64"
                max="4096"
                value={targetWidth}
                onChange={(e) => setTargetWidth(parseInt(e.target.value) || 512)}
                className="w-full p-2 rounded-md border border-input bg-background"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Height (px)</label>
              <input
                type="number"
                min="64"
                max="4096"
                value={targetHeight}
                onChange={(e) => setTargetHeight(parseInt(e.target.value) || 512)}
                className="w-full p-2 rounded-md border border-input bg-background"
              />
            </div>
          </div>
        )}

        {/* Second Upscaler (Optional) */}
        <details className="space-y-2">
          <summary className="cursor-pointer text-sm font-medium">
            Advanced: Second Pass Upscaler
          </summary>
          <div className="space-y-3 pt-2">
            <div className="space-y-2">
              <label className="text-sm">Second Upscaler</label>
              <select
                value={upscaler2}
                onChange={(e) => setUpscaler2(e.target.value)}
                className="w-full p-2 rounded-md border border-input bg-background"
              >
                <option value="None">None</option>
                {upscalers.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            {upscaler2 !== "None" && (
              <div className="space-y-2">
                <label className="text-sm">
                  Blend: {upscaler2Visibility}%
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={upscaler2Visibility}
                  onChange={(e) => setUpscaler2Visibility(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>
            )}
          </div>
        </details>

        {/* Upscale Button */}
        <button
          onClick={handleUpscale}
          disabled={isUpscaling || !previewUrl}
          className={cn(
            "w-full py-3 rounded-lg font-medium flex items-center justify-center gap-2",
            "bg-primary text-primary-foreground hover:bg-primary/90",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        >
          {isUpscaling ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Upscaling...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Upscale Image
            </>
          )}
        </button>
      </div>

      {/* Result */}
      {resultImage && (
        <div className="space-y-4 bg-card rounded-lg p-4 border border-border">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Result</h3>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary hover:bg-secondary/80"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
          <img src={resultImage} alt="Upscaled result" className="rounded-lg" />
        </div>
      )}
    </div>
  );
}
