import { useEffect, useState } from "react";

/**
 * The debounced echo of a fast-changing value — e.g. an API key being typed, so a dependent refetch
 * (the curator model list) fires once typing settles rather than on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
