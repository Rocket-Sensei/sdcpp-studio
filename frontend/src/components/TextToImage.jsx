import { useState } from "react";
import { Wand2, Sparkles } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Slider } from "./ui/slider";
import { Switch } from "./ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { useImageGeneration } from "../hooks/useImageGeneration";
import { useToast } from "../hooks/useToast";

const SIZES = [
  { value: "256x256", label: "256 x 256" },
  { value: "512x512", label: "512 x 512" },
  { value: "768x768", label: "768 x 768" },
  { value: "1024x1024", label: "1024 x 1024" },
  { value: "1024x768", label: "1024 x 768 (Landscape)" },
  { value: "768x1024", label: "768 x 1024 (Portrait)" },
  { value: "1536x1024", label: "1536 x 1024 (Landscape)" },
  { value: "1024x1536", label: "1024 x 1536 (Portrait)" },
];

const QUALITY_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "hd", label: "HD" },
  { value: "standard", label: "Standard" },
];

const STYLE_OPTIONS = [
  { value: "vivid", label: "Vivid" },
  { value: "natural", label: "Natural" },
];

export function TextToImage({ onGenerated }) {
  const { addToast } = useToast();
  const { generate, isLoading, result } = useImageGeneration();

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [size, setSize] = useState("512x512");
  const [n, setN] = useState(1);
  const [quality, setQuality] = useState("auto");
  const [style, setStyle] = useState("vivid");
  const [seed, setSeed] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      addToast("Error", "Please enter a prompt", "destructive");
      return;
    }

    try {
      let extraArgs = {};
      if (seed) {
        extraArgs.seed = parseInt(seed);
      }

      await generate({
        mode: 'generate',
        model: 'sd-cpp-local',
        prompt,
        negative_prompt: negativePrompt,
        size,
        n,
        quality,
        style,
      });

      addToast("Success", "Image generated successfully!");
      if (onGenerated) onGenerated();
    } catch (err) {
      addToast("Error", err.message, "destructive");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wand2 className="h-5 w-5" />
          Text to Image
        </CardTitle>
        <CardDescription>
          Generate images from text descriptions
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Prompt */}
        <div className="space-y-2">
          <Label htmlFor="prompt">Prompt *</Label>
          <Textarea
            id="prompt"
            placeholder="A serene landscape with rolling hills, a small cottage with a thatched roof, golden hour lighting..."
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
            placeholder="blurry, low quality, distorted, watermark..."
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            rows={2}
            disabled={isLoading}
          />
        </div>

        {/* Size */}
        <div className="space-y-2">
          <Label htmlFor="size">Image Size</Label>
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

        {/* Number of Images */}
        <div className="space-y-2">
          <Label htmlFor="n">Number of Images: {n}</Label>
          <Slider
            id="n"
            min={1}
            max={10}
            step={1}
            value={[n]}
            onValueChange={(v) => setN(v[0])}
            disabled={isLoading}
          />
        </div>

        {/* Quality */}
        <div className="space-y-2">
          <Label htmlFor="quality">Quality</Label>
          <Select value={quality} onValueChange={setQuality} disabled={isLoading}>
            <SelectTrigger id="quality">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {QUALITY_OPTIONS.map((q) => (
                <SelectItem key={q.value} value={q.value}>
                  {q.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Style */}
        <div className="space-y-2">
          <Label htmlFor="style">Style</Label>
          <Select value={style} onValueChange={setStyle} disabled={isLoading}>
            <SelectTrigger id="style">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STYLE_OPTIONS.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Advanced Options */}
        <div className="space-y-4 pt-4 border-t border-border">
          <div className="space-y-2">
            <Label htmlFor="seed">Seed (optional, for reproducibility)</Label>
            <Input
              id="seed"
              type="number"
              placeholder="Leave empty for random seed"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              disabled={isLoading}
            />
            <p className="text-xs text-muted-foreground">
              Each generation uses a random seed. Set a seed to reproduce the same image.
            </p>
          </div>
        </div>

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isLoading}
          className="w-full"
          size="lg"
        >
          {isLoading ? (
            <>
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4 mr-2" />
              Generate Image
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}
