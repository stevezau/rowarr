import { freshnessDescription } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface FreshnessSliderProps {
  id?: string;
  value: number; // whole percent, 0..100
  onChange: (pct: number) => void;
  className?: string;
}

/**
 * How OFTEN a row refreshes (0% = frozen once built .. 100% = rebuilds every night). Freshness is a
 * cadence, not a nightly shuffle. A native range input so it's keyboard-accessible for free; the
 * whole-percent value maps to a 0..1 fraction at the call site.
 */
export function FreshnessSlider({
  id,
  value,
  onChange,
  className,
}: FreshnessSliderProps) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center gap-3">
        <input
          id={id}
          type="range"
          min={0}
          max={100}
          step={5}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="How often the row refreshes"
          aria-valuetext={`${value} percent fresh`}
          className="h-2 w-full cursor-pointer accent-primary"
        />
        <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums">
          {value}%
        </span>
      </div>
      <p className="text-sm text-muted-foreground">
        {freshnessDescription(value)}
      </p>
    </div>
  );
}
