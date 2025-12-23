import { useState, useRef } from "react";
import { Upload, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useToast } from "../hooks/useToast";
import { ModelSelector } from "./ModelSelector";

const SIZES = [
  { value: "256x256", label: "256 x 256" },
  { value: "512x512", label: "512 x 512" },
  { value: "768x768", label: "768 x 768" },
  { value: "1024x1024", label: "1024 x 1024" },
];

const MODE_OPTIONS = [
  { value: "edit", label: "Image Edit (img2img)" },
  { value: "variation", label: "Variation" },
];

export function ImageToImage({ onGenerated, selectedModel, onModelChange }) {
  const { addToast } = useToast();
  const { generate, isLoading, result } = useImageGeneration();

  const fileInputRef = useRef(null);

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [mode, setMode] = useState("edit");
  const [sourceImage, setSourceImage] = useState(null);
  const [sourceImagePreview, setSourceImagePreview] = useState(null);

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      addToast("Error", "Please select an image file", "destructive");
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      addToast("Error", "Image size must be less than 50MB", "destructive");
      return;
    }

    setSourceImage(file);

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setSourceImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleClearImage = () => {
    setSourceImage(null);
    setSourceImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast("Error", "Please enter a prompt", "destructive");
      return;
    }

    if (!sourceImage) {
      addToast("Error", "Please select a source image", "destructive");
      return;
    }

    try {
      await generate({
        mode,
        model: selectedModel?.id || undefined, // Use selected model, undefined will use default
        prompt,
        negative_prompt: negativePrompt,
        size,
        image: sourceImage,
      });

      addToast("Success", `Image ${mode === 'edit' ? 'edited' : 'variation created'} successfully!`);
      if (onGenerated) onGenerated();
    } catch (err) {
      addToast("Error", err.message, "destructive");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Image to Image
        </CardTitle>
        <CardDescription>
          Edit images or create variations
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Model Selector */}
        <div className="space-y-2">
          <ModelSelector
            currentModel={selectedModel}
            onModelChange={onModelChange}
            className="w-full"
          />
        </div>

        {/* Source Image Upload */}
        <div className="space-y-2">
          <Label>Source Image *</Label>
          <div className="flex items-center gap-4">
            {sourceImagePreview ? (
              <div className="relative group">
                <img
                  src={sourceImagePreview}
                  alt="Source"
                  className="w-32 h-32 object-cover rounded-lg border"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={handleClearImage}
                  disabled={isLoading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div
                className="w-32 h-32 border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-primary transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-1" />
                <span className="text-xs text-muted-foreground">Upload</span>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleFileSelect}
              className="hidden"
              disabled={isLoading}
            />
          </div>
        </div>

        {/* Mode Selection */}
        <div className="space-y-2">
          <Label htmlFor="mode">Mode</Label>
          <Select value={mode} onValueChange={setMode} disabled={isLoading}>
            <SelectTrigger id="mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODE_OPTIONS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt *</Label>
          <Textarea
            id="prompt"
            placeholder={mode === "edit"
              ? "Transform this image into a watercolor painting..."
              : "Create a variation of this image..."}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            disabled={isLoading}
          />
        </div>

        {/* Negative Prompt */}
        <div className="space-y-2">
          <Label htmlFor="negative-prompt">Negative Prompt</Label>
          <Textarea
            id="negative-prompt"
            placeholder="blurry, low quality, distorted..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            disabled={isLoading}
          />
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label htmlFor="size">Output Size</Label>
          <Select value={size} onValueChange={setSize} disabled={isLoading}>
            <SelectTrigger id="size">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIZES.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading || !sourceImage}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              {mode === "edit" ? "Edit Image" : "Create Variation"}
            </>
          )}
        </Button>

        {/* Result Preview */}
        {result && result.data && result.data.length > 0 && (
          <div className="pt-4 border-t space-y-4">
            <Label>Result</Label>
            <div className="grid grid-cols-2 gap-4">
              {result.data.map((img, idx) => (
                <div key={idx} className="aspect-square rounded-lg overflow-hidden border bg-muted">
                  <img
                    src={`data:image/png;base64,${img.b64_json}`}
                    alt={`Result ${idx + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
