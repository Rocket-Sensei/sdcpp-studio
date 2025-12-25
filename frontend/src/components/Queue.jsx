import { useEffect, useState } from "react";
import {
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  List as ListIcon,
  Server,
  Terminal,
  Circle
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Progress } from "./ui/progress";

const QUEUE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
};

// Model status constants
const MODEL_STATUS = {
  STOPPED: "stopped",
  STARTING: "starting",
  RUNNING: "running",
  STOPPING: "stopping",
  ERROR: "error",
};

const STATUS_CONFIG = {
  [QUEUE_STATUS.PENDING]: {
    icon: Clock,
    label: "Queued",
    color: "secondary",
  },
  [QUEUE_STATUS.PROCESSING]: {
    icon: Loader2,
    label: "Processing",
    color: "default",
    animate: true,
  },
  [QUEUE_STATUS.COMPLETED]: {
    icon: CheckCircle2,
    label: "Completed",
    color: "outline",
    variant: "success",
  },
  [QUEUE_STATUS.FAILED]: {
    icon: XCircle,
    label: "Failed",
    color: "destructive",
  },
};

export function Queue() {
  const [jobs, setJobs] = useState([]);
  const [models, setModels] = useState({});
  const [modelStatuses, setModelStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchQueue();
    fetchModels();
    // Poll for updates every 2 seconds
    const interval = setInterval(() => {
      fetchQueue();
      fetchModelStatuses();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const response = await fetch("/api/queue");
      if (response.ok) {
        const data = await response.json();
        setJobs(data.jobs || []);
      }
    } catch (error) {
      console.error("Failed to fetch queue:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchModels = async () => {
    try {
      const response = await fetch("/api/models");
      if (response.ok) {
        const data = await response.json();
        // Convert models array to object keyed by id for easy lookup
        const modelsMap = {};
        data.models.forEach(model => {
          modelsMap[model.id] = model;
        });
        setModels(modelsMap);
      }
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  const fetchModelStatuses = async () => {
    try {
      // Fetch status for each unique model in the queue
      const uniqueModelIds = [...new Set(jobs.map(job => job.model_id || job.model).filter(Boolean))];
      const statusPromises = uniqueModelIds.map(async (modelId) => {
        try {
          const response = await fetch(`/api/models/${modelId}/status`);
          if (response.ok) {
            const status = await response.json();
            return { modelId, status };
          }
        } catch (error) {
          console.error(`Failed to fetch status for model ${modelId}:`, error);
        }
        return { modelId, status: null };
      });

      const statuses = await Promise.all(statusPromises);
      const statusesMap = {};
      statuses.forEach(({ modelId, status }) => {
        if (status) {
          statusesMap[modelId] = status;
        }
      });
      setModelStatuses(statusesMap);
    } catch (error) {
      console.error("Failed to fetch model statuses:", error);
    }
  };

  const getModelInfo = (job) => {
    const modelId = job.model_id || job.model;
    if (!modelId || !models[modelId]) {
      return {
        name: modelId || "Unknown Model",
        execMode: null,
        status: null,
      };
    }
    const model = models[modelId];
    return {
      name: model.name || modelId,
      execMode: model.exec_mode || "server",
      status: modelStatuses[modelId] || null,
    };
  };

  const getModelStatusBadge = (modelInfo, jobStatus) => {
    // If job is processing and model is starting, show waiting message
    if (jobStatus === QUEUE_STATUS.PROCESSING && modelInfo.status?.status === MODEL_STATUS.STARTING) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Waiting for model to start...</span>
        </div>
      );
    }

    // Show model running indicator if model is running
    if (modelInfo.status?.status === MODEL_STATUS.RUNNING) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
          <Circle className="h-2 w-2 fill-current" />
          <span>Model running</span>
        </div>
      );
    }

    // Show model starting indicator
    if (modelInfo.status?.status === MODEL_STATUS.STARTING) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Model starting...</span>
        </div>
      );
    }

    // Show model stopped indicator
    if (modelInfo.status?.status === MODEL_STATUS.STOPPED) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Circle className="h-2 w-2" />
          <span>Model stopped</span>
        </div>
      );
    }

    // Show model error indicator
    if (modelInfo.status?.status === MODEL_STATUS.ERROR) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-destructive">
          <XCircle className="h-3 w-3" />
          <span>Model error</span>
        </div>
      );
    }

    return null;
  };

  const getExecModeBadge = (execMode) => {
    if (!execMode) return null;

    const config = execMode === "server"
      ? { icon: Server, label: "Server", variant: "outline" }
      : { icon: Terminal, label: "CLI", variant: "secondary" };

    const Icon = config.icon;

    return (
      <Badge variant={config.variant} className="text-xs">
        <Icon className="h-3 w-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getStatusConfig = (status) => {
    return STATUS_CONFIG[status] || STATUS_CONFIG[QUEUE_STATUS.PENDING];
  };

  const activeJobs = jobs.filter(j => j.status !== QUEUE_STATUS.COMPLETED && j.status !== QUEUE_STATUS.FAILED);
  const completedJobs = jobs.filter(j => j.status === QUEUE_STATUS.COMPLETED);
  const failedJobs = jobs.filter(j => j.status === QUEUE_STATUS.FAILED);

  if (jobs.length === 0 && !isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListIcon className="h-5 w-5" />
            Generation Queue
          </CardTitle>
          <CardDescription>
            Queue and manage your image generation jobs
          </CardDescription>
        </CardHeader>
        <CardContent className="py-12">
          <div className="text-center">
            <ListIcon className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Queue is empty</h3>
            <p className="text-muted-foreground">
              Generate images and they will appear here
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ListIcon className="h-5 w-5" />
          Generation Queue
        </CardTitle>
        <CardDescription>
          {activeJobs.length > 0
            ? `${activeJobs.length} job${activeJobs.length > 1 ? "s" : ""} in queue`
            : "No active jobs"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {jobs.map((job) => {
          const config = getStatusConfig(job.status);
          const StatusIcon = config.icon;
          const modelInfo = getModelInfo(job);

          return (
            <div
              key={job.id}
              className="border border-border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{job.prompt || "No prompt"}</p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
                    {/* Model name */}
                    <span className="text-xs font-medium text-foreground">
                      {modelInfo.name}
                    </span>

                    {/* Execution mode badge */}
                    {getExecModeBadge(modelInfo.execMode)}

                    {/* Size and seed info */}
                    <span className="text-xs text-muted-foreground">
                      {job.size || "512x512"}
                      {job.seed && ` • Seed: ${Math.floor(Number(job.seed))}`}
                    </span>
                  </div>
                </div>
                <Badge variant={config.color} className="flex-shrink-0">
                  <StatusIcon className={`h-3 w-3 mr-1 ${config.animate ? "animate-spin" : ""}`} />
                  {config.label}
                </Badge>
              </div>

              {/* Model status indicator */}
              {getModelStatusBadge(modelInfo, job.status) && (
                <div className="flex items-center gap-2">
                  {getModelStatusBadge(modelInfo, job.status)}
                </div>
              )}

              {/* Progress bar for processing jobs */}
              {job.status === QUEUE_STATUS.PROCESSING && job.progress !== undefined && (
                <Progress value={job.progress * 100} className="h-2" />
              )}

              {/* Error message for failed jobs */}
              {job.status === QUEUE_STATUS.FAILED && job.error && (
                <p className="text-xs text-destructive">{job.error}</p>
              )}

              {/* Job type and timestamp */}
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {job.type === "generate" ? "Text to Image" :
                   job.type === "edit" ? "Image to Image" :
                   job.type === "variation" ? "Variation" : job.type}
                </span>
                <span>{new Date(job.created_at).toLocaleTimeString()}</span>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
