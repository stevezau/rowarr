import { Play, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";

import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { formatHitRate, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/types";

// Subtle per-tile tones so the preview reads as a strip of posters, not one flat block.
const TILE_TONES = [
  "from-muted-foreground/30 to-muted-foreground/10",
  "from-muted-foreground/20 to-muted-foreground/5",
  "from-primary/20 to-muted-foreground/5",
  "from-muted-foreground/25 to-muted-foreground/10",
  "from-muted-foreground/15 to-muted-foreground/5",
  "from-primary/15 to-muted-foreground/10",
];

export interface UserCardProps {
  user: User;
  /** Pipeline stage name while a run is in flight for this user, else null. */
  activeStage: string | null;
  /** True while the "Run now" request for this user is pending. */
  runPending: boolean;
  onRunNow: (user: User) => void;
  onToggleEnabled: (user: User, enabled: boolean) => void;
}

function statusLine(user: User, activeStage: string | null): string {
  if (activeStage) return `Running: ${activeStage}…`;
  if (!user.enabled) return "Turned off — no row is maintained for this user.";
  if (user.cold_start)
    return "Thin history — getting the popular-titles fallback row.";
  if (user.last_run_at) return `Row refreshed ${timeAgo(user.last_run_at)}.`;
  return "Never run yet.";
}

/** Dashboard card for one Plex user: poster strip, status, hit rate, controls. */
export function UserCard({
  user,
  activeStage,
  runPending,
  onRunNow,
  onToggleEnabled,
}: UserCardProps) {
  const switchId = `enable-${user.slug}`;
  return (
    <Card
      data-testid={`user-card-${user.slug}`}
      className={user.enabled ? "" : "opacity-60"}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="flex items-center gap-2.5">
          <UserAvatar name={user.username} size="md" />
          <Link to={`/users/${user.id}`} className="rounded-sm hover:underline">
            {user.username}
          </Link>
        </CardTitle>
        <div className="flex items-center gap-2">
          {user.cold_start && (
            <Badge
              variant="warning"
              title="Not enough watch history yet — starting from popular titles"
            >
              cold start
            </Badge>
          )}
          {user.hit_rate !== null && (
            <Badge
              variant="secondary"
              title="Share of Rowarr's picks this person has watched"
            >
              {formatHitRate(user.hit_rate)} watched
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* A stylised preview of the user's "Picked for You" row — deliberately abstract, not
            unloaded posters. It dims with the card when the user is turned off. */}
        <div
          aria-hidden="true"
          className="relative overflow-hidden rounded-lg border bg-gradient-to-br from-accent/40 to-elevated p-2.5"
        >
          <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" />
            Picked for You
          </div>
          <div className="flex gap-1.5">
            {TILE_TONES.map((tone, i) => (
              <div
                key={i}
                className={cn("h-12 flex-1 rounded bg-gradient-to-b", tone)}
              />
            ))}
          </div>
        </div>
        <p className="min-h-5 text-sm text-muted-foreground">
          {statusLine(user, activeStage)}
        </p>
        <div className="flex items-center justify-between">
          <Button
            size="sm"
            variant="secondary"
            loading={runPending || activeStage !== null}
            disabled={!user.enabled}
            onClick={() => onRunNow(user)}
          >
            {runPending || activeStage !== null ? null : (
              <Play aria-hidden="true" />
            )}
            Run now
          </Button>
          <div className="flex items-center gap-2">
            <label htmlFor={switchId} className="text-xs text-muted-foreground">
              {user.enabled ? "On" : "Off"}
            </label>
            <Switch
              id={switchId}
              checked={user.enabled}
              onCheckedChange={(checked) => onToggleEnabled(user, checked)}
              aria-label={`Rowarr row for ${user.username}`}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
