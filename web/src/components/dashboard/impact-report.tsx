import { QueryBoundary } from "@/components/query-boundary";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { timeAgo } from "@/lib/format";
import { useReport } from "@/lib/queries";
import type { EffectivenessReport } from "@/lib/types";

function pct(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

/** A tiny watches-per-week bar chart — no library, just normalized divs. */
function Trend({ trend }: { trend: EffectivenessReport["trend"] }) {
  const recent = trend.slice(-12);
  const max = Math.max(1, ...recent.map((t) => t.watched));
  if (recent.length === 0) return null;
  return (
    <div className="flex h-16 items-end gap-1" aria-hidden="true">
      {recent.map((t) => (
        <div
          key={t.week}
          className="flex-1 rounded-t bg-primary/70"
          style={{ height: `${Math.max(6, (t.watched / max) * 100)}%` }}
          title={`${t.week}: ${t.watched} watched`}
        />
      ))}
    </div>
  );
}

function HitBar({
  delivered,
  watched,
  hit_rate,
}: {
  delivered: number;
  watched: number;
  hit_rate: number | null;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${Math.round((hit_rate ?? 0) * 100)}%` }}
        />
      </div>
      <span className="tabular-nums text-muted-foreground">
        {pct(hit_rate)}{" "}
        <span className="text-xs">
          ({watched}/{delivered})
        </span>
      </span>
    </div>
  );
}

function ReportBody({ report }: { report: EffectivenessReport }) {
  const { overall } = report;
  if (overall.delivered === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No picks delivered yet — run Shortlist, and once people start watching
        what it picked, their hit rate shows up here.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-4xl font-semibold text-primary">
            {pct(overall.hit_rate)}
          </p>
          <p className="text-sm text-muted-foreground">
            of delivered picks got watched — {overall.watched} of{" "}
            {overall.delivered} titles.
          </p>
        </div>
        <div className="w-full max-w-xs">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Watches per week
          </p>
          <Trend trend={report.trend} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="space-y-2">
          <h3 className="text-sm font-medium">By person</h3>
          <div className="space-y-1.5">
            {report.per_user.slice(0, 8).map((u) => (
              <div
                key={u.slug}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{u.username}</span>
                <HitBar {...u} />
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">By row</h3>
          <div className="space-y-1.5">
            {report.per_row.map((r) => (
              <div
                key={r.slug}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="truncate">{r.name}</span>
                <HitBar {...r} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {report.recent.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-medium">
            Recently watched from Shortlist
          </h3>
          <ul className="space-y-1 text-sm">
            {report.recent.slice(0, 10).map((w, i) => (
              <li
                key={`${w.username}-${w.title}-${i}`}
                className="flex flex-wrap items-baseline gap-x-2 text-muted-foreground"
              >
                <span className="font-medium text-foreground">
                  {w.username}
                </span>
                watched
                <span className="text-foreground">{w.title}</span>
                <Badge variant="secondary" className="font-normal">
                  {w.row}
                </Badge>
                {w.watched_at && <span>· {timeAgo(w.watched_at)}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** "Is it working?" — delivered-vs-watched hit rates, overall / per-person / per-row, plus a
 * recent-watches feed. All from picks.watched_at. Shown on the dashboard. */
export function ImpactReport() {
  const report = useReport();
  return (
    <Card>
      <CardHeader>
        <h2 className="text-lg font-semibold">Is it working?</h2>
        <p className="text-sm text-muted-foreground">
          How many of Shortlist&rsquo;s picks people actually watched.
        </p>
      </CardHeader>
      <CardContent>
        <QueryBoundary
          query={report}
          skeleton={<Skeleton className="h-40 w-full" />}
        >
          {(data) => <ReportBody report={data} />}
        </QueryBoundary>
      </CardContent>
    </Card>
  );
}
