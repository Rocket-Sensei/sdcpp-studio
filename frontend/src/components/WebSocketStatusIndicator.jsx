/**
 * WebSocket Status Indicator
 *
 * Displays a visual indicator of the WebSocket connection status.
 * Shows "Online" when connected, "Offline" when disconnected.
 * Click to open the system log viewer modal.
 */

import { useState } from 'react';
import { useWebSocket } from '../contexts/WebSocketContext';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { LogViewer } from './LogViewer';
import {
  Dialog,
  DialogPortal,
  DialogOverlay,
} from './ui/dialog';

export function WebSocketStatusIndicator() {
  const { isConnected, isConnecting } = useWebSocket();
  const [isLogModalOpen, setIsLogModalOpen] = useState(false);

  return (
    <>
      <div
        className="flex items-center gap-1.5 text-xs cursor-pointer hover:opacity-80 transition-opacity"
        title={`WebSocket ${isConnected ? 'connected' : 'disconnected'} - Click to view logs`}
        onClick={() => setIsLogModalOpen(true)}
      >
        {isConnecting ? (
          <>
            <Loader2 className="h-3.5 w-3.5 text-yellow-500 animate-spin" />
            <span className="text-yellow-600 dark:text-yellow-400 hidden sm:inline">Connecting...</span>
          </>
        ) : isConnected ? (
          <>
            <Wifi className="h-3.5 w-3.5 text-green-500" />
            <span className="text-green-600 dark:text-green-400 font-medium hidden sm:inline">Online</span>
          </>
        ) : (
          <>
            <WifiOff className="h-3.5 w-3.5 text-red-500" />
            <span className="text-red-600 dark:text-red-400 hidden sm:inline">Offline</span>
          </>
        )}
      </div>

      <Dialog open={isLogModalOpen} onOpenChange={setIsLogModalOpen}>
        <DialogPortal>
          <DialogOverlay />
          <div className="fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%] w-full max-w-4xl h-[80vh] px-2 sm:px-4">
            <LogViewer onClose={() => setIsLogModalOpen(false)} />
          </div>
        </DialogPortal>
      </Dialog>
    </>
  );
}

export default WebSocketStatusIndicator;
