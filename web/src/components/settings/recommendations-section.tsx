import { useState } from "react";
import { Link } from "react-router-dom";

import { SaveStatus } from "@/components/save-status";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { useAutosave } from "@/lib/autosave";
import { cleanSources, SOURCES, sourceBlockedReason } from "@/lib/sources";
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

  const retry = useAutosave(enabled, () => {
    setSaved(false);
    save.mutate(
      { "candidates.sources": cleanSources(enabled, settings) },
      { onSuccess: () => setSaved(true) },
    );
  });

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
          <p className="text-sm text-muted-foreground">
            This is the <strong>default every row inherits</strong>. Any row can
            use its own sources and its own AI style instead —{" "}
            <Link to="/rows" className="font-medium underline">
              Rows
            </Link>{" "}
            → Edit → Recommendation sources.
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
          <div className="pt-1">
            <SaveStatus
              isPending={save.isPending}
              isError={save.isError}
              error={save.error}
              saved={saved}
              onRetry={retry}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
