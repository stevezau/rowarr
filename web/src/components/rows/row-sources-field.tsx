import { useEffect, useState } from "react";

import { Segmented } from "@/components/segmented";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSettings } from "@/lib/queries";
import { cleanSources, SOURCES, sourceBlockedReason } from "@/lib/sources";
import type { Settings } from "@/lib/types";

function globalSources(settings: Settings | undefined): string[] {
  const value = settings?.["candidates.sources"];
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : ["tmdb_similar", "tmdb_discover"];
}

/**
 * Per-row discovery-source override. An empty array means "inherit the global Settings →
 * Recommendations set" (the default); choosing "Custom" seeds from the current global set so the
 * owner starts from what's active, then tweaks. Dependency-gated exactly like the global picker.
 */
export function RowSourcesField({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const settings = useSettings();
  // The mode is the owner's CHOICE, not a guess from the list's length. Deriving it meant unticking
  // the last source silently threw the row back onto the global default, with the switches gone.
  const [mode, setMode] = useState<"global" | "custom">(
    value.length > 0 ? "custom" : "global",
  );
  const custom = mode === "custom";

  // Until the settings land we cannot tell which sources are even allowed, so every switch stays
  // locked — briefly clickable toggles let an owner turn on a source their setup can't run.
  const loaded = settings.data !== undefined;

  // Never keep a source whose dependency is gone (e.g. llm_library after the curator is removed):
  // the row would store a source its own toggle shows as OFF, and the row card would go on
  // advertising "Sources: AI from library" for a source no run can use. Same strip as the global
  // picker, applied the moment we know what's blocked.
  useEffect(() => {
    const data = settings.data;
    if (!data || value.length === 0) return;
    const clean = cleanSources(value, data);
    if (clean.length !== value.length) onChange(clean);
  }, [settings.data, value, onChange]);

  const chooseMode = (next: string) => {
    if (next === "global") {
      setMode("global");
      onChange([]);
    } else {
      setMode("custom");
      // Seed Custom from the current global set, minus anything this setup can't run.
      onChange(cleanSources(globalSources(settings.data), settings.data ?? {}));
    }
  };

  const toggle = (id: string) =>
    onChange(
      value.includes(id) ? value.filter((x) => x !== id) : [...value, id],
    );

  return (
    <div className="space-y-3 border-t pt-4">
      <Label>Recommendation sources</Label>
      <p className="text-sm text-muted-foreground">
        Which discovery engines this row pools titles from. Pick different ones
        per row to give each a distinct character — a Trakt-only “What to watch
        next”, or an AI-from-library “Hidden gems”.
      </p>
      <Segmented
        value={custom ? "custom" : "global"}
        onChange={chooseMode}
        options={[
          { value: "global", label: "Use global default" },
          { value: "custom", label: "Choose for this row" },
        ]}
      />
      {settings.isError && (
        <p role="alert" className="text-sm text-warning">
          Couldn&rsquo;t check which sources your connections allow, so they
          stay locked. Reload the page to try again.
        </p>
      )}
      {!custom ? (
        <p className="text-sm text-muted-foreground">
          This row uses the sources you enabled in Settings → Recommendations.
        </p>
      ) : (
        <div className="space-y-3">
          {SOURCES.map((source) => {
            const blockedReason = settings.data
              ? sourceBlockedReason(source, settings.data)
              : null;
            const blocked = blockedReason !== null;
            return (
              <div
                key={source.id}
                className="flex items-start justify-between gap-4"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="text-sm text-muted-foreground">{source.desc}</p>
                  {blocked && (
                    <p className="text-xs text-warning">{blockedReason}</p>
                  )}
                </div>
                <Switch
                  checked={value.includes(source.id) && !blocked}
                  disabled={blocked || !loaded}
                  onCheckedChange={() => toggle(source.id)}
                  aria-label={`Enable ${source.label} for this row`}
                />
              </div>
            );
          })}
          {value.length === 0 ? (
            // The row does fall back to the global set — but that must be said out loud, not
            // inferred from switches the owner just turned all the way off.
            <p role="alert" className="text-sm text-warning">
              Nothing ticked, so this row falls back to the global default from
              Settings → Recommendations. Tick at least one source to give it
              its own.
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              This row pools only the sources ticked above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
