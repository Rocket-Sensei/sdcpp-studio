import { useEffect, useState, useCallback } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { Filter, Search, X, Clock, XCircle, CheckCircle2, Cpu, Trash2 } from "lucide-react";
import { Toaster } from "./components/ui/sonner";
import { Studio } from "./components/Studio";
import { Header } from "./components/header/Header";
import { WebSocketProvider } from "./contexts/WebSocketContext";
import { AppBoot } from "./components/AppBoot";
import { ApiKeyProvider as ApiKeyContextProvider, useApiKeyContext } from "./contexts/ApiKeyContext";
import { SettingsModal } from "./components/SettingsModal";
import { useGenerations } from "./hooks/useImageGeneration";
import { Button } from "./components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "./components/ui/sheet";
import { Input } from "./components/ui/input";
import { Badge } from "./components/ui/badge";
import { Checkbox } from "./components/ui/checkbox";
import { authenticatedFetch } from "./utils/api";
import { toast } from "sonner";
import { MultiModelSelector } from "./components/MultiModelSelector";

const FILTER_PANEL_KEY = "sd-cpp-studio-filter-panel-open";

const GENERATION_STATUS = {
  PENDING: "pending",
  MODEL_LOADING: "model_loading",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
};

const STATUS_CONFIG = {
  [GENERATION_STATUS.PENDING]: {
    icon: Clock,
    label: "Pending",
    color: "secondary",
  },
  [GENERATION_STATUS.MODEL_LOADING]: {
    icon: Cpu,
    label: "Loading Model",
    color: "default",
    animate: true,
  },
  [GENERATION_STATUS.PROCESSING]: {
    icon: Cpu,
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

// Status filter options
const STATUS_FILTER_OPTIONS = [
  { value: GENERATION_STATUS.PENDING, label: "Pending" },
  { value: GENERATION_STATUS.MODEL_LOADING, label: "Loading Model" },
  { value: GENERATION_STATUS.PROCESSING, label: "Processing" },
  { value: GENERATION_STATUS.COMPLETED, label: "Completed" },
  { value: GENERATION_STATUS.FAILED, label: "Failed" },
  { value: GENERATION_STATUS.CANCELLED, label: "Cancelled" },
];

function App() {
  const { fetchGenerations, generations, pagination } = useGenerations();
  const { version: apiKeyVersion } = useApiKeyContext();

  // Filter panel state with localStorage persistence
  const [isFilterPanelOpen, setIsFilterPanelOpen] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(FILTER_PANEL_KEY);
      return saved === "true";
    }
    return false;
  });

  // Search query state
  const [searchQuery, setSearchQuery] = useState("");

  // Status filter state (array of selected status values)
  const [selectedStatuses, setSelectedStatuses] = useState([]);

  // Model filter state (array of selected model IDs)
  const [selectedModelsFilter, setSelectedModelsFilter] = useState([]);

  // Settings modal state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Fetch generations on mount and when API key version changes
  useEffect(() => {
    fetchGenerations();
  }, [fetchGenerations, apiKeyVersion]);

  // Persist filter panel state to localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(FILTER_PANEL_KEY, String(isFilterPanelOpen));
    }
  }, [isFilterPanelOpen]);

  // Compute filtered generations count
  const filteredGenerationsCount = (generations || []).filter(g => {
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      if (!g.prompt || !g.prompt.toLowerCase().includes(query)) {
        return false;
      }
    }
    // Apply status filter
    if (selectedStatuses.length > 0 && !selectedStatuses.includes(g.status)) {
      return false;
    }
    // Apply model filter (skip for upscale jobs as they don't use models)
    if (selectedModelsFilter.length > 0 && g.type !== 'upscale' && !selectedModelsFilter.includes(g.model)) {
      return false;
    }
    return true;
  }).length;

  // Compute if there are any pending or processing generations
  const hasPendingOrProcessing = (generations || []).some(g =>
    g.status === GENERATION_STATUS.PENDING || g.status === GENERATION_STATUS.PROCESSING
  );

  // Compute if there are any failed generations
  const hasFailed = (generations || []).some(g => g.status === GENERATION_STATUS.FAILED);

  // Handle delete all
  const handleDeleteAll = async () => {
    try {
      const response = await authenticatedFetch('/api/generations', {
        method: "DELETE",
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Deleted ${data.count} generation${data.count !== 1 ? 's' : ''}`);
        fetchGenerations();
      } else {
        throw new Error("Failed to delete all generations");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Handle cancel all
  const handleCancelAll = async () => {
    try {
      const response = await authenticatedFetch('/api/queue/cancel-all', {
        method: "POST",
      });
      if (response.ok) {
        const data = await response.json();
        toast.success(`Cancelled ${data.cancelled} job${data.cancelled !== 1 ? 's' : ''}`);
        fetchGenerations();
      } else {
        throw new Error("Failed to cancel all jobs");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Handle clear failed
  const handleClearFailed = async () => {
    try {
      const failedGenerations = (generations || []).filter(g => g.status === GENERATION_STATUS.FAILED);
      let deletedCount = 0;

      for (const generation of failedGenerations) {
        const response = await authenticatedFetch(`/api/generations/${generation.id}`, {
          method: "DELETE",
        });
        if (response.ok) {
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        toast.success(`Cleared ${deletedCount} failed generation${deletedCount !== 1 ? 's' : ''}`);
        fetchGenerations();
      } else {
        throw new Error("Failed to clear failed generations");
      }
    } catch (error) {
      toast.error(error.message);
    }
  };

  // Create filter sheet content
  const filterSheet = (
    <Sheet open={isFilterPanelOpen} onOpenChange={setIsFilterPanelOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm">
          <Filter className="h-4 w-4 mr-1" />
          Filters
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:w-[500px] overflow-y-auto">
        <SheetHeader className="mt-8 mb-6 px-6">
          <SheetTitle>Filters</SheetTitle>
        </SheetHeader>
        <div className="px-6 space-y-6">

          {/* Search by prompt */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Search Prompts</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search prompts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Status filter */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Status</label>
              {selectedStatuses.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedStatuses([])}
                >
                  Clear all
                </Button>
              )}
            </div>

            {/* Selected status badges */}
            {selectedStatuses.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedStatuses.map(status => {
                  const option = STATUS_FILTER_OPTIONS.find(o => o.value === status);
                  return (
                    <Badge
                      key={status}
                      variant="secondary"
                      className="gap-1 pl-2 pr-1.5 py-0.5"
                    >
                      {option?.label || status}
                      <button
                        onClick={() => setSelectedStatuses(prev => prev.filter(s => s !== status))}
                        className="ml-0.5 rounded-full hover:bg-secondary-foreground/20 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  );
                })}
              </div>
            )}

            {/* Status checkboxes */}
            <div className="space-y-2">
              {STATUS_FILTER_OPTIONS.map(option => {
                const config = STATUS_CONFIG[option.value];
                const StatusIcon = config?.icon;
                const isSelected = selectedStatuses.includes(option.value);

                return (
                  <label
                    key={option.value}
                    className={`flex items-center gap-2 cursor-pointer rounded-md px-2 py-1.5 transition-colors ${
                      isSelected ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                  >
                    <Checkbox
                      checked={isSelected}
                      onChange={() => {
                        setSelectedStatuses(prev => {
                          if (prev.includes(option.value)) {
                            return prev.filter(s => s !== option.value);
                          } else {
                            return [...prev, option.value];
                          }
                        });
                      }}
                    />
                    {StatusIcon && (
                      <StatusIcon className={`h-3.5 w-3.5 text-muted-foreground ${
                        config?.animate ? 'animate-spin' : ''
                      }`} />
                    )}
                    <span className="text-sm">{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Model filter */}
          <div className="space-y-3">
            <MultiModelSelector
              selectedModels={selectedModelsFilter}
              onModelsChange={setSelectedModelsFilter}
              className="max-h-96 overflow-y-auto"
            />
          </div>

          {/* Filter results count */}
          {(searchQuery || selectedStatuses.length > 0 || selectedModelsFilter.length > 0) && filteredGenerationsCount !== (generations || []).length && (
            <div className="pt-3 border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Showing {filteredGenerationsCount} of {(generations || []).length} generations
              </p>
            </div>
          )}

          {/* Action buttons */}
          <div className="pt-4 border-t border-border space-y-2">
            <h4 className="text-sm font-medium">Actions</h4>
            <div className="flex flex-col gap-2">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleCancelAll}
                disabled={!hasPendingOrProcessing}
                className="w-full"
              >
                <X className="h-4 w-4 mr-1" />
                Cancel All
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearFailed}
                disabled={!hasFailed}
                className="w-full border-orange-200 text-orange-600 hover:bg-orange-50 hover:border-orange-300 hover:text-orange-700"
              >
                <XCircle className="h-4 w-4 mr-1" />
                Clear Failed
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDeleteAll}
                className="w-full"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete All
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <Header
        onSettingsClick={() => setIsSettingsOpen(true)}
        filterSheet={filterSheet}
      />

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Routes>
          {/* Main Studio route */}
          <Route path="/studio" element={
            <Studio
              searchQuery={searchQuery}
              selectedStatuses={selectedStatuses}
              selectedModelsFilter={selectedModelsFilter}
            />
          } />

          {/* Backward compatibility redirects */}
          <Route path="/generate" element={<Navigate to="/studio" replace />} />
          <Route path="/gallery" element={<Navigate to="/studio" replace />} />
          <Route path="/models" element={<Navigate to="/studio" replace />} />

          {/* Default route - redirect to /studio */}
          <Route path="/" element={<Navigate to="/studio" replace />} />
        </Routes>
      </main>

          {/* Footer */}
          <footer className="border-t border-border py-4 mt-8">
            <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
              {pagination?.total || 0} total generation{pagination?.total !== 1 ? "s" : ""}
            </div>
          </footer>

          {/* Toast notifications */}
          <Toaster />

          {/* Settings Modal */}
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
          />
        </div>
  );
}

export default App;

// Wrapper component that provides context and handles app boot sequence
// Boot sequence: Auth check -> API key collection (if needed) -> Render App
export function AppWithProviders() {
  const [bootComplete, setBootComplete] = useState(false);

  return (
    <ApiKeyContextProvider>
      <AppBoot
        onBootComplete={() => setBootComplete(true)}
        onApiKeyChange={() => {
          // Trigger re-fetch when API key changes
          window.location.reload();
        }}
      >
        {bootComplete && (
          <WebSocketProvider>
            <App />
          </WebSocketProvider>
        )}
      </AppBoot>
    </ApiKeyContextProvider>
  );
}
