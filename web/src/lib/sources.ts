import type { Settings } from "@/lib/types";
import { settingString } from "@/lib/format";

/**
 * The candidate sources the engine knows how to run. Shortlist pools every enabled source, keeps
 * only what's already in the library, then the AI re-ranks. Enabled globally in Settings →
 * Recommendations, or overridden per row in the row editor. Mirrors engine `KNOWN_SOURCES`.
 */
export interface SourceInfo {
  id: string;
  label: string;
  desc: string;
  /** Compact name for summaries where the full label won't fit (e.g. a row card). */
  short?: string;
  /** A dependency this source needs before it can run; the toggle is disabled until it's satisfied. */
  requires?: "curator" | "trakt";
}

export const SOURCES: readonly SourceInfo[] = [
  {
    id: "tmdb_similar",
    label: "TMDB — similar titles",
    short: "TMDB similar",
    desc: "The baseline: titles TMDB says are similar to what each person watched.",
  },
  {
    id: "tmdb_discover",
    label: "TMDB — discover by taste",
    short: "TMDB discover",
    desc: "Widens the net to popular, well-rated titles in the genres each person leans toward.",
  },
  {
    id: "llm_library",
    label: "AI — suggests from your library",
    short: "AI from library",
    desc: "Your AI curator reads each person's taste and picks owned titles that fit — reaching across your whole library, not just what's similar to one seed.",
    requires: "curator",
  },
  {
    id: "trakt",
    label: "Trakt — related titles",
    short: "Trakt",
    desc: "Uses Trakt's recommendation graph — often surfaces 'what to watch next' picks TMDB's similar list misses.",
    requires: "trakt",
  },
  {
    id: "llm_web",
    label: "AI — web search for what to watch next",
    short: "AI web search",
    desc: "Your AI curator searches the live web for current, well-reviewed titles to watch next, then resolves them against your library. Needs a curator with web search (Claude or GPT).",
    requires: "curator",
  },
];

/** The compact name for a source id — falls back to the raw id for a source the UI doesn't know. */
export function sourceShortLabel(id: string): string {
  const source = SOURCES.find((s) => s.id === id);
  return source?.short ?? source?.label ?? id;
}

/** Whether an AI curator is configured (needed by curator-dependent sources). */
export function hasCurator(settings: Settings): boolean {
  return !["", "none"].includes(settingString(settings, "curator.provider"));
}

/** Whether a Trakt API key is on file (needed by the Trakt source). */
export function hasTrakt(settings: Settings): boolean {
  return Boolean(settingString(settings, "trakt.client_id"));
}

/** The reason a source can't be enabled yet, or null when its dependency is satisfied. */
export function sourceBlockedReason(
  source: SourceInfo,
  settings: Settings,
): string | null {
  if (source.requires === "curator" && !hasCurator(settings))
    return "Needs an AI curator — set one up in Connections first.";
  if (source.requires === "trakt" && !hasTrakt(settings))
    return "Needs a Trakt API key — add it in Connections first.";
  return null;
}

/**
 * Drop every source whose dependency is gone (e.g. `llm_library` once the curator is removed).
 *
 * Persisting a blocked source stores a value that contradicts its own toggle — the row/settings say
 * the source is on while the UI shows it off and disabled — and it springs back into use the moment
 * the dependency returns. Both the global picker and the per-row picker strip through here, so
 * neither can save one. A source id the UI doesn't know is left alone rather than dropped.
 */
export function cleanSources(ids: string[], settings: Settings): string[] {
  return ids.filter((id) => {
    const source = SOURCES.find((s) => s.id === id);
    return (
      source === undefined || sourceBlockedReason(source, settings) === null
    );
  });
}
