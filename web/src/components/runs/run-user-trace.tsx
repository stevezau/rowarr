/** The full-pipeline trace for one user in one run: seeds derived from history, what each candidate
 *  source queried and returned, and the exact web-search / RAG prompts. Fetched on demand (the blob
 *  is large) when the dialog opens, so it never weighs down the run-detail payload. */
import { useQuery } from "@tanstack/react-query";
import { Telescope } from "lucide-react";

import { QueryBoundary } from "@/components/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/api";
import type {
  RunUserTrace,
  TraceGather,
  TraceWeb,
  TraceWebSearch,
} from "@/lib/types";

/** A trigger button + dialog. `userId`/`open` are controlled by the parent so it can gate the button
 *  on `has_trace` and only mount the query when actually opened. */
export function RunUserTraceDialog({
  runId,
  userId,
  name,
  open,
  onOpenChange,
}: {
  runId: number;
  userId: number;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const query = useQuery({
    queryKey: ["run", runId, "trace", userId],
    queryFn: () => api.getRunUserTrace(runId, userId),
    enabled: open, // don't fetch the blob until the dialog is actually opened
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Telescope className="h-4 w-4" aria-hidden="true" />
            Pipeline trace — {name}
          </DialogTitle>
          <DialogDescription>
            Exactly what happened for this person: the history that seeded it,
            every source we queried, and what the AI searched for and proposed.
          </DialogDescription>
        </DialogHeader>
        <QueryBoundary
          query={query}
          skeleton={<TraceSkeleton />}
          isEmpty={(d) => !d.trace || Object.keys(d.trace).length === 0}
          empty={
            <p className="py-8 text-center text-sm text-muted-foreground">
              No trace was recorded for this person — the run predates this
              feature, or they were skipped before any candidates were gathered.
            </p>
          }
        >
          {(data) => <TraceBody trace={data.trace} />}
        </QueryBoundary>
      </DialogContent>
    </Dialog>
  );
}

function TraceSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

function TraceBody({ trace }: { trace: RunUserTrace }) {
  return (
    <div className="space-y-6 text-sm">
      {trace.history && <HistorySection history={trace.history} />}
      {trace.seeds && trace.seeds.length > 0 && (
        <SeedsSection seeds={trace.seeds} />
      )}
      {(trace.gathers ?? []).map((gather, i) => (
        <GatherSection key={gather.pool || i} gather={gather} />
      ))}
    </div>
  );
}

/** Small labelled section wrapper — a numbered stage in the pipeline. */
function Stage({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 font-medium text-foreground">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs text-muted-foreground">
          {step}
        </span>
        {title}
      </h3>
      <div className="pl-7">{children}</div>
    </section>
  );
}

function HistorySection({
  history,
}: {
  history: NonNullable<RunUserTrace["history"]>;
}) {
  return (
    <Stage step={1} title="Watch history">
      <p className="mb-2 text-muted-foreground">
        {history.total.toLocaleString()} meaningful watches ·{" "}
        {history.watched_movies.toLocaleString()} finished movies ·{" "}
        {history.watched_shows.toLocaleString()} shows with plays. Most recent:
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {history.recent.map((w, i) => (
          <li key={`${w.title}-${i}`}>
            <Badge variant="secondary" className="font-normal">
              {w.title}
              {w.year ? ` (${w.year})` : ""}
            </Badge>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function SeedsSection({
  seeds,
}: {
  seeds: NonNullable<RunUserTrace["seeds"]>;
}) {
  return (
    <Stage step={2} title={`Seeds (${seeds.length})`}>
      <p className="mb-2 text-muted-foreground">
        The titles we searched from, strongest first — weight blends how
        recently and how often the person watched it.
      </p>
      <ul className="space-y-1">
        {seeds.map((s) => (
          <li
            key={`${s.media}-${s.tmdb_id}`}
            className="flex items-center gap-2"
          >
            <span className="w-10 shrink-0 text-right font-mono text-xs text-muted-foreground">
              {s.weight.toFixed(2)}
            </span>
            <span className="truncate">{s.title}</span>
            <span className="text-xs text-muted-foreground">{s.media}</span>
          </li>
        ))}
      </ul>
    </Stage>
  );
}

function GatherSection({ gather }: { gather: TraceGather }) {
  return (
    <Stage
      step={3}
      title={`Candidate sources${gather.pool ? ` — ${gather.pool}` : ""}`}
    >
      <ul className="mb-3 space-y-1">
        {(gather.sources ?? []).map((src) => (
          <li key={src.source} className="flex items-center gap-2">
            <Badge
              variant={src.status === "failed" ? "destructive" : "outline"}
            >
              {src.source}
            </Badge>
            {src.status === "failed" ? (
              <span className="text-xs text-destructive">
                {src.detail || "failed"}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                {src.contributed} candidate{src.contributed === 1 ? "" : "s"}
              </span>
            )}
          </li>
        ))}
      </ul>
      {gather.discover_genres && (
        <p className="mb-3 text-xs text-muted-foreground">
          Discover widened into:{" "}
          {Object.entries(gather.discover_genres)
            .map(([media, genres]) => `${media}: ${genres.join(", ") || "—"}`)
            .join(" · ")}
        </p>
      )}
      {gather.web && <WebSection web={gather.web} />}
    </Stage>
  );
}

function WebSection({ web }: { web: TraceWeb }) {
  return (
    <div className="mt-2 space-y-3 rounded-md border bg-muted/30 p-3">
      <p className="font-medium text-foreground">AI web search ({web.mode})</p>
      {web.searches && web.searches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Queries sent to the search provider:
          </p>
          {web.searches.map((s, i) => (
            <WebQuery key={i} search={s} />
          ))}
        </div>
      )}
      {web.rag_user && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            The exact prompt the AI ranked from
          </summary>
          {web.rag_system && (
            <pre className="mt-2 whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[11px] leading-relaxed">
              {web.rag_system}
            </pre>
          )}
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-background/70 p-2 font-mono text-[11px] leading-relaxed">
            {web.rag_user}
          </pre>
        </details>
      )}
      <ProposedTitles web={web} />
    </div>
  );
}

function WebQuery({ search }: { search: TraceWebSearch }) {
  return (
    <div className="rounded bg-background/60 p-2">
      <p className="flex items-center gap-2">
        <span className="truncate italic">“{search.query}”</span>
        {search.cached && (
          <Badge variant="secondary" className="shrink-0 text-[10px]">
            cached
          </Badge>
        )}
      </p>
      {search.returned.length > 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          → {search.returned.join(" · ")}
        </p>
      )}
    </div>
  );
}

function ProposedTitles({ web }: { web: TraceWeb }) {
  const proposed = web.proposed ?? [];
  const nativeProposed = web.native_proposed ?? [];
  const resolved = new Set(web.resolved ?? []);
  const unresolved = new Set(web.unresolved ?? []);
  const all = [...new Set([...nativeProposed, ...proposed])];
  if (all.length === 0) return null;
  return (
    <div>
      <p className="mb-1 text-xs text-muted-foreground">
        Titles the AI proposed (struck through = no TMDB match, likely a
        hallucination):
      </p>
      <ul className="flex flex-wrap gap-1.5">
        {all.map((title, i) => {
          const dropped = unresolved.has(title) && !resolved.has(title);
          return (
            <li key={`${title}-${i}`}>
              <Badge
                variant={dropped ? "outline" : "secondary"}
                className={
                  dropped
                    ? "font-normal text-muted-foreground line-through"
                    : "font-normal"
                }
              >
                {title}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** The button that opens the trace dialog. Kept separate so callers can render it inline in a header. */
export function RunUserTraceButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} className="gap-1.5">
      <Telescope className="h-3.5 w-3.5" aria-hidden="true" />
      View trace
    </Button>
  );
}
