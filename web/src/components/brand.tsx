import { Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { tile: "h-7 w-7 rounded-md", icon: "h-3.5 w-3.5", text: "text-base" },
  md: { tile: "h-9 w-9 rounded-lg", icon: "h-5 w-5", text: "text-lg" },
  lg: { tile: "h-12 w-12 rounded-xl", icon: "h-6 w-6", text: "text-2xl" },
} as const;

/** The Rowarr mark: a gold gradient tile with a sparkle. A real logo, not a bare emoji. */
export function Logo({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-grid place-items-center bg-gradient-to-br from-primary to-plex text-primary-foreground shadow-glow",
        s.tile,
        className,
      )}
    >
      <Sparkles className={s.icon} strokeWidth={2.25} />
    </span>
  );
}

/** The mark plus the wordmark — the app's identity lockup. */
export function Wordmark({
  size = "md",
  className,
}: {
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Logo size={size} />
      <span className={cn("font-semibold tracking-tight", s.text)}>Rowarr</span>
    </span>
  );
}
