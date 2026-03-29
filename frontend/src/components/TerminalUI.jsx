/**
 * TerminalUI Component for sd.cpp-studio
 * 
 * Provides a terminal-style interface for viewing SD.cpp/llama.cpp/wan tool logs
 * with support for ANSI color codes, progress bars, and real-time updates.
 */

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Terminal, X, RefreshCw, Filter, Maximize2, Minimize2, ChevronDown, ChevronUp, Copy, Check, Info } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { authenticatedFetch } from "../utils/api";
import { useTerminalLogs, WS_CHANNELS } from "../contexts/WebSocketContext";
import {
  stripAnsiCodes,
  isProgressBarLine,
  normalizeProgressBar,
  extractLogContent,
  extractGenerationId,
  parseSdcppLogLine,
  detectLogLevel,
  formatLogTimestamp,
  batchProcessLogs,
  processLogForDisplay,
} from "../utils/logParser";

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

export function TerminalUI({ generationId, onClose, initialMode = "logs" }) {
  const [logs, setLogs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [filter, setFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [selectedLog, setSelectedLog] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const logContainerRef = useRef(null);
  const [copiedId, setCopiedId] = useState(null);
  const [wsConnected, setWsConnected] = useState(false);
  const logIdCounter = useRef(0);

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const url = generationId
        ? `/api/generations/${generationId}/logs?limit=200`
        : `/api/logs?limit=500`;
      const response = await authenticatedFetch(url);
      if (!response.ok) throw new Error("Failed to fetch logs");

      const data = await response.json();
      const allLogs = [
        ...(data.app || []),
        ...(data.sdcpp || []),
        ...(data.http || []),
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
  }, [generationId]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, [fetchLogs]);

  const handleTerminalLog = useCallback((logData) => {
    if (generationId && logData.generationId !== generationId) {
      return;
    }
    
    const newLog = {
      id: `ws-log-${logIdCounter.current++}`,
      content: logData.content,
      level: logData.level || 'info',
      timestamp: logData.timestamp ? formatLogTimestamp(logData.timestamp) : '',
      generationId: logData.generationId,
      original: logData,
      isWebSocket: true,
    };
    
    setLogs(prevLogs => {
      const exists = prevLogs.some(
        log => log.original?.raw === logData.raw
      );
      if (exists) return prevLogs;
      return [...prevLogs, newLog];
    });
  }, [generationId]);

  const { isConnected } = useTerminalLogs(handleTerminalLog);

  useEffect(() => {
    setWsConnected(isConnected);
  }, [isConnected]);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const processedLogs = useMemo(() => {
    return batchProcessLogs(logs).map(log => {
      let content = log.content;
      
      if (isProgressBarLine(content)) {
        content = normalizeProgressBar(content);
      }
      
      return {
        ...log,
        displayContent: content,
      };
    });
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return processedLogs.filter(log => {
      if (filter !== "all") {
        if (filter === "app" && log.original?.module === "sdcpp") return false;
        if (filter === "sdcpp" && log.original?.module !== "sdcpp") return false;
        if (filter === "http" && log.original?.module !== "http") return false;
      }

      if (levelFilter !== "all") {
        const level = log.level || detectLogLevel(log.content);
        if (levelFilter === "error" && !["error", "fatal"].includes(level)) return false;
        if (levelFilter === "warn" && level !== "warn") return false;
        if (levelFilter === "info" && level !== "info") return false;
        if (levelFilter === "debug" && !["debug", "trace"].includes(level)) return false;
      }

      return true;
    });
  }, [processedLogs, filter, levelFilter]);

  const handleContextMenu = useCallback((e, log) => {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      log,
    });
    setSelectedLog(log);
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopyLog = useCallback((log) => {
    navigator.clipboard.writeText(log.displayContent || log.content);
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  }, []);

  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => closeContextMenu();
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, closeContextMenu]);

  const handleScroll = useCallback((e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    const isAtBottom = scrollHeight - scrollTop <= clientHeight + 100;
    setAutoScroll(isAtBottom);
  }, []);

  return (
    <div 
      className={`${isFullscreen ? "fixed inset-4 z-50" : "relative w-full"} bg-gray-950 rounded-lg overflow-hidden flex flex-col font-mono`}
      onClick={closeContextMenu}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-green-400" />
          <span className="text-sm font-medium text-gray-200">
            {generationId ? (
              <>
                Terminal <span className="text-gray-500">({generationId.slice(0, 8)}...)</span>
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
          <div 
            className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-green-400' : 'bg-gray-500'}`}
            title={wsConnected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />
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

      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto p-2 text-xs leading-relaxed"
        onScroll={handleScroll}
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
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                className={`flex gap-2 py-0.5 px-1 rounded hover:bg-gray-900/50 cursor-pointer ${LOG_LEVEL_COLORS[log.level] || ""}`}
                onContextMenu={(e) => handleContextMenu(e, log)}
                onClick={() => setSelectedLog(log)}
              >
                {log.timestamp && (
                  <span className="text-gray-600 select-none flex-shrink-0">
                    {log.timestamp}
                  </span>
                )}
                <Badge
                  variant="outline"
                  className={`text-[10px] px-1 py-0 flex-shrink-0 border-0 ${LOG_LEVEL_BADGES[log.level] || "bg-gray-800 text-gray-400"}`}
                >
                  {log.level || "info"}
                </Badge>
                <span className="flex-1 break-all whitespace-pre-wrap font-mono">
                  {log.displayContent || log.content}
                </span>
                {copiedId === log.id && (
                  <Check className="h-3 w-3 text-green-400 flex-shrink-0" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div
          className="fixed bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1 z-50 min-w-[200px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1.5 text-xs text-gray-400 border-b border-gray-700">
            Generation Info
          </div>
          {contextMenu.log?.generationId && (
            <div className="px-3 py-1.5 text-xs">
              <span className="text-gray-500">ID: </span>
              <span className="text-gray-300 font-mono">{contextMenu.log.generationId.slice(0, 16)}...</span>
            </div>
          )}
          {contextMenu.log?.original?.type && (
            <div className="px-3 py-1.5 text-xs">
              <span className="text-gray-500">Type: </span>
              <span className="text-gray-300">{contextMenu.log.original.type}</span>
            </div>
          )}
          {contextMenu.log?.original?.module && (
            <div className="px-3 py-1.5 text-xs">
              <span className="text-gray-500">Module: </span>
              <span className="text-gray-300">{contextMenu.log.original.module}</span>
            </div>
          )}
          <div className="border-t border-gray-700 mt-1 pt-1">
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-800 flex items-center gap-2 text-gray-300"
              onClick={() => handleCopyLog(contextMenu.log)}
            >
              <Copy className="h-3 w-3" />
              Copy Log Entry
            </button>
            <button
              className="w-full px-3 py-1.5 text-xs text-left hover:bg-gray-800 flex items-center gap-2 text-gray-300"
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(contextMenu.log.original, null, 2));
                setCopiedId(contextMenu.log.id);
              }}
            >
              <Info className="h-3 w-3" />
              Copy as JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default TerminalUI;
