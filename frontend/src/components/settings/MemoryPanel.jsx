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
      const parsed = JSON.parse(stored);
      // Backward compatibility: old format stored flags directly
      if (parsed && typeof parsed === "object" && parsed.flags) {
        return {
          flags: parsed.flags,
          manual: Boolean(parsed.manual),
        };
      }
      return {
        flags: parsed,
        manual: true,
      };
    }
  } catch (e) {
    // silently fail
  }
  return null;
}

function saveMemoryFlagsToStorage(modelId, flags, manual = true) {
  try {
    localStorage.setItem(`memoryFlags:${modelId}`, JSON.stringify({ flags, manual }));
  } catch (e) {
    // silently fail
  }
}

async function persistMemoryFlagsToBackend(modelId, flags) {
  if (!modelId) return;
  await authenticatedFetch(`/api/models/${modelId}/memory-flags`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      offloadToCpu: flags.offloadToCpu,
      clipOnCpu: flags.clipOnCpu,
      vaeOnCpu: flags.vaeOnCpu,
      vaeTiling: flags.vaeTiling,
      diffusionFa: flags.diffusionFa,
    }),
  });
}

function getFlagsFromModelConfig(modelConfig) {
  if (!modelConfig?.memoryFlags) return DEFAULT_FLAGS;
  const mf = modelConfig.memoryFlags;
  return {
    offloadToCpu: mf.offload_to_cpu ?? DEFAULT_FLAGS.offloadToCpu,
    clipOnCpu: mf.clip_on_cpu ?? DEFAULT_FLAGS.clipOnCpu,
    vaeOnCpu: mf.vae_on_cpu ?? DEFAULT_FLAGS.vaeOnCpu,
    vaeTiling: mf.vae_tiling ?? DEFAULT_FLAGS.vaeTiling,
    diffusionFa: mf.diffusion_fa ?? DEFAULT_FLAGS.diffusionFa,
  };
}

function areFlagsEqual(a = {}, b = {}) {
  return (
    a.offloadToCpu === b.offloadToCpu &&
    a.clipOnCpu === b.clipOnCpu &&
    a.vaeOnCpu === b.vaeOnCpu &&
    a.vaeTiling === b.vaeTiling &&
    a.diffusionFa === b.diffusionFa
  );
}

function getCliPeakMB(estimate) {
  return estimate?.cli?.usage?.peakVramMB || estimate?.cliMode?.peakVramMB || estimate?.peakVramMB || 0;
}

function getServerPeakMB(estimate) {
  return estimate?.server?.usage?.peakVramMB || estimate?.serverMode?.peakVramMB || 0;
}

