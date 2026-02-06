import { Button } from "../ui/button";
import { cn } from "../../lib/utils";
import { ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

const PRESET_COUNTS = [1, 2, 3, 4];
const EXTENDED_COUNTS = [5, 6, 7, 8, 9, 10];

/**
 * ImageCountSelector - Button group for selecting number of images to generate
 *
 * @param {Object} props
 * @param {number} props.value - Current selected count
 * @param {function} props.onChange - Callback when count changes
 * @param {boolean} props.disabled - Whether the selector is disabled
 * @param {string} props.className - Additional CSS classes
 */
export function ImageCountSelector({ value = 1, onChange, disabled = false, className }) {
  const isExtendedValue = value > 4;

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {PRESET_COUNTS.map((count) => (
        <Button
          key={count}
          type="button"
          variant={value === count ? "default" : "outline"}
          size="sm"
          onClick={() => onChange?.(count)}
          disabled={disabled}
          className="w-9 h-9 p-0"
        >
          {count}
        </Button>
      ))}

      {/* Dropdown for extended counts */}
      <Select
        value={isExtendedValue ? String(value) : ""}
        onValueChange={(v) => onChange?.(parseInt(v, 10))}
        disabled={disabled}
      >
        <SelectTrigger
          className={cn(
            "w-9 h-9 p-0 justify-center",
            isExtendedValue && "border-primary bg-primary text-primary-foreground"
          )}
        >
          {isExtendedValue ? (
            <span className="text-sm">{value}</span>
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </SelectTrigger>
        <SelectContent>
          {EXTENDED_COUNTS.map((count) => (
            <SelectItem key={count} value={String(count)}>
              {count}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default ImageCountSelector;
