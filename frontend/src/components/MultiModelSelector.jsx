import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  ChevronDown,
  ChevronRight,
  Play,
  Square,
  Download,
  Circle,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Cpu,
  Eye,
  EyeOff,
  ArrowDownToLine,
  ArrowUpFromLine,
  Grid3X3,
  Zap,
  Image,
  LetterText,
  Settings,
  Server,
} from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Checkbox } from "./ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { authenticatedFetch } from "../utils/api";
import { useDownloadProgress, useWebSocket, WS_CHANNELS } from "../hooks/useWebSocket";
import { useMemoryEstimate } from "../hooks/useMemoryEstimate";

const API_V1 = "/api/v1/models";
const SETTINGS_STATE_KEY = "sd-cpp-studio-settings-form-state";
const SETTINGS_STATE_EVENT = "sd-cpp-studio-settings-form-updated";

const MEMORY_FLAG_LABELS = {
  offloadToCpu: { label: "Offload to CPU", icon: ArrowDownToLine, iconAlt: ArrowUpFromLine },
  clipOnCpu: { label: "CLIP on CPU", icon: LetterText, iconAlt: Cpu },
  vaeOnCpu: { label: "VAE on CPU", icon: Image, iconAlt: Cpu },
  vaeTiling: { label: "VAE Tiling", icon: Grid3X3, iconAlt: Grid3X3 },
  diffusionFa: { label: "Flash Attention", icon: Zap, iconAlt: Zap },
};

function loadMemoryFlagsFromStorage(modelId) {
  try {
    const stored = localStorage.getItem(`memoryFlags:${modelId}`);
    if (stored) {
      const parsed = JSON.parse(stored);
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

const DEFAULT_FLAGS = {
  offloadToCpu: true,
  clipOnCpu: true,
  vaeOnCpu: true,
  vaeTiling: false,
  diffusionFa: true,
};

function getEstimateDimensions() {
  try {
    const stored = localStorage.getItem(SETTINGS_STATE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        width: Number(parsed?.width) || 1024,
        height: Number(parsed?.height) || 1024,
      };
    }
  } catch (e) {
    // silently fail
  }
  return { width: 1024, height: 1024 };
}

function formatProjectedGb(mb) {
  if (!Number.isFinite(mb) || mb <= 0) {
    return "0";
  }
  const gb = mb / 1024;
  if (gb >= 10) {
    return gb.toFixed(0);
  }
  return gb.toFixed(1).replace(/\.0$/, "");
}

function getProjectedPeakMB(estimate) {
  return estimate?.cli?.usage?.peakVramMB || estimate?.cliMode?.peakVramMB || estimate?.peakVramMB || 0;
}

function ProjectedMemoryBadge({ modelId, width, height, flags }) {
  const { estimate } = useMemoryEstimate(modelId, width, height, flags);
  const peakMB = getProjectedPeakMB(estimate);
  const budgetMB = estimate?.availableVramMB || estimate?.gpuFreeVramMB || estimate?.gpuVramMB || 0;

  if (!peakMB) {
    return null;
  }

  const percent = budgetMB > 0 ? Math.min(100, Math.round((peakMB / budgetMB) * 100)) : 0;
  const fits = budgetMB > 0 ? peakMB <= budgetMB : true;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-xs font-mono",
        fits
          ? "bg-green-500/10 text-green-400 border-green-500/20"
          : "bg-red-500/10 text-red-400 border-red-500/20"
      )}
      title={`Projected VRAM peak (${width}x${height}): ${peakMB}MB / ${budgetMB || 0}MB free`}
    >
      [{formatProjectedGb(peakMB)}/{formatProjectedGb(budgetMB)}]
      <span className="h-1 w-8 rounded-full bg-muted/70 overflow-hidden">
        <span
          className={cn("block h-full", fits ? "bg-green-500" : "bg-red-500")}
          style={{ width: `${percent}%` }}
        />
      </span>
    </span>
  );
}

/**
 * Analyze model args and return array of component types
 * @param {Object} model - Model configuration object
 * @returns {Array} Array of component types (e.g., ['model', 'vae', 'llm'])
 */
