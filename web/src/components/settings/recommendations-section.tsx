import { useEffect, useRef, useState } from "react";

import { SavedIndicator } from "@/components/saved-indicator";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api";
import { SOURCES, sourceBlockedReason } from "@/lib/sources";
import { useSaveSettings } from "@/lib/queries";
import type { Settings } from "@/lib/types";

function readSources(settings: Settings): string[] {
  const value = settings["candidates.sources"];
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : ["tmdb_similar", "tmdb_discover"];
}

export function RecommendationsSection({ settings }: { settings: Settings }) {
  const save = useSaveSettings();
  const [enabled, setEnabled] = useState<string[]>(() => readSources(settings));
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) =>
    setEnabled((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  // Auto-save toggles shortly after the last change (no Save button), skipping first render.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => {
      setSaved(false);
      // Never persist a source whose dependency is gone (e.g. llm_library after the curator is
      // removed) — else the stored value contradicts the disabled toggle and springs back later.
      const clean = enabled.filter(
        (id) =>
          !sourceBlockedReason(
            SOURCES.find((s) => s.id === id) ?? { id, label: id, desc: "" },
            settings,
          ),
      );
      save.mutate(
        { "candidates.sources": clean },
        { onSuccess: () => setSaved(true) },
      );
    }, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return (
    <section aria-labelledby="recs-heading" className="space-y-3">
      <h2 id="recs-heading" className="text-lg font-semibold">
        Recommendations
      </h2>
      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Where Shortlist looks for titles to suggest. It pools every source
            you enable, keeps only what&rsquo;s already in your library, then
            re-ranks (your AI curator does this when one&rsquo;s connected).
            More sources means wider reach.
          </p>
          {SOURCES.map((source) => {
            const blockedReason = sourceBlockedReason(source, settings);
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
                  checked={enabled.includes(source.id) && !blocked}
                  disabled={blocked}
                  onCheckedChange={() => toggle(source.id)}
                  aria-label={`Enable ${source.label}`}
                />
              </div>
            );
          })}
          <div className="flex h-5 items-center gap-3 pt-1 text-sm text-muted-foreground">
            {save.isPending && <span>Saving…</span>}
            <SavedIndicator show={saved && !save.isPending} />
            {save.isError && (
              <p role="alert" className="text-destructive">
                {apiErrorMessage(save.error, "Saving failed. Try again.")}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
