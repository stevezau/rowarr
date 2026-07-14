import { useEffect, useRef } from "react";

/** The one debounce every auto-saving control shares, so text never persists mid-keystroke. */
export const AUTOSAVE_DELAY_MS = 600;

/**
 * Persist `value` shortly after it stops changing — the app's single save paradigm. (The only
 * exception is Settings → Connections, where a half-typed token must never auto-commit.)
 *
 * @param value - The edited state. Compared by content, so building it inline each render is fine.
 * @param save - Fires the mutation. Re-read on every render, so it always sees the latest state.
 * @returns A `retry` that fires the same save immediately — what a failed auto-save's "Try again"
 *   calls, since the value on screen hasn't changed and so can never re-arm the debounce itself.
 */
export function useAutosave(value: unknown, save: () => void): () => void {
  const saveRef = useRef(save);
  saveRef.current = save;

  // Keyed on content, not identity: callers pass a fresh object each render, which as an effect
  // dependency would re-arm the timer forever.
  const key = JSON.stringify(value);
  const firstRender = useRef(true);

  useEffect(() => {
    // Merely opening a page must write nothing.
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => saveRef.current(), AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key]);

  return () => saveRef.current();
}
