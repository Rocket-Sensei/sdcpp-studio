import { NavLink } from "react-router-dom";
import { Sparkles, Image, List, Settings, Maximize } from "lucide-react";
import { cn } from "../lib/utils";

const navItems = [
  { to: "/text-to-image", label: "Text to Image", icon: Sparkles },
  { to: "/image-to-image", label: "Image to Image", icon: Image },
  { to: "/upscale", label: "Upscale", icon: Maximize },
  { to: "/gallery", label: "Gallery", icon: List },
  { to: "/models", label: "Models", icon: Settings },
];

export function Navigation() {
  return (
    <nav className="grid grid-cols-5 bg-muted/50 rounded-lg p-1 gap-1">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              "flex items-center justify-center gap-1.5 text-sm rounded-md py-2 px-3 transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )
          }
        >
          <item.icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
