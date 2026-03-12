import { useState, useEffect, useRef, useCallback } from "react";
import { useGpuInfo } from "../../hooks/useGpuInfo";
import { useMemoryEstimate } from "../../hooks/useMemoryEstimate";
import { authenticatedFetch } from "../../utils/api";
import { cn } from "../../lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Cpu,
  AlertTriangle,
  Settings2,
} from "lucide-react";

const MEMORY_FLAG_LABELS = {
  offloadToCpu: { label: "Offload to CPU", description: "Free weights between phases (lower VRAM peak)" },
  clipOnCpu: { label: "CLIP on CPU", description: "Run text encoders on CPU only" },
  vaeOnCpu: { label: "VAE on CPU", description: "Run VAE decoder on CPU (slower but saves VRAM)" },
  vaeTiling: { label: "VAE Tiling", description: "Process VAE in tiles (much less VRAM)" },
  diffusionFa: { label: "Flash Attention", description: "Use flash attention for diffusion model" },
};

// Component color mapping
const colorMap = {
  green: "bg-green-500/20 text-green-400 border-green-500/30",
  yellow: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  orange: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  red: "bg-red-500/20 text-red-400 border-red-500/30",
};

const placementLabel = {
  gpu: "GPU",
  offload: "Offload",
  cpu: "CPU",
};

const DEFAULT_FLAGS = {
  offloadToCpu: true,
  clipOnCpu: true,
  vaeOnCpu: true,
  vaeTiling: false,
  diffusionFa: true,
};