function formatGbCompact(mb) {
  if (!Number.isFinite(mb) || mb <= 0) {
    return "0";
  }

  const gb = mb / 1024;
  if (gb >= 10) {
    return gb.toFixed(0);
  }
  return gb.toFixed(1).replace(/\.0$/, "");
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
  const vramUsed = gpuInfo?.vramUsedMB || 0;
  const vramFree = gpuInfo?.vramFreeMB || 0;
  const cliPeak = getCliPeakMB(estimate);
  const vramBudget = estimate?.availableVramMB || vramFree || vramTotal;
  const fitsInVram = vramBudget > 0 ? cliPeak <= vramBudget : true;

  const breakdown = gpuInfo?.breakdownMB || {};
  const imageMB = breakdown.image || 0;
  const videoMB = breakdown.video || 0;
  const llmMB = breakdown.llm || 0;
  const systemMB = breakdown.system || 0;

  const imageWidth = vramTotal > 0 ? Math.max(0, (imageMB / vramTotal) * 100) : 0;
  const videoWidth = vramTotal > 0 ? Math.max(0, (videoMB / vramTotal) * 100) : 0;
  const llmWidth = vramTotal > 0 ? Math.max(0, (llmMB / vramTotal) * 100) : 0;
  const systemWidth = vramTotal > 0 ? Math.max(0, (systemMB / vramTotal) * 100) : 0;

  if (!selectedModelId) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap min-w-0">
      {/* GPU name */}
      {gpuInfo?.available && (
        <span className="text-xs text-muted-foreground whitespace-nowrap flex items-center gap-1">
          <Cpu className="h-3 w-3" />
          {gpuInfo.name?.replace('NVIDIA ', '').replace('GeForce ', '')}
          {vramTotal > 0 && (
            <span
              className="font-mono text-[11px] text-foreground/90"
              title={`Free ${formatGbCompact(vramFree)}g`}
            >
              [{formatGbCompact(vramUsed)}/{formatGbCompact(vramTotal)}]
            </span>
          )}
        </span>
      )}

      {/* Live VRAM tiny bar + category breakdown */}
      {vramTotal > 0 && (
        <span
          className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground"
          title={`Free VRAM: ${formatGbCompact(vramFree)}g`}
        >
          <span className="h-1.5 w-14 overflow-hidden rounded-full border border-border bg-muted/60">
            <span className="flex h-full w-full">
              <span className="bg-blue-500/90" style={{ width: `${imageWidth}%` }} />
              <span className="bg-cyan-400/90" style={{ width: `${videoWidth}%` }} />
              <span className="bg-emerald-500/90" style={{ width: `${llmWidth}%` }} />
              <span className="bg-amber-400/90" style={{ width: `${systemWidth}%` }} />
            </span>
          </span>
          <span>[img:{formatGbCompact(imageMB)}g video:{formatGbCompact(videoMB)}g llm:{formatGbCompact(llmMB)}g sys:{formatGbCompact(systemMB)}g]</span>
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
  isManualFlags,
  onManualModeChange,
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
  const vramFree = estimate?.availableVramMB || gpuInfo?.vramFreeMB || vramTotal;
  const cliPeak = getCliPeakMB(estimate);
  const serverPeak = getServerPeakMB(estimate);
  const activePeak = execMode === 'server' ? serverPeak || cliPeak : cliPeak;
  const vramPercent = vramFree > 0 ? Math.min(100, Math.round((activePeak / vramFree) * 100)) : 0;
  const fitsInVram = vramFree > 0 ? activePeak <= vramFree : true;
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
          className="absolute bottom-full left-0 mb-2 w-72 rounded-lg border bg-popover text-popover-foreground shadow-lg z-50"
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
            {vramFree > 0 && cliPeak > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">VRAM Free ({width}x{height})</span>
                  <span className={cn("font-mono", fitsInVram ? "text-green-400" : "text-red-400")}>
                    {activePeak} / {vramFree} MB ({vramPercent}%)
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
                {!fitsInVram && isManualFlags && (
                  <div className="flex items-center gap-1 text-xs text-red-400">
                    <AlertTriangle className="h-3 w-3" />
                    <span>Exceeds VRAM in manual mode</span>
                  </div>
                )}
              </div>
            )}

            {/* Auto/manual mode */}
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">Memory Management</div>
              <div className="inline-flex rounded-md border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => onManualModeChange?.(false)}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    !isManualFlags ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Auto
                </button>
                <button
                  type="button"
                  onClick={() => onManualModeChange?.(true)}
                  className={cn(
                    "px-2 py-1 text-xs rounded transition-colors",
                    isManualFlags ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  Manual
                </button>
              </div>
            </div>

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
  showInlineBar = true,
}) {
  const { gpuInfo } = useGpuInfo();

  // Memory flags state (defaults match settings.yml memory_defaults)
  const [flags, setFlags] = useState(DEFAULT_FLAGS);
  const [isManualFlags, setIsManualFlags] = useState(false);

  // Exec mode state
  const [execMode, setExecMode] = useState("auto");

  // Components state
  const [components, setComponents] = useState([]);

  // Update flags when model changes
  useEffect(() => {
    if (!selectedModelId) return;
    
    // Load order: 1) localStorage (if exists), 2) modelConfig.memoryFlags, 3) hardcoded defaults
    const storedFlags = loadMemoryFlagsFromStorage(selectedModelId);
    if (storedFlags?.flags) {
      setFlags({ ...DEFAULT_FLAGS, ...storedFlags.flags });
      setIsManualFlags(Boolean(storedFlags.manual));
    } else if (modelConfig?.memoryFlags) {
      setFlags(getFlagsFromModelConfig(modelConfig));
      setIsManualFlags(false);
    } else {
      setFlags(DEFAULT_FLAGS);
      setIsManualFlags(false);
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

  // Auto-adjust flags from recommendation when user has not manually overridden this model
  useEffect(() => {
    if (!selectedModelId || isManualFlags || !estimate?.recommendedFlags) {
      return;
    }

    const recommended = {
      offloadToCpu: estimate.recommendedFlags.offloadToCpu,
      clipOnCpu: estimate.recommendedFlags.clipOnCpu,
      vaeOnCpu: estimate.recommendedFlags.vaeOnCpu,
      vaeTiling: estimate.recommendedFlags.vaeTiling,
      diffusionFa: estimate.recommendedFlags.diffusionFa,
    };

    if (!areFlagsEqual(flags, recommended)) {
      setFlags(recommended);
      saveMemoryFlagsToStorage(selectedModelId, recommended, false);
      persistMemoryFlagsToBackend(selectedModelId, recommended).catch(() => {});
    }
  }, [selectedModelId, estimate?.recommendedFlags, isManualFlags, flags]);

  // Fetch components when model changes
  useEffect(() => {
    if (!selectedModelId) {
      setComponents([]);
      return;
    }

    let cancelled = false;
    async function fetchComponents() {
      try {
        const params = new URLSearchParams({
          offloadToCpu: flags.offloadToCpu ? "1" : "0",
          clipOnCpu: flags.clipOnCpu ? "1" : "0",
          vaeOnCpu: flags.vaeOnCpu ? "1" : "0",
          vaeTiling: flags.vaeTiling ? "1" : "0",
          diffusionFa: flags.diffusionFa ? "1" : "0",
        });
        const response = await authenticatedFetch(`/api/models/${selectedModelId}/memory-components?${params}`);
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
  }, [selectedModelId, flags.offloadToCpu, flags.clipOnCpu, flags.vaeOnCpu, flags.vaeTiling, flags.diffusionFa]);

  const handleFlagsChange = useCallback((newFlags) => {
    setFlags(newFlags);
    setIsManualFlags(true);
    // Save to localStorage
    if (selectedModelId) {
      saveMemoryFlagsToStorage(selectedModelId, newFlags, true);
      // Also persist to backend
      persistMemoryFlagsToBackend(selectedModelId, newFlags).catch(() => {});
    }
  }, [selectedModelId]);

  const handleManualModeChange = useCallback((manual) => {
    setIsManualFlags(manual);
    if (!selectedModelId) {
      return;
    }

    if (!manual && estimate?.recommendedFlags) {
      const recommended = {
        offloadToCpu: estimate.recommendedFlags.offloadToCpu,
        clipOnCpu: estimate.recommendedFlags.clipOnCpu,
        vaeOnCpu: estimate.recommendedFlags.vaeOnCpu,
        vaeTiling: estimate.recommendedFlags.vaeTiling,
        diffusionFa: estimate.recommendedFlags.diffusionFa,
      };
      setFlags(recommended);
      saveMemoryFlagsToStorage(selectedModelId, recommended, false);
      persistMemoryFlagsToBackend(selectedModelId, recommended).catch(() => {});
      return;
    }

    saveMemoryFlagsToStorage(selectedModelId, flags, manual);
  }, [selectedModelId, estimate?.recommendedFlags, flags]);

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
      isManualFlags={isManualFlags}
      onManualModeChange={handleManualModeChange}
      execMode={execMode}
      onExecModeChange={handleExecModeChange}
      gpuInfo={gpuInfo}
      estimate={estimate}
      components={components}
    />
  );

  return (
    <div className="flex items-center gap-2">
      {showInlineBar && inlineEl}
      {popoverEl}
    </div>
  );
}

export default MemoryPanel;
