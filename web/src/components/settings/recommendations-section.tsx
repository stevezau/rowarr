import { useState } from "react";
import { Link } from "react-router-dom";

import { SaveStatus } from "@/components/save-status";
import { AiWebSearchCard } from "@/components/settings/ai-web-search-card";
import { FreshnessSlider } from "@/components/settings/freshness-slider";
import { InlineKeyField } from "@/components/settings/inline-key-field";
import { WatchedSlider } from "@/components/settings/watched-slider";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useAutosavedSettings } from "@/lib/autosave";
import { FRESHNESS_DEFAULT, WATCHED_PCT_DEFAULT } from "@/lib/constants";
import {
  hasCurator,
  hasTrakt,
  SOURCES,
  webSearchProvider,
} from "@/lib/sources";
import type { Settings } from "@/lib/types";

// Every source except AI web search — that one gets its own card (backend choice + inline key).
const SIMPLE_SOURCES = SOURCES.filter((s) => s.id !== "llm_web");

function readSources(settings: Settings): string[] {
  const value = settings["candidates.sources"];
  return Array.isArray(value)
    ? value.filter((x): x is string => typeof x === "string")
    : ["tmdb_similar", "tmdb_discover"];
}

/** A global 0..1 setting, edited as whole percent. */
function readPercent(
  settings: Settings,
  key: string,
  fallback: number,
): number {
  const value = Number(settings[key]);
  if (!Number.isFinite(value)) return fallback;
  return Math.round(Math.min(1, Math.max(0, value)) * 100);
}

/** When an enabled source is missing its dependency, show how to satisfy it RIGHT HERE. */
function InlineFix({
  sourceId,
  settings,
}: {
  sourceId: string;
  settings: Settings;
}) {
  if (sourceId === "trakt" && !hasTrakt(settings)) {
    return (
      <InlineKeyField
        settingKey="trakt.client_id"
        service="trakt"
        label="Trakt API key"
        placeholder="Trakt app client id"
        hint="Paste your Trakt app client id to switch this source on — no trip to Connections."
        helpUrl="https://trakt.tv/oauth/applications"
        settings={settings}
      />
    );
  }
  if (sourceId === "llm_library" && !hasCurator(settings)) {
    return (
      <p className="text-sm text-warning">
        Needs an AI curator to read each person’s taste —{" "}
        <a href="#connections" className="font-medium underline">
          set one up in Connections
        </a>
        .
      </p>
    );
  }
  return null;
}

export function RecommendationsSection({ settings }: { settings: Settings }) {
  const [enabled, setEnabled] = useState<string[]>(() => readSources(settings));
  const [watchedPct, setWatchedPct] = useState<number>(() =>
    readPercent(settings, "recommendations.watched_pct", WATCHED_PCT_DEFAULT),
  );
  const [freshness, setFreshness] = useState<number>(() =>
    readPercent(settings, "recommendations.freshness", FRESHNESS_DEFAULT),
  );
  const [searchBackend, setSearchBackend] = useState<string>(() =>
    webSearchProvider(settings),
  );

  const toggle = (id: string) =>
    setEnabled((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  // Persist the owner's INTENT (the enabled set as chosen). A source whose dependency isn't met yet
  // no-ops safely in the engine and shows an inline "here's what's needed" prompt — never a silent lie.
  const save = useAutosavedSettings(
    { enabled, watchedPct, freshness, searchBackend },
    () => ({
      "candidates.sources": enabled,
      "recommendations.watched_pct": watchedPct / 100,
      "recommendations.freshness": freshness / 100,
      "llm_web.search_provider": searchBackend,
    }),
  );

  return (
    <section aria-labelledby="recs-heading" className="space-y-3">
      <h2 id="recs-heading" className="text-lg font-semibold">
        Recommendations
      </h2>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <p className="text-sm text-muted-foreground">
            Where Shortlist looks for titles to suggest.
            <br />
            It gathers from every source you turn on, keeps only titles already
            in your library, then ranks them. More sources → wider reach.
          </p>
          <p className="text-sm text-muted-foreground">
            This is the <strong>default every row inherits</strong>. Any row can
            use its own sources instead —{" "}
            <Link to="/rows" className="font-medium underline">
              Rows
            </Link>{" "}
            → Edit → Recommendation sources.
          </p>
          <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Where AI is used, and what it costs
            </p>
            <p>
              The <strong>TMDB</strong> sources use no AI — just the free TMDB
              key you already added — and find most of the titles.
            </p>
            <p>Two sources below use your AI curator (so they cost tokens):</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <strong>AI web search</strong> — the strongest extra in our
                testing; surfaces acclaimed titles TMDB misses.
              </li>
              <li>
                <strong>AI from library</strong> — adds the least for the most
                cost. Turn this off first if you want to save.
              </li>
            </ul>
            <p>
              Your AI curator also makes the final pick and writes each row’s
              short “why”.
            </p>
            <p>
              Prefer no AI at all? Turn the AI sources off and set the curator
              to <strong>None</strong> under Curation — you still get full rows,
              ranked by score with plain reasons.
            </p>
          </div>
          {SIMPLE_SOURCES.map((source) => (
            <div key={source.id} className="space-y-2">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <p className="text-sm font-medium">{source.label}</p>
                  <p className="text-sm text-muted-foreground">{source.desc}</p>
                </div>
                <Switch
                  checked={enabled.includes(source.id)}
                  onCheckedChange={() => toggle(source.id)}
                  aria-label={`Enable ${source.label}`}
                />
              </div>
              {enabled.includes(source.id) && (
                <InlineFix sourceId={source.id} settings={settings} />
              )}
            </div>
          ))}
          {enabled.length === 0 && (
            // Empty isn't "no discovery" — the engine floors it to its defaults, so say so out loud
            // (the setting must never read as fully off while a run still uses two sources). It's an
            // advisory, not an error, so it's role="status".
            <p role="status" className="text-sm text-warning">
              Nothing enabled — Shortlist falls back to its defaults (TMDB
              similar + discover). Turn on at least one source to choose your
              own.
            </p>
          )}
        </CardContent>
      </Card>

      <AiWebSearchCard
        settings={settings}
        enabled={enabled.includes("llm_web")}
        onToggle={() => toggle("llm_web")}
        backend={searchBackend}
        onBackendChange={setSearchBackend}
      />

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="watched-pct">Already-watched titles</Label>
            <p className="text-sm text-muted-foreground">
              How much of a row may be things a person has already finished. The
              default every row inherits; any row can choose its own.
            </p>
            <WatchedSlider
              id="watched-pct"
              value={watchedPct}
              onChange={setWatchedPct}
            />
          </div>
          <div className="space-y-2 border-t pt-4">
            <Label htmlFor="freshness">Freshness</Label>
            <p className="text-sm text-muted-foreground">
              How often a row refreshes — not a nightly reshuffle. Most nights a
              row stays exactly as it is (nothing rewritten to Plex); on its
              refresh night the strongest picks stay and the weakest are swapped
              for new ones. Lower = stickier and cheaper; higher = fresher. The
              default every row inherits; any row can choose its own.
            </p>
            <FreshnessSlider
              id="freshness"
              value={freshness}
              onChange={setFreshness}
            />
          </div>
          <div className="pt-1">
            <SaveStatus
              isPending={save.isPending}
              isError={save.isError}
              error={save.error}
              saved={save.saved}
              onRetry={save.retry}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
