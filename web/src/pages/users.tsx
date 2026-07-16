import { Users as UsersIcon } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { MutationAlert } from "@/components/mutation-alert";
import { PageHeader } from "@/components/page-header";
import { QueryBoundary, EmptyState } from "@/components/query-boundary";
import { UserAvatar } from "@/components/user-avatar";
import { UserBadges } from "@/components/user-badges";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatHitRate, timeAgo } from "@/lib/format";
import { useSetAllUsersEnabled, usePatchUser, useUsers } from "@/lib/queries";

function UsersSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  );
}

export function UsersPage() {
  const usersQuery = useUsers();
  const patchUser = usePatchUser();
  const setAll = useSetAllUsersEnabled();
  const [confirmDisableOpen, setConfirmDisableOpen] = useState(false);
  const [confirmEnableOpen, setConfirmEnableOpen] = useState(false);
  const userCount = usersQuery.data?.length ?? 0;

  return (
    <div>
      <PageHeader
        icon={UsersIcon}
        title="Users"
        subtitle="Everyone on your Plex server. Turn a user on to give them a nightly Picked-for-You row."
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmEnableOpen(true)}
              loading={setAll.isPending && setAll.variables === true}
            >
              Enable all
            </Button>
            <Button
              variant="outline"
              onClick={() => setConfirmDisableOpen(true)}
            >
              Disable all
            </Button>
          </div>
        }
      />

      {/* The Switch reads the server's answer, so a rejected PATCH just snaps it back — which is
          indistinguishable from the click never landing unless we say what happened. */}
      {patchUser.isError && (
        <MutationAlert
          className="mb-4"
          error={patchUser.error}
          fallback="Couldn’t change that user. Try again."
          onRetry={() => {
            const last = patchUser.variables;
            if (last) patchUser.mutate(last);
          }}
        />
      )}
      {setAll.isError && (
        <MutationAlert
          className="mb-4"
          error={setAll.error}
          fallback="Couldn’t update everyone at once. Try again."
        />
      )}

      <Dialog open={confirmEnableOpen} onOpenChange={setConfirmEnableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Give a Picked-for-You row to all {userCount} users?
            </DialogTitle>
            <DialogDescription>
              This turns everyone on, so each user gets their own private
              Picked-for-You row on the next run. Turn anyone back off
              individually whenever you like.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmEnableOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={setAll.isPending && setAll.variables === true}
              onClick={() =>
                setAll.mutate(true, {
                  onSuccess: () => setConfirmEnableOpen(false),
                })
              }
            >
              Enable all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDisableOpen} onOpenChange={setConfirmDisableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Turn off every user?</DialogTitle>
            <DialogDescription>
              This disables all users and removes every Picked-for-You row from
              Plex right away. Share filters and snapshots are left untouched —
              turn anyone back on to rebuild their row on the next run.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmDisableOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={setAll.isPending && setAll.variables === false}
              onClick={() =>
                setAll.mutate(false, {
                  onSuccess: () => setConfirmDisableOpen(false),
                })
              }
            >
              Disable all
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QueryBoundary
        query={usersQuery}
        skeleton={<UsersSkeleton />}
        isEmpty={(users) => users.length === 0}
        empty={
          <EmptyState
            title="No users yet"
            hint="Shortlist hasn't imported any Plex users. Finish the setup wizard, or check the Plex connection under Settings."
          />
        }
      >
        {(users) => (
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>User</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Watch history</TableHead>
                  <TableHead>Last run</TableHead>
                  <TableHead title="Share of Shortlist's picks this person has watched">
                    Picks watched
                  </TableHead>
                  <TableHead className="text-right">Enabled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id} className="group">
                    <TableCell>
                      <Link
                        to={`/users/${user.id}`}
                        className="flex items-center gap-3 rounded-sm font-medium text-foreground group-hover:text-primary"
                      >
                        <UserAvatar name={user.username} size="sm" />
                        <span className="group-hover:underline">
                          {user.username}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <UserBadges
                          user={user}
                          emptyFallback={
                            <span className="text-sm text-muted-foreground">
                              —
                            </span>
                          }
                        />
                      </div>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {user.history_depth} titles
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {timeAgo(user.last_run_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {formatHitRate(user.hit_rate)}
                    </TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={user.enabled}
                        onCheckedChange={(enabled) =>
                          patchUser.mutate({ id: user.id, patch: { enabled } })
                        }
                        aria-label={`Shortlist row for ${user.username}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </QueryBoundary>
    </div>
  );
}
