import { Sparkles, ChevronDown, Filter, Settings } from "lucide-react";
import { Button } from "../ui/button";
import { WebSocketStatusIndicator } from "../WebSocketStatusIndicator";

/**
 * Header - Main application header
 *
 * @param {Object} props
 * @param {number} props.totalGenerations - Total number of generations
 * @param {boolean} props.isFormCollapsed - Whether the generate form is collapsed
 * @param {function} props.onToggleForm - Toggle form visibility
 * @param {boolean} props.isFilterPanelOpen - Whether filter panel is open
 * @param {function} props.setIsFilterPanelOpen - Set filter panel open state
 * @param {function} props.onSettingsClick - Open settings modal
 * @param {React.ReactNode} props.filterSheet - Filter sheet component
 */
export function Header({
  totalGenerations = 0,
  isFormCollapsed = false,
  onToggleForm,
  isFilterPanelOpen,
  setIsFilterPanelOpen,
  onSettingsClick,
  filterSheet,
}) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          {/* Generate Toggle Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onToggleForm}
            className="gap-2 flex-shrink-0"
          >
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">Generate</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform ${
                isFormCollapsed ? "" : "rotate-180"
              }`}
            />
          </Button>

          {/* Logo */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold hidden sm:block">sd.cpp Studio</h1>
          </div>

          {/* Spacer for balance */}
          <div className="flex-1" />

          {/* Gallery count and filters (desktop) */}
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {totalGenerations} total generation{totalGenerations !== 1 ? "s" : ""}
            </span>

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