function loadMemoryFlagsFromStorage(modelId) {
  try {
    const stored = localStorage.getItem(`memoryFlags:${modelId}`);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

function saveMemoryFlagsToStorage(modelId, flags) {
  try {
    localStorage.setItem(`memoryFlags:${modelId}`, JSON.stringify(flags));
  } catch (e) {
    // silently fail
  }
}

// Short display names for components
function shortName(name) {
  const map = {
    'diffusion-model': 'Model',
    'vae': 'VAE',
    'llm': 'LLM',
    'clip-l': 'CLIP',
    't5-xxl': 'T5',
    'clip-g': 'CLIP-G',
    'clip': 'CLIP',
    'clip-vision': 'CLIPv',
    'qwen2vl': 'Qwen',
    'text-encoder': 'TxtEnc',
    'mmdit': 'MMDiT',
    'llm-vision': 'LLMv',
  };
  return map[name] || name;
}

/**
 * MemoryInlineBar - Always-visible GPU name + component badges for the generate button row
 */
export function MemoryInlineBar({
  selectedModelId,
  modelConfig,
  width = 1024,
  height = 1024,
  flags,
  components,
  gpuInfo,
  estimate,
}) {
  const vramTotal = gpuInfo?.vramTotalMB || 0;
  const cliPeak = estimate?.cliMode?.peakVramMB || estimate?.peakVramMB || 0;
  const fitsInVram = vramTotal > 0 ? cliPeak <= vramTotal : true;

  if (!selectedModelId) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {/* GPU name */}
      {gpuInfo?.available && (
        <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          {gpuInfo.name?.replace('NVIDIA ', '').replace('GeForce ', '')}
          {vramTotal > 0 && (
            <span className="opacity-70">({Math.round(vramTotal / 1024)}GB)</span>
          )}
        </span>
      )}

      {/* VRAM estimate badge */}
      {cliPeak > 0 && (
        <span className={cn(
          "text-xs font-mono px-1.5 py-0.5 rounded border whitespace-nowrap",
          fitsInVram
            ? "bg-green-500/10 text-green-400 border-green-500/20"
            : "bg-red-500/10 text-red-400 border-red-500/20"
        )}>
          ~{cliPeak >= 1024 ? `${(cliPeak / 1024).toFixed(1)}GB` : `${cliPeak}MB`}
        </span>
      )}

      {/* Component badges */}
      {components.length > 0 && (
        <div className="flex gap-0.5">
          {components.map((comp, i) => (
            <span
              key={i}
              className={cn(
                "inline-flex items-center px-1 py-0 rounded border text-[10px] leading-tight",
                colorMap[comp.color] || colorMap.green
              )}
              title={`${comp.name}: ${placementLabel[comp.placement] || comp.placement}`}
            >
              {shortName(comp.name)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * MemoryPopover - Expandable details panel (VRAM bar, flags, mode selector)
 * Positioned absolutely above the trigger to avoid reflowing the page.
 */
export function MemoryPopover({
  selectedModelId,
  modelConfig,
  width = 1024,
  height = 1024,
  flags,
  onFlagsChange,
  execMode,
  onExecModeChange,
  gpuInfo,
  estimate,
  components,
}) {
  const [open, setOpen] = useState(false);
  const popoverRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e) {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target) &&
        triggerRef.current && !triggerRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [open]);

  const vramTotal = gpuInfo?.vramTotalMB || 0;
  const cliPeak = estimate?.cliMode?.peakVramMB || estimate?.peakVramMB || 0;
  const serverPeak = estimate?.serverMode?.peakVramMB || 0;
  const activePeak = execMode === 'server' ? serverPeak || cliPeak : cliPeak;
  const vramPercent = vramTotal > 0 ? Math.min(100, Math.round((activePeak / vramTotal) * 100)) : 0;
  const fitsInVram = vramTotal > 0 ? activePeak <= vramTotal : true;
  const vramBarColor = vramPercent > 90 ? "bg-red-500" : vramPercent > 70 ? "bg-yellow-500" : "bg-green-500";

  if (!selectedModelId) return null;

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex items-center justify-center rounded-md text-sm h-9 w-9 border border-input bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors",
          open && "bg-accent text-accent-foreground"
        )}
        title="Memory settings"
      >
        <Settings2 className="h-4 w-4" />
      </button>

      {/* Popover - opens upward */}
      {open && (
        <div
          ref={popoverRef}
          className="absolute bottom-full right-0 mb-2 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg z-50"
        >
          <div className="p-3 space-y-3">
            {/* Header */}
            <div className="text-xs font-medium">Memory Settings</div>

            {/* GPU Info */}
            {gpuInfo?.available && (
              <div className="text-[11px] text-muted-foreground">
                {gpuInfo.name}
                {gpuInfo.driver && ` - Driver ${gpuInfo.driver}`}
                {gpuInfo.cudaVersion && ` / CUDA ${gpuInfo.cudaVersion}`}
              </div>
            )}

            {/* Exec Mode selector */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Execution Mode</div>
              <Select value={execMode} onValueChange={onExecModeChange}>
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="top">
                  <SelectItem value="auto">Auto (CLI for single, Server for batch)</SelectItem>
                  <SelectItem value="cli">CLI only (lower VRAM)</SelectItem>
                  <SelectItem value="server">Server only (faster re-gen)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* VRAM Bar */}
            {vramTotal > 0 && cliPeak > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">VRAM ({width}x{height})</span>
                  <span className={cn("font-mono", fitsInVram ? "text-green-400" : "text-red-400")}>
                    {activePeak} / {vramTotal} MB ({vramPercent}%)
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", vramBarColor)}
                    style={{ width: `${vramPercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-muted-foreground">
                  <span>CLI: ~{cliPeak}MB</span>
                  {serverPeak > 0 && <span>Server: ~{serverPeak}MB</span>}
                </div>
                {!fitsInVram && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Exceeds VRAM - enable VAE tiling or VAE on CPU</span>
                  </div>
                )}
              </div>
            )}

            {/* Memory Flag Toggles */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Memory Flags</div>
              {Object.entries(MEMORY_FLAG_LABELS).map(([key, { label, description }]) => (
                <label
                  key={key}
                  className="flex items-center justify-between py-0.5 cursor-pointer group"
                  title={description}
                >
                  <span className="text-xs group-hover:text-foreground text-muted-foreground transition-colors">
                    {label}
                  </span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={flags[key]}
                    onClick={() => onFlagsChange?.({ ...flags, [key]: !flags[key] })}
                    className={cn(
                      "relative inline-flex h-4 w-7 shrink-0 rounded-full border-2 border-transparent transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      flags[key] ? "bg-primary" : "bg-muted"
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none block h-3 w-3 rounded-full bg-background shadow-lg ring-0 transition-transform",
                        flags[key] ? "translate-x-3" : "translate-x-0"
                      )}
                    />
                  </button>
                </label>
              ))}
            </div>

            {/* Weight breakdown */}
            {estimate?.weights && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">Weight Sizes</div>
                <div className="grid grid-cols-3 gap-1 text-[11px] text-muted-foreground font-mono">
                  <span>Diff: {estimate.weights.diffusionMB}MB</span>
                  <span>Text: {estimate.weights.textEncoderMB}MB</span>
                  <span>VAE: {estimate.weights.vaeMB}MB</span>
                </div>
              </div>
            )}

            {/* Component legend */}
            {components.length > 0 && (
              <div className="flex gap-3 text-[10px] text-muted-foreground pt-1 border-t">
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> GPU
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" /> Offload
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> CPU
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * MemoryPanel - Composite component managing all memory state
 * Renders both the inline bar (for the generate button row)
 * and the popover (for detailed settings)
 */
export function MemoryPanel({
  selectedModelId,
  modelConfig,
  width = 1024,
  height = 1024,
}) {
  const { gpuInfo } = useGpuInfo();

  // Memory flags state (defaults match settings.yml memory_defaults)
  const [flags, setFlags] = useState(DEFAULT_FLAGS);

  // Exec mode state
  const [execMode, setExecMode] = useState("auto");

  // Components state
  const [components, setComponents] = useState([]);

  // Update flags when model changes
  useEffect(() => {
    if (!selectedModelId) return;
    
    // Load order: 1) localStorage (if exists), 2) modelConfig.memoryFlags, 3) hardcoded defaults
    const storedFlags = loadMemoryFlagsFromStorage(selectedModelId);
    if (storedFlags) {
      setFlags({ ...DEFAULT_FLAGS, ...storedFlags });
    } else if (modelConfig?.memoryFlags) {
      const mf = modelConfig.memoryFlags;
      setFlags({
        offloadToCpu: mf.offload_to_cpu ?? DEFAULT_FLAGS.offloadToCpu,
        clipOnCpu: mf.clip_on_cpu ?? DEFAULT_FLAGS.clipOnCpu,
        vaeOnCpu: mf.vae_on_cpu ?? DEFAULT_FLAGS.vaeOnCpu,
        vaeTiling: mf.vae_tiling ?? DEFAULT_FLAGS.vaeTiling,
        diffusionFa: mf.diffusion_fa ?? DEFAULT_FLAGS.diffusionFa,
      });
    } else {
      setFlags(DEFAULT_FLAGS);
    }
    // Read exec mode from model config
    const mode = modelConfig?.exec_mode || modelConfig?.execMode || "auto";
    setExecMode(mode);
  }, [selectedModelId, modelConfig?.memoryFlags, modelConfig?.exec_mode, modelConfig?.execMode]);

  // Fetch memory estimate
  const { estimate } = useMemoryEstimate(
    selectedModelId,
    width,
    height,
    flags
  );

  // Fetch components when model changes
  useEffect(() => {
    if (!selectedModelId) {
      setComponents([]);
      return;
    }

    let cancelled = false;
    async function fetchComponents() {
      try {
        const response = await authenticatedFetch(`/api/models/${selectedModelId}/memory-components`);
        if (!response.ok) return;
        const data = await response.json();
        if (!cancelled) {
          setComponents(data.components || []);
        }
      } catch (err) {
        // silently fail
      }
    }

    fetchComponents();
    return () => { cancelled = true; };
  }, [selectedModelId]);

  const handleFlagsChange = useCallback((newFlags) => {
    setFlags(newFlags);
    // Save to localStorage
    if (selectedModelId) {
      saveMemoryFlagsToStorage(selectedModelId, newFlags);
      // Also persist to backend
      authenticatedFetch(`/api/models/${selectedModelId}/memory-flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          offloadToCpu: newFlags.offloadToCpu,
          clipOnCpu: newFlags.clipOnCpu,
          vaeOnCpu: newFlags.vaeOnCpu,
          vaeTiling: newFlags.vaeTiling,
          diffusionFa: newFlags.diffusionFa,
        }),
      }).catch(() => {});
    }
  }, [selectedModelId]);

  const handleExecModeChange = useCallback((newMode) => {
    setExecMode(newMode);
  }, []);

  if (!selectedModelId) return null;

  const inlineEl = (
    <MemoryInlineBar
      selectedModelId={selectedModelId}
      modelConfig={modelConfig}
      width={width}
      height={height}
      flags={flags}
      components={components}
      gpuInfo={gpuInfo}
      estimate={estimate}
    />
  );

  const popoverEl = (
    <MemoryPopover
      selectedModelId={selectedModelId}
      modelConfig={modelConfig}
      width={width}
      height={height}
      flags={flags}
      onFlagsChange={handleFlagsChange}
      execMode={execMode}
      onExecModeChange={handleExecModeChange}
      gpuInfo={gpuInfo}
      estimate={estimate}
      components={components}
    />
  );

  return (
    <div className="flex items-center gap-2">
      {inlineEl}
      {popoverEl}
    </div>
  );
}

export default MemoryPanel;