const getModelComponents = (model) => {
  if (!model || !model.args || !Array.isArray(model.args)) {
    return [];
  }

  const args = model.args;
  const components = new Set();

  if (args.includes('--diffusion-model') || args.includes('--model') || args.includes('-m')) {
    components.add('model');
  }
  if (args.includes('--vae')) {
    components.add('vae');
  }
  if (args.includes('--llm') || args.includes('--llm_vision')) {
    components.add('llm');
  }
  if (args.includes('--clip_l') || args.includes('--clip') || args.includes('--clip_g')) {
    components.add('clip');
  }
  if (args.includes('--t5xxl')) {
    components.add('t5');
  }
  if (args.includes('--clip_vision')) {
    components.add('clip_vision');
  }
  if (args.includes('--embeddings')) {
    components.add('embeddings');
  }
  if (args.includes('--text_encoder') || args.includes('--tokenizer')) {
    components.add('text_encoder');
  }
  if (args.includes('--mmdit')) {
    components.add('mmdit');
  }

  return Array.from(components);
};

/**
 * Component badge configuration
 */
const COMPONENT_CONFIG = {
  model: { label: 'M', title: 'Model (diffusion)', color: '#22c55e', bg: 'rgba(34, 197, 94, 0.15)', border: 'rgba(34, 197, 94, 0.3)' },
  vae: { label: 'V', title: 'VAE', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' },
  llm: { label: 'L', title: 'LLM', color: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.15)', border: 'rgba(139, 92, 246, 0.3)' },
  clip: { label: 'C', title: 'CLIP', color: '#06b6d4', bg: 'rgba(6, 182, 212, 0.15)', border: 'rgba(6, 182, 212, 0.3)' },
  t5: { label: 'T5', title: 'T5XXL', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', border: 'rgba(236, 72, 153, 0.3)' },
  clip_vision: { label: 'CV', title: 'CLIP Vision', color: '#14b8a6', bg: 'rgba(20, 184, 166, 0.15)', border: 'rgba(20, 184, 166, 0.3)' },
  embeddings: { label: 'E', title: 'Embeddings', color: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)' },
  text_encoder: { label: 'TE', title: 'Text Encoder', color: '#64748b', bg: 'rgba(100, 116, 139, 0.15)', border: 'rgba(100, 116, 139, 0.3)' },
  mmdit: { label: 'MMDIT', title: 'MMDIT', color: '#84cc16', bg: 'rgba(132, 204, 22, 0.15)', border: 'rgba(132, 204, 22, 0.3)' },
};

// Model status constants
// Status is now directly from API: "stopped", "starting", "running", "stopping", "error"

// Download status constants
const DOWNLOAD_STATUS = {
  PENDING: "pending",
  DOWNLOADING: "downloading",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

/**
 * Filter models based on mode
 * @param {Array} allModels - All models from API
 * @param {string} mode - Mode to filter by ('image', 'imgedit', 'video', 'text', 'upscale')
 * @returns {Array} Filtered models
 */
const filterModels = (allModels, mode) => {
  switch (mode) {
    case "image":
      return allModels.filter((m) => {
        // New format: use architecture
        if (m.architecture?.output_modalities) {
          const input = m.architecture.input_modalities || [];
          const output = m.architecture.output_modalities || [];
          return input.includes("text") && output.includes("image") && !output.includes("video");
        }
        // Legacy: use capabilities
        return m.capabilities?.includes("text-to-image") && !m.capabilities?.includes("video");
      });
    case "imgedit":
      return allModels.filter((m) => {
        // New format: use architecture
        if (m.architecture?.output_modalities) {
          const input = m.architecture.input_modalities || [];
          const output = m.architecture.output_modalities || [];
          return input.includes("image") && output.includes("image") && !output.includes("video");
        }
        // Legacy: use capabilities
        return m.capabilities?.includes("image-to-image") || m.capabilities?.includes("imgedit");
      });
    case "video":
      return allModels.filter((m) => {
        // New format: use architecture
        if (m.architecture?.output_modalities) {
          return m.architecture.output_modalities.includes("video");
        }
        // Legacy: use capabilities
        return m.capabilities?.includes("video");
      });
    case "text":
      return allModels.filter((m) => {
        // New format: use architecture
        if (m.architecture?.output_modalities) {
          const output = m.architecture.output_modalities || [];
          return output.includes("text") && !output.includes("image") && !output.includes("video");
        }
        // Legacy: use capabilities
        return m.capabilities?.includes("text-generation");
      });
    case "upscale":
      return null;
    default:
      return allModels;
  }
};

/**
 * MultiModelSelector Component
 *
 * A multi-select checkbox list for models with inline controls (start/stop/download).
 *
 * @param {Object} props
 * @param {string[]} props.selectedModels - Array of selected model IDs
 * @param {function} props.onModelsChange - Callback when model selection changes
 * @param {string[]} props.filterCapabilities - Optional capability filter (e.g., ['text-to-image'])
 * @param {string} props.mode - Mode for filtering ('image', 'imgedit', 'video', 'upscale')
 * @param {string} props.className - Additional CSS classes
 */
export function MultiModelSelector({
  selectedModels = [],
  onModelsChange,
  filterCapabilities = null,
  mode = null,
  enableMemoryControls = true,
  className = "",
}) {
  const [allModels, setAllModels] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState({});
  const [expandedModels, setExpandedModels] = useState({});
  const [modelFilesStatus, setModelFilesStatus] = useState({});
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [showMissingModels, setShowMissingModels] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [memoryFlags, setMemoryFlags] = useState({});
  const [serverConfigModal, setServerConfigModal] = useState({ open: false, modelId: null, model: null });
  const [serverConfig, setServerConfig] = useState({ steps: 9, threads: "", extraArgs: "" });
  const [estimateDimensions, setEstimateDimensions] = useState(() => getEstimateDimensions());

  useEffect(() => {
    function syncEstimateDimensions() {
      const next = getEstimateDimensions();
      setEstimateDimensions((prev) => {
        if (prev.width === next.width && prev.height === next.height) {
          return prev;
        }
        return next;
      });
    }

    function handleStorage(event) {
      if (event.key === SETTINGS_STATE_KEY) {
        syncEstimateDimensions();
      }
    }

    syncEstimateDimensions();
    window.addEventListener(SETTINGS_STATE_EVENT, syncEstimateDimensions);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener(SETTINGS_STATE_EVENT, syncEstimateDimensions);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  // Keep a ref to the latest fetchModels function for polling
  const fetchModelsRef = useRef(null);

  // Fetch all models (no filtering - filtering is done via useMemo)
  const fetchModels = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`${API_V1}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.statusText}`);
      }
      const data = await response.json();
      const models = data.data || [];

      setAllModels(models);

      // Extract file status from each model (v1 doesn't have this, but keep for compatibility)
      const fileStatusMap = {};
      for (const model of models) {
        if (model.fileStatus) {
          fileStatusMap[model.id] = model.fileStatus;
        }
      }
      setModelFilesStatus(fileStatusMap);

      return data;
    } catch (err) {
      console.error("Error fetching models:", err);
      toast.error("Failed to load models");
      return null;
    }
  }, []); // No deps - only run when called directly

  // Filter models based on mode and filterCapabilities
  const models = useMemo(() => {
    let filtered = allModels;

    // Apply filterCapabilities if provided
    if (filterCapabilities && Array.isArray(filterCapabilities)) {
      filtered = filtered.filter((model) => {
        const modelCapabilities = model.capabilities || [];
        return filterCapabilities.some((cap) => modelCapabilities.includes(cap));
      });
    }

    // Apply mode filter if provided
    if (mode) {
      filtered = filterModels(filtered, mode);
      // Return null for upscale mode - it doesn't use generation models
      if (filtered === null) {
        return [];
      }
    }

    return filtered;
  }, [allModels, filterCapabilities, mode]);

  // Poll download progress
  const pollDownloadProgress = useCallback((jobId, modelId) => {
    const interval = setInterval(async () => {
      try {
        const response = await authenticatedFetch(`${API_V1}/download/${jobId}`);
        if (response.ok) {
          const data = await response.json();
          setDownloadProgress({
            status: data.status,
            progress: data.progress || 0,
            bytesDownloaded: data.bytes_downloaded,
            totalBytes: data.total_bytes,
            speed: data.speed,
            eta: data.eta,
            error: data.error,
            files: data.files,
          });

          if (
            data.status === DOWNLOAD_STATUS.COMPLETED ||
            data.status === DOWNLOAD_STATUS.FAILED ||
            data.status === DOWNLOAD_STATUS.CANCELLED
          ) {
            clearInterval(interval);
            if (data.status === DOWNLOAD_STATUS.COMPLETED) {
              toast.success("Model downloaded successfully");
              await fetchModels(); // This refreshes both models and file status
            }
          }
        }
      } catch (error) {
        console.error("Error polling download progress:", error);
        clearInterval(interval);
      }
    }, 1000);
  }, [fetchModels]);

  // WebSocket download progress handler
  useDownloadProgress((message) => {
    if (message.type === 'progress' || message.type === 'started') {
      setDownloadProgress({
        status: message.data.status || DOWNLOAD_STATUS.DOWNLOADING,
        jobId: message.data.jobId,
        progress: (message.data.overallProgress || 0) / 100,
        bytesDownloaded: message.data.bytesDownloaded,
        totalBytes: message.data.totalBytes,
        speed: message.data.speed,
        eta: message.data.eta,
        fileName: message.data.fileName,
        fileProgress: message.data.fileProgress,
        modelName: models.find(m => m.id === message.data.modelId)?.name,
      });
    } else if (message.type === 'complete') {
      setDownloadProgress((prev) => ({ ...prev, status: DOWNLOAD_STATUS.COMPLETED, progress: 1 }));
      toast.success("Model downloaded successfully");
      fetchModels(); // Refresh models and file status
      setTimeout(() => setDownloadProgress(null), 3000);
    } else if (message.type === 'failed') {
      setDownloadProgress((prev) => ({ ...prev, status: DOWNLOAD_STATUS.FAILED, error: message.data.error }));
      toast.error(message.data.error || "Download failed");
    } else if (message.type === 'cancelled') {
      setDownloadProgress((prev) => ({ ...prev, status: DOWNLOAD_STATUS.CANCELLED }));
      toast.info("Download cancelled");
      setTimeout(() => setDownloadProgress(null), 2000);
    }
  });

  // Initial data load - only run on mount
  useEffect(() => {
    const loadInitialData = async () => {
      setIsLoading(true);
      await fetchModels();
      setIsLoading(false);
    };
    loadInitialData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps = only run on mount

  // Keep ref updated
  useEffect(() => {
    fetchModelsRef.current = fetchModels;
  }, [fetchModels]);

  // WebSocket model status updates (replaces polling)
  useWebSocket({
    channels: [WS_CHANNELS.MODELS],
    onMessage: (message) => {
      if (message.channel === WS_CHANNELS.MODELS && message.type === 'model_status_changed') {
        // Only refresh on actual status changes, not on 'subscribed' messages
        fetchModelsRef.current?.();
      }
    },
  });

  // Start a model with optional server config
  const startModel = async (modelId, serverSettings = null) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "starting" }));
    try {
      const body = serverSettings ? {
        steps: serverSettings.steps ? parseInt(serverSettings.steps, 10) : undefined,
        threads: serverSettings.threads ? parseInt(serverSettings.threads, 10) : undefined,
        extraArgs: serverSettings.extraArgs || undefined
      } : {};

      const response = await authenticatedFetch(`${API_V1}/${modelId}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to start model: ${response.statusText}`);
      }
      await fetchModels();
      toast.success(`Starting ${getModelById(modelId)?.name || modelId}...`);
    } catch (err) {
      console.error("Error starting model:", err);
      toast.error(err.message);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Open server config modal for a model
  const openServerConfigModal = (model) => {
    // Extract default steps from model args if available
    let defaultSteps = 9;
    if (model.args) {
      const stepsIdx = model.args.findIndex(arg => arg === '--steps');
      if (stepsIdx >= 0 && model.args[stepsIdx + 1]) {
        defaultSteps = parseInt(model.args[stepsIdx + 1], 10) || 9;
      } else if (model.generation_params?.sample_steps) {
        defaultSteps = model.generation_params.sample_steps;
      }
    }
    setServerConfig({ steps: defaultSteps, threads: "", extraArgs: "" });
    setServerConfigModal({ open: true, modelId: model.id, model });
  };

  // Handle server config modal confirm
  const handleServerConfigStart = () => {
    if (serverConfigModal.modelId) {
      startModel(serverConfigModal.modelId, serverConfig);
    }
    setServerConfigModal({ open: false, modelId: null, model: null });
  };

  // Stop a model
  const stopModel = async (modelId) => {
    setActionInProgress((prev) => ({ ...prev, [modelId]: "stopping" }));
    try {
      const response = await authenticatedFetch(`${API_V1}/${modelId}/stop`, {
        method: "POST",
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || `Failed to stop model: ${response.statusText}`);
      }
      await fetchModels();
      toast.success(`${getModelById(modelId)?.name || modelId} has been stopped`);
    } catch (err) {
      console.error("Error stopping model:", err);
      toast.error(err.message);
    } finally {
      setActionInProgress((prev) => ({ ...prev, [modelId]: null }));
    }
  };

  // Download a model
  const downloadModel = async (modelId) => {
    try {
      setDownloadProgress({ status: DOWNLOAD_STATUS.PENDING, progress: 0, modelId });

      const response = await authenticatedFetch(`${API_V1}/${modelId}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        const data = await response.json();
        setDownloadProgress({
          status: DOWNLOAD_STATUS.DOWNLOADING,
          jobId: data.downloadId,
          progress: 0,
          modelName: getModelById(modelId)?.name,
          repo: data.repo,
          modelId,
        });

        pollDownloadProgress(data.downloadId, modelId);
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to start download");
      }
    } catch (error) {
      console.error("Error downloading model:", error);
      setDownloadProgress({ status: DOWNLOAD_STATUS.FAILED, error: error.message });
      toast.error(error.message);
    }
  };

  // Get model by ID
  const getModelById = (modelId) => {
    return models.find((m) => m.id === modelId);
  };

  // Toggle model selection
  const toggleModelSelection = (modelId) => {
    const newSelection = selectedModels.includes(modelId)
      ? selectedModels.filter((id) => id !== modelId)
      : [...selectedModels, modelId];
    onModelsChange?.(newSelection);
  };

  // Toggle expand/collapse
  const toggleExpand = (modelId) => {
    setExpandedModels((prev) => ({
      ...prev,
      [modelId]: !prev[modelId],
    }));
  };

  // Get memory flags for a model (load from localStorage if not in state)
  const getMemoryFlags = (modelId) => {
    if (memoryFlags[modelId]) {
      return memoryFlags[modelId];
    }
    const stored = loadMemoryFlagsFromStorage(modelId);
    if (stored?.flags) {
      return { ...DEFAULT_FLAGS, ...stored.flags };
    }
    return DEFAULT_FLAGS;
  };

  // Toggle a memory flag
  const toggleMemoryFlag = (modelId, flagKey) => {
    const currentFlags = getMemoryFlags(modelId);
    const newFlags = { ...currentFlags, [flagKey]: !currentFlags[flagKey] };
    setMemoryFlags(prev => ({ ...prev, [modelId]: newFlags }));
    saveMemoryFlagsToStorage(modelId, newFlags, true);
  };

  // Select all models (only visible models based on showMissingModels filter)
  const selectAll = () => {
    const visibleModels = models.filter((model) => {
      const filesStatus = modelFilesStatus[model.id];
      const hasMissingFiles = filesStatus && !filesStatus.allFilesExist;
      return showMissingModels || !hasMissingFiles;
    });
    const visibleIds = visibleModels.map((m) => m.id);
    onModelsChange?.(visibleIds);
  };

  // Deselect all models
  const deselectAll = () => {
    onModelsChange?.([]);
  };

  // Status indicator component
  const StatusIndicator = ({ status, className }) => {
    const isRunning = status === "running";
    const isTransitioning = status === "starting" || status === "stopping";
    const isError = status === "error";

    if (isTransitioning) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <Loader2 className="h-3 w-3 animate-spin text-yellow-500" />
          <span className="text-xs text-muted-foreground">
            {status === "starting" ? "Starting..." : "Stopping..."}
          </span>
        </div>
      );
    }

    if (isError) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <AlertCircle className="h-3 w-3 text-red-500" />
          <span className="text-xs text-destructive">Error</span>
        </div>
      );
    }

    if (isRunning) {
      return (
        <div className={cn("flex items-center gap-1.5", className)}>
          <div className="relative">
            <Server className="h-3.5 w-3.5 text-green-500" />
            <div className="absolute -inset-1 bg-green-500/30 rounded-full animate-pulse" />
          </div>
          <span className="text-xs text-green-600 font-medium">Server Ready</span>
        </div>
      );
    }

    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        <Circle className="h-3 w-3 text-gray-400" />
        <span className="text-xs text-muted-foreground">Stopped</span>
      </div>
    );
  };

  // Format file size
  const formatBytes = (bytes) => {
    if (!bytes) return "Unknown";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  // Format speed
  const formatSpeed = (bytesPerSecond) => {
    if (!bytesPerSecond) return "";
    return formatBytes(bytesPerSecond) + "/s";
  };

  // Format ETA
  const formatETA = (seconds) => {
    if (!seconds) return "";
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${Math.round(seconds / 3600)}h`;
  };

  // Upscale mode doesn't use generation models - return null
  if (mode === "upscale") {
    return null;
  }

  if (isLoading) {
    return (
      <div className={cn("flex items-center justify-center py-12", className)}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-sm text-muted-foreground">Loading models...</span>
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={cn("text-center py-12", className)}>
        <Cpu className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <h3 className="text-lg font-semibold mb-2">No models available</h3>
        <p className="text-muted-foreground">
          {mode
            ? `No models configured for ${mode} mode`
            : "No models configured. Add models to your configuration files."}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header with controls - always visible */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center gap-2 hover:bg-muted/50 rounded px-2 py-1 transition-colors"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">Models</span>
            <Badge variant="secondary" className="text-xs">
              {selectedModels.length}/{models.length}
            </Badge>
          </div>
        </button>
        {!isCollapsed && (
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={selectAll} disabled={selectedModels.length === models.length} className="h-7 px-2 text-xs">
              All
            </Button>
            <Button size="sm" variant="outline" onClick={deselectAll} disabled={selectedModels.length === 0} className="h-7 px-2 text-xs">
              None
            </Button>
            <Button
              size="sm"
              variant={showMissingModels ? "default" : "outline"}
              onClick={() => setShowMissingModels(!showMissingModels)}
              className="h-7 w-7 p-0"
              title={showMissingModels ? "Hide Missing" : "Show Missing"}
            >
              {showMissingModels ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </div>

      {/* Collapsible content */}
      {!isCollapsed && (
        <>
      {/* Download progress display */}
      {downloadProgress && downloadProgress.status === DOWNLOAD_STATUS.DOWNLOADING && (
        <div className="bg-muted rounded-lg p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Downloading {downloadProgress.modelName || "model"}...</span>
            <span className="text-muted-foreground">{Math.round(downloadProgress.progress * 100)}%</span>
          </div>
          <div className="w-full bg-primary/10 rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300"
              style={{ width: `${downloadProgress.progress * 100}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            {downloadProgress.bytesDownloaded && downloadProgress.totalBytes && (
              <span>
                {formatBytes(downloadProgress.bytesDownloaded)} / {formatBytes(downloadProgress.totalBytes)}
              </span>
            )}
            <div className="text-right">
              {downloadProgress.speed && <span>{formatSpeed(downloadProgress.speed)}</span>}
              {downloadProgress.eta && <span> • {formatETA(downloadProgress.eta)} left</span>}
            </div>
          </div>
        </div>
      )}

      {/* Model list */}
      <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
        {models
          .filter((model) => {
            const filesStatus = modelFilesStatus[model.id];
            const hasMissingFiles = filesStatus && !filesStatus.allFilesExist;
            // If showMissingModels is false, hide models with missing files
            // If showMissingModels is true, show all models
            return showMissingModels || !hasMissingFiles;
          })
          .map((model) => {
          const isSelected = selectedModels.includes(model.id);
          const isExpanded = expandedModels[model.id];
          const filesStatus = modelFilesStatus[model.id];
          const hasMissingFiles = filesStatus && !filesStatus.allFilesExist;
          // CLI mode models have video capability, server mode models don't
          const isCliMode = model.capabilities?.includes('video');
          const isServerMode = !isCliMode;

          return (
            <div
              key={model.id}
              className={cn(
                "border rounded-lg overflow-hidden transition-colors",
                isSelected ? "bg-primary/5 border-primary/50" : "bg-card border-border hover:bg-muted/50"
              )}
            >
              {/* Main row */}
              <div className="flex items-center gap-2 p-1.5">
                {/* Expand/collapse button */}
                <button
                  onClick={() => toggleExpand(model.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>

                {/* Checkbox */}
                <Checkbox
                  checked={isSelected}
                  onChange={() => toggleModelSelection(model.id)}
                  className="flex-shrink-0"
                />

                {/* Model info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-medium text-sm truncate max-w-[150px] sm:max-w-none">{model.name}</span>
                    {model.quant && model.quant !== 'unknown' && (
                      <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wide border flex-shrink-0"
                        style={{
                          backgroundColor: 'rgba(139, 92, 246, 0.15)',
                          color: '#a78bfa',
                          borderColor: 'rgba(139, 92, 246, 0.3)'
                        }}
                      >
                        {model.quant}
                      </span>
                    )}
                    {enableMemoryControls && isSelected && isServerMode && (
                      <div className="inline-flex items-center gap-1 flex-shrink-0">
                        <span className="text-muted-foreground text-xs">Memory:</span>
                        <ProjectedMemoryBadge
                          modelId={model.id}
                          width={estimateDimensions.width}
                          height={estimateDimensions.height}
                          flags={getMemoryFlags(model.id)}
                        />
                      </div>
                    )}
                    {isSelected && (() => {
                      const components = getModelComponents(model);
                      return components.length > 0 ? (
                        <div className="flex items-center gap-0.5">
                          {components.map(comp => {
                            const config = COMPONENT_CONFIG[comp];
                            if (!config) return null;
                            return (
                              <span
                                key={comp}
                                className="inline-flex px-1 py-0.5 rounded text-xs font-semibold flex-shrink-0 cursor-help"
                                style={{
                                  backgroundColor: config.bg,
                                  color: config.color,
                                  borderColor: config.border,
                                  border: '1px solid'
                                }}
                                title={config.title}
                              >
                                {config.label}
                              </span>
                            );
                          })}
                        </div>
                      ) : null;
                    })()}
                    {isCliMode && (
                      <Badge variant="outline" className="gap-1 text-xs flex-shrink-0">
                        <Cpu className="h-3 w-3" />
                        CLI
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Status indicator */}
                <StatusIndicator status={model.status} className="flex-shrink-0" />

                {/* Action buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {hasMissingFiles && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadModel(model.id)}
                      disabled={!!downloadProgress}
                      className="gap-1.5"
                      title="Download model files"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  )}

                  {isServerMode && model.mode === "on_demand" && (
                    <>
                      {model.status === "running" ? (
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30 gap-1 h-6">
                            <Server className="h-3 w-3" />
                            Running
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => stopModel(model.id)}
                            disabled={actionInProgress[model.id] === "stopping"}
                            className="h-8 w-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Stop server"
                          >
                            {actionInProgress[model.id] === "stopping" ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => openServerConfigModal(model)}
                            disabled={actionInProgress[model.id] === "starting"}
                            className="gap-1.5 bg-green-600 hover:bg-green-700"
                            title="Configure and start server"
                          >
                            {actionInProgress[model.id] === "starting" ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Settings className="h-3.5 w-3.5" />
                            )}
                            Start
                          </Button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Expanded details */}
              {isExpanded && (
                <div className="border-t border-border bg-muted/30 p-1 space-y-2 text-sm">
                  {model.description && (
                    <div>
                      <span className="text-muted-foreground">Description: </span>
                      <span>{model.description}</span>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    <div>
                      <span className="text-muted-foreground">Mode: </span>
                      <span>{model.mode === "preload" ? "Preload" : "On-demand"}</span>
                    </div>

                    <div>
                      <span className="text-muted-foreground">Type: </span>
                      <span>{isCliMode ? "CLI" : "Server"}</span>
                    </div>

                    {model.capabilities && model.capabilities.length > 0 && (
                      <div>
                        <span className="text-muted-foreground">Capabilities: </span>
                        <span>{model.capabilities.join(", ")}</span>
                      </div>
                    )}
                  </div>

                  {/* Memory flags - only show when model is selected AND expanded */}
                  {enableMemoryControls && isSelected && isServerMode && (
                    <div className="flex flex-wrap items-center gap-1 pt-1 border-t border-border/50">
                      <span className="text-muted-foreground text-xs mr-1">Memory:</span>
                      {Object.entries(MEMORY_FLAG_LABELS).map(([key, { label, icon: Icon, iconAlt }]) => {
                        const flags = getMemoryFlags(model.id);
                        const isEnabled = flags[key];
                        const ToggleIcon = isEnabled ? Icon : iconAlt;
                        return (
                          <button
                            key={key}
                            onClick={() => toggleMemoryFlag(model.id, key)}
                            className={cn(
                              "h-5 w-5 rounded flex items-center justify-center transition-colors",
                              isEnabled
                                ? "bg-primary/20 text-primary hover:bg-primary/30"
                                : "bg-muted text-muted-foreground hover:bg-muted/80"
                            )}
                            title={label}
                          >
                            <ToggleIcon className="h-3 w-3" />
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* Files status */}
                  {filesStatus && filesStatus.files && (
                    <div className="space-y-1">
                      <span className="text-muted-foreground">Files: </span>
                      <div className="space-y-1 mt-1">
                        {filesStatus.files.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs">
                            {file.exists ? (
                              <CheckCircle2 className="h-3 w-3 text-green-500 flex-shrink-0" />
                            ) : (
                              <AlertCircle className="h-3 w-3 text-red-500 flex-shrink-0" />
                            )}
                            <span className={cn(file.exists ? "text-foreground" : "text-destructive")}>
                              {file.fileName} {file.exists ? "" : "(missing)"}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Error message */}
                  {model.status === "error" && model.error && (
                    <div className="text-xs text-destructive">
                      Error: {model.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
        </>
      )}

      {/* Server Config Modal */}
      <Dialog open={serverConfigModal.open} onOpenChange={(open) => setServerConfigModal({ ...serverConfigModal, open })}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5 text-green-600" />
              Server Configuration
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="steps">Steps</Label>
              <Input
                id="steps"
                type="number"
                min="1"
                max="100"
                value={serverConfig.steps}
                onChange={(e) => setServerConfig({ ...serverConfig, steps: e.target.value })}
                placeholder="9"
              />
              <p className="text-xs text-muted-foreground">Number of sampling steps (default: 9)</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="threads">Threads (optional)</Label>
              <Input
                id="threads"
                type="number"
                min="1"
                value={serverConfig.threads}
                onChange={(e) => setServerConfig({ ...serverConfig, threads: e.target.value })}
                placeholder="Auto"
              />
              <p className="text-xs text-muted-foreground">Number of CPU threads to use</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="extraArgs">Additional Arguments</Label>
              <Input
                id="extraArgs"
                value={serverConfig.extraArgs}
                onChange={(e) => setServerConfig({ ...serverConfig, extraArgs: e.target.value })}
                placeholder="--arg1 value1 --arg2 value2"
              />
              <p className="text-xs text-muted-foreground">Extra command line arguments</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setServerConfigModal({ open: false, modelId: null, model: null })}>
              Cancel
            </Button>
            <Button 
              onClick={handleServerConfigStart} 
              className="bg-green-600 hover:bg-green-700"
              disabled={actionInProgress[serverConfigModal.modelId] === "starting"}
            >
              {actionInProgress[serverConfigModal.modelId] === "starting" ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Start Server
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MultiModelSelector;
