import { Ban, Lightbulb } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { useSetBlocked } from "@/lib/queries";
import type { Pick } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The ranked "#1 Title — why we picked it · inspired by Seed" list, shared by the per-user row card
 * and the run-detail results. Sorts by rank so callers can pass picks in any order.
 *
 * `collapseAfter` caps how many rows show at first, with a "+N more" toggle — a person's row can hold
 * 40 titles, and a page of several rows is a wall without it. Omit it to always show every pick.
 */
/** "Stop suggesting this" and "stop letting THAT inspire suggestions" — the two things rossinior
 *  asked for in issue #5, offered right where you notice the problem: on the pick itself. */
function IgnoreControls({ pick, userId }: { pick: Pick; userId: number }) {
  const setBlocked = useSetBlocked(userId);
  if (pick.tmdb_id === undefined) return null; // a legacy pick with no id recorded

  return (
    <span className="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="sm"
        title={`Never suggest ${pick.title} again`}
        onClick={() =>
          setBlocked.mutate({
            tmdb_id: pick.tmdb_id!,
            media_type: pick.media_type ?? "movie",
            title: pick.title,
            block_pick: true,
          })
        }
      >
        <Ban aria-hidden="true" />
        <span className="sr-only">Never suggest {pick.title}</span>
      </Button>
      {pick.seed_tmdb_id ? (
        <Button
          variant="ghost"
          size="sm"
          title={`Stop "${pick.seed_title}" inspiring recommendations`}
          onClick={() =>
            setBlocked.mutate({
              tmdb_id: pick.seed_tmdb_id!,
              media_type: pick.media_type ?? "movie",
              title: pick.seed_title ?? "",
              block_pick: false,
              block_seed: true,
            })
          }
        >
          <Lightbulb aria-hidden="true" />
          <span className="sr-only">
            Stop {pick.seed_title} inspiring recommendations
          </span>
        </Button>
      ) : null}
    </span>
  );
}

export function PickList({
  picks,
  className,
  collapseAfter,
  userId,
}: {
  picks: Pick[];
  className?: string;
  collapseAfter?: number;
  /** When given, each pick gets Ignore controls for this person (issue #5). */
  userId?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const ordered = [...picks].sort((a, b) => a.rank - b.rank);
  const collapses =
    collapseAfter !== undefined && ordered.length > collapseAfter;
  const shown =
    collapses && !expanded ? ordered.slice(0, collapseAfter) : ordered;
  const hidden = ordered.length - shown.length;

  return (
    <div className="space-y-1.5">
      <ol className={cn("space-y-1.5", className)}>
        {shown.map((pick) => (
          <li key={pick.rank} className="flex items-baseline gap-3 text-sm">
            <span className="w-5 shrink-0 font-semibold text-primary">
              #{pick.rank}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{pick.title}</span>
              <span className="text-muted-foreground">
                {" "}
                — {pick.reason}
                {pick.seed_title ? ` · inspired by ${pick.seed_title}` : ""}
              </span>
            </span>
            {userId !== undefined && <IgnoreControls pick={pick} userId={userId} />}
          </li>
        ))}
      </ol>
      {collapses && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
          aria-expanded={expanded}
        >
          {expanded ? "Show fewer" : `Show all ${ordered.length} (+${hidden})`}
        </button>
      )}
    </div>
  );
}
