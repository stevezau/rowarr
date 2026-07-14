import { RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api";
import { useLibraries } from "@/lib/queries";
import type { PlexLibrary } from "@/lib/types";

type Media = "movie" | "show" | "both";

/** The media type a row curates, derived from the libraries it targets. */
function deriveMedia(selectedKeys: string[], libraries: PlexLibrary[]): Media {
  const types = new Set(
    selectedKeys
      .map((k) => libraries.find((l) => l.key === k)?.type)
      .filter((t): t is "movie" | "show" => Boolean(t)),
  );
  if (types.size !== 1) return "both";
  return types.has("movie") ? "movie" : "show";
}

/**
 * What this row keeps doing while the library list is unavailable — which is NOT "build in all of
 * them". A row with saved `library_keys` goes on building only in those; the picker just can't
 * name them.
 */
function currentTargets(libraryKeys: string[]): string {
  if (libraryKeys.length === 0)
    return "For now it keeps building in every library, as it does today.";
  return libraryKeys.length === 1
    ? "For now it keeps building in the one library you already picked — that doesn’t change."
    : `For now it keeps building in the ${libraryKeys.length} libraries you already picked — that doesn’t change.`;
}

/**
 * Per-row delivery-target picker. A Plex collection lives in one library, so a row builds one
 * collection per library it's pointed at. `library_keys` empty means "every library" (the default,
 * so a server with one movie + one show library needs no thought); any subset targets just those.
 * `media` is derived from the selection so the row only curates the types it can actually deliver.
 */
export function LibraryPicker({
  libraryKeys,
  onChange,
}: {
  libraryKeys: string[];
  onChange: (next: { library_keys: string[]; media: Media }) => void;
}) {
  const query = useLibraries();

  return (
    <div className="space-y-2 border-t pt-4">
      <Label>Libraries</Label>
      {query.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : query.isError ? (
        <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/10 p-3">
          <p role="alert" className="text-sm text-foreground">
            {apiErrorMessage(
              query.error,
              "Couldn’t list your Plex libraries — check the Plex connection in Settings.",
            )}{" "}
            {currentTargets(libraryKeys)}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : query.data.length === 0 ? (
        <div className="space-y-2 rounded-md border border-dashed bg-muted/30 p-3">
          <p className="text-sm text-muted-foreground">
            This Plex server has no movie or TV libraries yet, so there is
            nowhere to build a row. Add one in Plex, then try again.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void query.refetch()}
          >
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      ) : (
        (() => {
          const libraries = query.data;
          const allKeys = libraries.map((l) => l.key);
          // [] means "all" — reflect that as every box ticked.
          const selected = libraryKeys.length === 0 ? allKeys : libraryKeys;
          const toggle = (key: string) => {
            const has = selected.includes(key);
            if (has && selected.length === 1) return; // a row must target at least one library
            const next = has
              ? selected.filter((k) => k !== key)
              : [...selected, key];
            // All ticked -> store [] so the row follows the server (new libraries auto-included).
            const keys = next.length === allKeys.length ? [] : next;
            onChange({
              library_keys: keys,
              media: deriveMedia(next, libraries),
            });
          };
          return (
            <>
              <div className="flex flex-wrap gap-2">
                {libraries.map((lib) => {
                  const checked = selected.includes(lib.key);
                  return (
                    <label
                      key={lib.key}
                      className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggle(lib.key)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="font-medium">{lib.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {lib.type === "movie" ? "movies" : "shows"}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground">
                This row builds a collection in each ticked library. All ticked
                = every library, including any you add later.
              </p>
            </>
          );
        })()
      )}
    </div>
  );
}
