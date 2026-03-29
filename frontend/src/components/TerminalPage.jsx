/**
 * TerminalPage Component
 * 
 * Standalone terminal page for viewing SD.cpp/llama.cpp/wan tool logs
 * when the app is started with --terminal-ui flag.
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { Terminal, RefreshCw, Filter, Copy, Check, Info, Wifi, WifiOff, Loader2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { authenticatedFetch } from "../utils/api";
import { useWebSocket, useTerminalLogs } from "../contexts/WebSocketContext";
import {
  stripAnsiCodes,
  isProgressBarLine,
  normalizeProgressBar,
  extractLogContent,
  extractGenerationId,
  parseSdcppLogLine,
  detectLogLevel,
  formatLogTimestamp,
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

export function TerminalPage() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState("all");
  const [levelFilter, setLevelFilter] = useState("all");
  const [selectedLog, setSelectedLog] = useState(null);
  const [contextMenu, setContextMenu] = useState(null);
  const logContainerRef = useRef(null);
  const [copiedId, setCopiedId] = useState(null);
  const logIdCounter = useRef(0);
  const autoScrollRef = useRef(true);
  const userScrolledRef = useRef(false);

  const { isConnected, isConnecting } = useWebSocket();

  useTerminalLogs((logData) => {
    const newLog = {
      id: `log-${logIdCounter.current++}`,
      timestamp: logData.timestamp || new Date().toISOString(),
      content: logData.content || '',
      raw: logData.raw,
      level: logData.level || detectLogLevel(logData.content || ''),
      generationId: logData.generationId,
      module: logData.module,
      type: logData.type,
    };
    setLogs(prev => [...prev.slice(-500), newLog]);
  });

  const filteredLogs = logs.filter(log => {
    if (filter !== "all" && log.type !== filter && log.module !== filter) {
      return false;
    }
    if (levelFilter !== "all" && log.level !== levelFilter) {
      return false;
    }
    return true;
  });

  const handleContextMenu = (e, log) => {
    e.preventDefault();
    setSelectedLog(log);
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
    setSelectedLog(null);
  };

  const handleCopy = async (text, logId) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(logId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleScroll = (e) => {
    const container = e.target;
    const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 50;
    userScrolledRef.current = !isAtBottom;
    autoScrollRef.current = isAtBottom;
  };

  useEffect(() => {
    if (autoScrollRef.current && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [filteredLogs]);

  const getGenerationInfo = (log) => {
    if (!log.raw) return null;
    return {
      generationId: log.raw.generation_id || log.raw.generationId,
      type: log.raw.type,
      module: log.raw.module,
      stdout: log.raw.stdout,
    };
  };

  const uniqueModules = [...new Set(logs.map(l => l.module).filter(Boolean))];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-3">
          <Terminal className="h-5 w-5 text-green-400" />
          <h1 className="text-lg font-semibold">SD.cpp Studio - Terminal</h1>
          <Badge variant={isConnected ? "success" : "destructive"} className="gap-1">
            {isConnecting ? (
              <><Loader2 className="h-3 w-3 animate-spin" /> Connecting</>
            ) : isConnected ? (
              <><Wifi className="h-3 w-3" /> Connected</>
            ) : (
              <><WifiOff className="h-3 w-3" /> Disconnected</>
            )}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setLogs([])}>
            <RefreshCw className="h-4 w-4 mr-1" /> Clear
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 px-4 py-2 border-b border-gray-800 bg-gray-900">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <span className="text-sm text-gray-400">Filter:</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700"
          >
            <option value="all">All</option>
            {uniqueModules.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Level:</span>
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-gray-800 text-white text-sm rounded px-2 py-1 border border-gray-700"
          >
            <option value="all">All</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>
        <div className="text-sm text-gray-500">
          {filteredLogs.length} / {logs.length} lines
        </div>
      </div>

      {/* Log Container */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto font-mono text-sm"
        onScroll={handleScroll}
      >
        {filteredLogs.map((log) => {
          const displayContent = processLogForDisplay(log.content || '');
          const isProgress = isProgressBarLine(log.content || '');
          
          return (
            <div
              key={log.id}
              className={`px-4 py-0.5 hover:bg-gray-900 cursor-pointer group ${
                isProgress ? 'text-green-400' : LOG_LEVEL_COLORS[log.level] || 'text-gray-300'
              }`}
              onContextMenu={(e) => handleContextMenu(e, log)}
              onClick={() => setSelectedLog(log)}
            >
              <span className="text-gray-500 text-xs mr-2">
                {formatLogTimestamp(log.timestamp)}
              </span>
              {log.module && (
                <span className="text-purple-400 text-xs mr-2">[{log.module}]</span>
              )}
              <span className={isProgress ? 'tracking-tight' : ''}>
                {displayContent}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopy(log.content || '', log.id);
                }}
                className="ml-2 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                {copiedId === log.id ? (
                  <Check className="h-3 w-3 text-green-400 inline" />
                ) : (
                  <Copy className="h-3 w-3 text-gray-500 inline" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={closeContextMenu}
          />
          <div
            className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl py-1 min-w-[300px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-400" />
              <span className="font-semibold">Generation Info</span>
            </div>
            {selectedLog && (() => {
              const info = getGenerationInfo(selectedLog);
              if (!info) return <div className="px-3 py-2 text-gray-400">No info available</div>;
              return (
                <div className="py-1">
                  {info.generationId && (
                    <div className="px-3 py-1.5 flex items-start gap-2">
                      <span className="text-gray-400 text-xs w-24">Generation:</span>
                      <span className="text-sm text-white font-mono break-all">{info.generationId}</span>
                    </div>
                  )}
                  {info.type && (
                    <div className="px-3 py-1.5 flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-24">Type:</span>
                      <Badge variant="outline" className="text-xs">{info.type}</Badge>
                    </div>
                  )}
                  {info.module && (
                    <div className="px-3 py-1.5 flex items-center gap-2">
                      <span className="text-gray-400 text-xs w-24">Module:</span>
                      <Badge variant="outline" className="text-xs">{info.module}</Badge>
                    </div>
                  )}
                  {info.stdout && (
                    <div className="px-3 py-2 border-t border-gray-700 mt-1">
                      <div className="text-gray-400 text-xs mb-1">Output:</div>
                      <pre className="text-xs text-green-400 whitespace-pre-wrap break-all bg-gray-900 p-2 rounded max-h-32 overflow-auto">
                        {info.stdout}
                      </pre>
                    </div>
                  )}
                  <div className="px-3 py-1.5 border-t border-gray-700 mt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start text-gray-300"
                      onClick={() => handleCopy(JSON.stringify(info, null, 2), 'info')}
                    >
                      <Copy className="h-3 w-3 mr-2" /> Copy Info
                    </Button>
                  </div>
                </div>
              );
            })()}
          </div>
        </>
      )}
    </div>
  );
}

export default TerminalPage;
