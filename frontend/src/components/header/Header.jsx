import { Sparkles, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { WebSocketStatusIndicator } from "../WebSocketStatusIndicator";

/**
 * Header - Main application header
 *
 * @param {Object} props
 * @param {function} props.onSettingsClick - Open settings modal
 * @param {React.ReactNode} props.filterSheet - Filter sheet component
 */
export function Header({
  onSettingsClick,
  filterSheet,
}) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold hidden sm:block">sd.cpp Studio</h1>
          </div>

          {/* Spacer for balance */}
          <div className="flex-1" />

          {/* Filters (desktop) */}
          <div className="hidden sm:flex items-center gap-3">
            {/* Filter Sheet Trigger */}
            {filterSheet}
          </div>

          {/* Mobile filters */}
          <div className="flex sm:hidden items-center gap-2">
            {filterSheet}
          </div>

          {/* Settings Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onSettingsClick}
            className="text-muted-foreground hover:text-foreground"
          >
            <Settings className="h-4 w-4" />
          </Button>

          {/* WebSocket Status Indicator */}
          <WebSocketStatusIndicator />
        </div>
      </div>
    </header>
  );
}

export default Header;
