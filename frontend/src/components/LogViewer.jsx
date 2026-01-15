import { useEffect, useState, useRef } from "react";
import { Terminal, X, RefreshCw, Filter, Maximize2, Minimize2 } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { authenticatedFetch } from "../utils/api";

const LOG_LEVEL_COLORS = {
  trace: "text-gray-400",
  debug: "text-gray-300",
  info: "text-blue-400",
  warn: "text-yellow-400",
  error: "text-red-400",
  fatal: "text-red-500",
};

const LOG_LEVEL_BADGES = {
  trace: "bg-gray-700 text-gray-300",
  debug: "bg-gray-600 text-gray-200",
  info: "bg-blue-900 text-blue-200",
  warn: "bg-yellow-900 text-yellow-200",
  error: "bg-red-900 text-red-200",
  fatal: "bg-red-950 text-red-100",
};

export function LogViewer({ generationId, onClose }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState("all"); // all, app, sdcpp, http
  const [levelFilter, setLevelFilter] = useState("all"); // all, error, warn, info, debug
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const logContainerRef = useRef(null);

  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      // If generationId is provided, fetch logs for that generation
      // Otherwise, fetch all logs
      const url = generationId
        ? `/api/generations/${generationId}/logs?limit=100`
        : `/api/logs?limit=200`;
      const response = await authenticatedFetch(url);
      if (!response.ok) throw new Error("Failed to fetch logs");

      const data = await response.json();
      // Merge all log types (app, http, sdcpp) into a single array and sort by timestamp
      const allLogs = [
        ...(data.app || []),
        ...(data.http || []),
        ...(data.sdcpp || []),
      ].sort((a, b) => {
        const timeA = a.time || '';
        const timeB = b.time || '';
        return timeA.localeCompare(timeB);
      });
      setLogs(allLogs);
    } catch (err) {
      console.error("Failed to fetch logs:", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 5 seconds
    const interval = setInterval(fetchLogs, 5000);
    return () => clearInterval(interval);
  }, [generationId]);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const filteredLogs = logs.filter((log) => {
    // Filter by source
    if (filter !== "all") {
      if (filter === "app" && log.module === "sdcpp") return false;
      if (filter === "sdcpp" && log.module !== "sdcpp") return false;
      if (filter === "http" && log.module !== "http") return false;
    }

    // Filter by level
    if (levelFilter !== "all") {
      if (levelFilter === "error" && !["error", "fatal"].includes(log.level)) return false;
      if (levelFilter === "warn" && log.level !== "warn") return false;
      if (levelFilter === "info" && log.level !== "info") return false;
      if (levelFilter === "debug" && !["debug", "trace"].includes(log.level)) return false;
    }

    return true;
  });

  const formatLogMessage = (log) => {
    // For SD.cpp logs, use stdout/stderr for actual output content
    // Falls back to msg field for regular logs
    let msg = log.stdout || log.stderr || log.msg || "";

    // Add module prefix (but skip for sdcpp since the output already contains context)
    const module = log.module && log.module !== "sdcpp" ? `[${log.module}] ` : "";
    return `${module}${msg}`;
  };

  const formatLogTime = (time) => {
    if (!time) return "";
    const date = new Date(time);
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    });
  };

  return (
    <div className={`${isFullscreen ? "fixed inset-4 z-50" : "relative w-full"} bg-gray-950 rounded-lg overflow-hidden flex flex-col`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-gray-200">
            {generationId ? (
              <>
                Generation Logs <span className="text-gray-500">({generationId.slice(0, 8)}...)</span>
              </>
            ) : (
              <>System Logs</>
            )}
          </span>
          {filteredLogs.length > 0 && (
            <Badge variant="outline" className="text-xs">
              {filteredLogs.length} entries
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? "Auto-scroll enabled" : "Auto-scroll disabled"}
          >
            <Filter className={`h-3 w-3 ${autoScroll ? "text-green-400" : "text-gray-500"}`} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={fetchLogs}
            disabled={isLoading}
            title="Refresh logs"
          >
            <RefreshCw className={`h-3 w-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-900 border-b border-gray-800 text-xs">
        <span className="text-gray-500">Source:</span>
        <div className="flex gap-1">
          {["all", "app", "sdcpp", "http"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {f.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="text-gray-500 ml-4">Level:</span>
        <div className="flex gap-1">
          {["all", "error", "warn", "info", "debug"].map((l) => (
            <button
              key={l}
              onClick={() => setLevelFilter(l)}
              className={`px-2 py-0.5 rounded ${
                levelFilter === l
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700"
              }`}
            >
              {l.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Log Content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto p-2 font-mono text-xs leading-relaxed"
        onScroll={(e) => {
          const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
          const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100;
          setAutoScroll(isAtBottom);
        }}
      >
        {isLoading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            Loading logs...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500">
            {generationId ? "No logs found for this generation" : "No logs found"}
          </div>
        ) : (
          <div className="space-y-0.5">
            {filteredLogs.map((log, index) => (
              <div
                key={index}
                className={`flex gap-2 py-0.5 px-1 rounded hover:bg-gray-900/50 ${LOG_LEVEL_COLORS[log.level] || ""}`}
              >
                <span className="text-gray-600 select-none flex-shrink-0">
                  {formatLogTime(log.time)}
                </span>
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1 py-0 flex-shrink-0 border-0 ${LOG_LEVEL_BADGES[log.level] || "bg-gray-800 text-gray-400"}`}
                >
                  {log.level}
                </Badge>
                <span className="flex-1 break-all whitespace-pre-wrap">
                  {formatLogMessage(log)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
