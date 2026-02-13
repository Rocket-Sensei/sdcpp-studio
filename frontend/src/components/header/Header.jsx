import { Sparkles, Settings, Loader2, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { WebSocketStatusIndicator } from "../WebSocketStatusIndicator";

export function Header({
  onSettingsClick,
  pendingCount = 0,
  processingCount = 0,
}) {
  const totalInQueue = pendingCount + processingCount;

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold hidden sm:block">sd.cpp Studio</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Queue Status Indicator */}
            {totalInQueue > 0 && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-primary/10 rounded-full text-sm">
                {processingCount > 0 && (
                  <span className="flex items-center gap-1 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {processingCount}
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="h-3.5 w-3.5" />
                    {pendingCount}
                  </span>
                )}
                <span className="text-muted-foreground hidden sm:inline">in queue</span>
              </div>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={onSettingsClick}
              className="text-muted-foreground hover:text-foreground"
            >
              <Settings className="h-4 w-4" />
            </Button>

            <WebSocketStatusIndicator />
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
