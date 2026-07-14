import { MutationAlert } from "@/components/mutation-alert";
import { SavedIndicator } from "@/components/saved-indicator";

/**
 * The save readout for an auto-saving section: Saving… → Saved, or — when the write failed — what
 * went wrong plus a "Try again" that re-fires it.
 *
 * The retry is the point. A failed auto-save leaves the typed value sitting on screen looking
 * saved, and nothing re-fires until the owner happens to change the field again; without a button
 * they cannot even ask for the same save twice.
 */
export function SaveStatus({
  isPending,
  isError,
  error,
  saved,
  onRetry,
  fallback = "Saving failed. Check the server log and try again.",
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  /** True once a save has succeeded and nothing has changed since. */
  saved: boolean;
  onRetry: () => void;
  fallback?: string;
}) {
  if (isError && !isPending) {
    return (
      <MutationAlert
        error={error}
        fallback={fallback}
        lead="Not saved."
        onRetry={onRetry}
      />
    );
  }
  return (
    <div className="flex h-5 items-center gap-3 text-sm text-muted-foreground">
      {isPending && <span>Saving…</span>}
      <SavedIndicator show={saved && !isPending} />
    </div>
  );
}
