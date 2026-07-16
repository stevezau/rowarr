import { AlertTriangle, RotateCw, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { MutationAlert } from "@/components/mutation-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useOwnedCollections } from "@/lib/queries";
import type { OwnedCollection } from "@/lib/types";

function CollectionRow({ row }: { row: OwnedCollection }) {
  return (
    <li className="flex items-center justify-between gap-3 border-t py-2 text-sm first:border-t-0">
      <span className="min-w-0">
        <span className="font-medium">{row.title}</span>{" "}
        <span className="text-muted-foreground">· {row.library}</span>
      </span>
      {row.orphan ? (
        <Badge variant="secondary" className="shrink-0 gap-1">
          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
          no longer in the app
        </Badge>
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">
          {row.kind === "shared" ? "shared" : row.slug}
        </span>
      )}
    </li>
  );
}

/** Read-only audit: lists every Shortlist collection actually on Plex (not from the database), so the
 *  owner can confirm nothing has drifted out of sync and see exactly what a cleanup would remove. */
export function CleanupAuditCard() {
  const [checked, setChecked] = useState(false);
  const audit = useOwnedCollections(checked);

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-medium">What Shortlist has on your Plex</p>
            <p className="text-sm text-muted-foreground">
              Every row Shortlist has created, read straight from Plex by its
              label — so it catches anything that drifted out of sync with the
              app. This is exactly what a full uninstall would remove.
            </p>
          </div>
          <Button
            variant="outline"
            onClick={() => (checked ? audit.refetch() : setChecked(true))}
            loading={audit.isFetching}
          >
            {!audit.isFetching && <RotateCw aria-hidden="true" />}
            {checked ? "Re-check" : "Check Plex"}
          </Button>
        </div>

        {checked && audit.isPending && <Skeleton className="h-24 w-full" />}

        {audit.isError && (
          <MutationAlert
            error={audit.error}
            fallback="Couldn’t read your collections from Plex. Check the connection and try again."
          />
        )}

        {audit.data &&
          (audit.data.total === 0 ? (
            <p className="text-sm text-muted-foreground">
              Shortlist has no collections on your Plex right now.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {audit.data.orphans > 0 ? (
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <AlertTriangle
                      className="h-4 w-4 text-amber-500"
                      aria-hidden="true"
                    />
                    {audit.data.total} rows on Plex — {audit.data.orphans} whose
                    user or shared row is gone from the app (safe to remove).
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 font-medium text-foreground">
                    <ShieldCheck
                      className="h-4 w-4 text-success"
                      aria-hidden="true"
                    />
                    {audit.data.total} rows on Plex — all in sync with the app.
                  </span>
                )}
              </div>
              <ul className="rounded-md border px-3">
                {audit.data.collections.map((row) => (
                  <CollectionRow key={row.rating_key} row={row} />
                ))}
              </ul>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}
