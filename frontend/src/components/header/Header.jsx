import { Sparkles, Settings, Loader2, Clock } from "lucide-react";
import { Button } from "../ui/button";
import { WebSocketStatusIndicator } from "../WebSocketStatusIndicator";
import { cn } from "../../lib/utils";
import { useGpuInfo } from "../../hooks/useGpuInfo";

function formatGbCompact(mb) {
  if (!Number.isFinite(mb) || mb <= 0) {
    return "0";
  }
  const gb = mb / 1024;
  if (gb >= 10) {
    return gb.toFixed(0);
  }
  return gb.toFixed(1).replace(/\.0$/, "");
}

function UsageLine({ label, usedMB, totalMB, colorClass = "bg-primary" }) {
  if (!Number.isFinite(totalMB) || totalMB <= 0) {
    return null;
  }

  const percent = Math.min(100, Math.max(0, Math.round((usedMB / totalMB) * 100)));

  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground font-mono">
      <span className="uppercase">{label}</span>
      <span className="text-foreground/90">[{formatGbCompact(usedMB)}/{formatGbCompact(totalMB)}]</span>
      <span className="h-1 w-8 rounded-full bg-muted/70 overflow-hidden">
        <span className={cn("block h-full", colorClass)} style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

function HeaderResourceWidget() {
  const { gpuInfo } = useGpuInfo();
  const vramTotalMB = gpuInfo?.vramTotalMB || 0;
  const vramUsedMB = gpuInfo?.vramUsedMB || 0;
  const ramTotalMB = gpuInfo?.ram?.totalMB || 0;
  const ramUsedMB = gpuInfo?.ram?.usedMB || 0;

  if (!vramTotalMB && !ramTotalMB) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5 sm:gap-2 rounded-md border border-border/60 bg-muted/30 px-1.5 sm:px-2 py-1 text-[10px] sm:text-[11px]">
      <UsageLine label="vram" usedMB={vramUsedMB} totalMB={vramTotalMB} colorClass="bg-amber-400" />
      <UsageLine label="ram" usedMB={ramUsedMB} totalMB={ramTotalMB} colorClass="bg-blue-500" />
    </div>
  );
}

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
            <h1 className="text-lg font-bold"><span className="hidden sm:inline">sd.cpp Studio</span><span className="sm:hidden">sd.cpp</span></h1>
            <HeaderResourceWidget />
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
