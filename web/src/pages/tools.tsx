import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  DatabaseZap,
  PlugZap,
  RefreshCw,
  Users as UsersIcon,
  Wrench,
} from "lucide-react";
import { useState } from "react";

import { MutationAlert } from "@/components/mutation-alert";
import { PageHeader } from "@/components/page-header";
import { TestResult } from "@/components/test-result";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { useAutosavedSettings } from "@/lib/autosave";
import { settingString } from "@/lib/format";
import { queryKeys, useSettings } from "@/lib/queries";
import type { Settings } from "@/lib/types";

/**
 * Tools — on-demand maintenance the owner runs by hand, distinct from the nightly schedule. Each
 * action here is a deliberate "reconcile now" for when something has drifted; none of them writes
 * to Plex. Every card handles its own pending / error / success states inline.
 */
export function ToolsPage() {
  const settings = useSettings();

  return (
    <div>
      <PageHeader
        icon={Wrench}
        title="Tools"
        subtitle="On-demand maintenance. Run these when something has drifted — a new user, or watched state that's out of sync — rather than waiting for the nightly run."
      />
      <div className="grid gap-4">
        {/* The reconcile card owns its own database-path setup: the mount is used ONLY by this
            one-off action (the nightly sync never reads Plex's database), so its config belongs with
            it, not buried in a Settings tab the owner would have to leave the task to find. */}
        {settings.data && <ReconcileWatchedCard settings={settings.data} />}
        <SyncHistoryCard />
        <SyncUsersCard />
      </div>
    </div>
  );
}

/** Fill watch history from Plex's database — the only source that sees a mark-as-watched. */
function ReconcileWatchedCard({ settings }: { settings: Settings }) {
  const queryClient = useQueryClient();
  // The path is optional: mounting the database at /plexdb is auto-detected and needs nothing typed
  // here. This field is only for an unusual layout. Blank → the server falls back to /plexdb.
  const savedPath = settingString(settings, "plex.db_path");
  const [path, setPath] = useState(savedPath);
  const [setupOpen, setSetupOpen] = useState(false);

  const save = useAutosavedSettings({ path }, () => ({
    "plex.db_path": path.trim(),
  }));
  const test = useMutation({ mutationFn: () => api.testConnection("plexdb") });
  const reconcile = useMutation({
    mutationFn: api.reconcileWatched,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });
  const result = reconcile.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseZap
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          Reconcile watched from Plex
        </CardTitle>
        <CardDescription>
          Plex fixed a long-standing bug: items you mark-as-watched now create
          history entries (they didn't before). But anything marked before the
          fix is still invisible to Shortlist's usual sync. This is a{" "}
          <strong>one-time manual sync</strong> that reads Plex's database
          directly — the only source that sees marks — and fills those gaps.
          After running it once, the regular nightly sync keeps everyone
          current.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {/* Setup is shown UP FRONT, not gated behind a failed Reconcile — the owner sees what the
            tool needs before they run it, and confirms the mount with Test right here. */}
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setSetupOpen(!setupOpen)}
            aria-expanded={setupOpen}
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
          >
            Database access
            {setupOpen ? (
              <ChevronUp className="size-4 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="size-4 shrink-0" aria-hidden="true" />
            )}
          </button>
          {setupOpen && (
            <div className="space-y-4 border-t px-4 py-4 text-sm">
              <div className="space-y-2 text-muted-foreground">
                <p className="font-medium text-foreground">
                  Mount the database (Docker)
                </p>
                <ol className="ml-4 list-decimal space-y-1.5">
                  <li>
                    Find your Plex database file. On a standard install it's at:
                    <ul className="ml-4 mt-1 list-disc">
                      <li>
                        Linux:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          /var/lib/plexmediaserver/Library/Application
                          Support/Plex Media Server/Plug-in
                          Support/Databases/com.plexapp.plugins.library.db
                        </code>
                      </li>
                      <li>
                        macOS:{" "}
                        <code className="rounded bg-muted px-1 py-0.5">
                          ~/Library/Application Support/Plex Media
                          Server/Plug-in
                          Support/Databases/com.plexapp.plugins.library.db
                        </code>
                      </li>
                    </ul>
                  </li>
                  <li>
                    Mount it <strong>read-only</strong> into the Shortlist
                    container at <code>/plexdb</code>:
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs">
                      {`-v /path/to/com.plexapp.plugins.library.db:/plexdb:ro`}
                    </pre>
                  </li>
                  <li>
                    That's it — <code>/plexdb</code> is picked up automatically.
                    Test it below, then run Reconcile.
                  </li>
                </ol>
                <p className="text-xs italic">
                  The mount is read-only — Shortlist never writes to Plex's
                  database. Only possible when Shortlist runs on the same
                  machine as Plex.
                </p>
              </div>

              {/* Optional custom path — only for a non-standard mount. Blank = the /plexdb default. */}
              <div className="space-y-2 border-t pt-3">
                <Label htmlFor="reconcile-db-path">
                  Custom path (optional)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Leave blank if you mounted at <code>/plexdb</code>. Set this
                  only for a different mount point. A folder or the file itself
                  both work.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    id="reconcile-db-path"
                    value={path}
                    spellCheck={false}
                    placeholder="/plexdb"
                    className="max-w-xs"
                    onChange={(e) => setPath(e.target.value)}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => test.mutate()}
                    loading={test.isPending}
                  >
                    {!test.isPending && <PlugZap aria-hidden="true" />}
                    Test
                  </Button>
                </div>
                {test.isSuccess && <TestResult result={test.data} />}
                {test.isError && <TestResult error={test.error} />}
                <SaveStatusLine save={save} />
              </div>
            </div>
          )}
        </div>

        <div>
          <Button
            onClick={() => reconcile.mutate()}
            loading={reconcile.isPending}
          >
            <DatabaseZap aria-hidden="true" />
            Reconcile now
          </Button>
        </div>

        {reconcile.isError && (
          <MutationAlert
            error={reconcile.error}
            fallback="Couldn't read Plex's database. Check the mount and try again."
            onRetry={() => reconcile.mutate()}
          />
        )}

        {result && !result.configured && (
          <p role="status" className="text-sm text-warning">
            No Plex database found. Open <strong>Database access</strong> above
            to mount it, then run Reconcile.
          </p>
        )}

        {result?.configured && (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-500"
            />
            {result.added > 0
              ? `Added ${result.added} watched ${result.added === 1 ? "title" : "titles"} across ${result.users} ${result.users === 1 ? "user" : "users"} that the play history never saw.`
              : `Everyone's already in sync — the database held nothing the play history hadn't already recorded (checked ${result.users} ${result.users === 1 ? "user" : "users"}).`}
          </p>
        )}

        <p className="text-xs text-muted-foreground">
          <strong>Note:</strong> Plex fixed this in recent versions — new
          mark-as-watched actions now appear in history automatically. This tool
          is for backfilling old marks only. You shouldn't need to run it again
          after the first time.
        </p>
      </CardContent>
    </Card>
  );
}

/** The compact "Saving… / Saved / failed + retry" readout, reused by the reconcile path field. */
function SaveStatusLine({
  save,
}: {
  save: ReturnType<typeof useAutosavedSettings>;
}) {
  if (save.isError && !save.isPending) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn't save the path.{" "}
        <button onClick={save.retry} className="font-medium underline">
          Try again
        </button>
      </p>
    );
  }
  if (save.isPending) {
    return <p className="text-xs text-muted-foreground">Saving…</p>;
  }
  if (save.saved) {
    return <p className="text-xs text-success">Saved.</p>;
  }
  return null;
}

/** Pull the latest plays for everyone now, rather than waiting for the nightly watch-status sync. */
function SyncHistoryCard() {
  const sync = useMutation({ mutationFn: api.syncWatched });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          Sync watch history now
        </CardTitle>
        <CardDescription>
          Pull the newest plays for every user from Plex (and Tautulli, if
          connected) right now. This runs automatically each day; use it when
          you want the effectiveness report refreshed straight away.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button
            variant="outline"
            onClick={() => sync.mutate()}
            loading={sync.isPending}
          >
            <RefreshCw aria-hidden="true" />
            Sync history
          </Button>
        </div>
        {sync.isError && (
          <MutationAlert
            error={sync.error}
            fallback="Couldn't start the sync. Check the Plex connection and try again."
            onRetry={() => sync.mutate()}
          />
        )}
        {sync.isSuccess && (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-500"
            />
            Sync started — it runs in the background across every user. The
            effectiveness report updates on its own once it finishes.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Re-pull the shared + Home users (and the owner) from plex.tv into the users table. */
function SyncUsersCard() {
  const queryClient = useQueryClient();
  const sync = useMutation({
    mutationFn: api.syncUsers,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.users }),
  });
  const result = sync.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon
            aria-hidden="true"
            className="size-5 text-muted-foreground"
          />
          Sync users
        </CardTitle>
        <CardDescription>
          Re-pull everyone you share with — and yourself — from plex.tv and
          Tautulli (if connected). Refreshes usernames, display names/friendly
          names, and share status. Use it after inviting someone new so they
          show up in the user list without waiting for the next run.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div>
          <Button
            variant="outline"
            onClick={() => sync.mutate()}
            loading={sync.isPending}
          >
            <UsersIcon aria-hidden="true" />
            Sync users
          </Button>
        </div>
        {sync.isError && (
          <MutationAlert
            error={sync.error}
            fallback="Couldn't reach plex.tv to refresh the user list. Try again."
            onRetry={() => sync.mutate()}
          />
        )}
        {result && (
          <p className="flex items-center gap-2 text-sm text-foreground">
            <CheckCircle2
              aria-hidden="true"
              className="size-4 text-emerald-600 dark:text-emerald-500"
            />
            {result.added > 0 || result.updated > 0
              ? `Synced ${result.total} ${result.total === 1 ? "user" : "users"} — ${result.added} added, ${result.updated} updated.`
              : `All ${result.total} ${result.total === 1 ? "user is" : "users are"} already up to date.`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
