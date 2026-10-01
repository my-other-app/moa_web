import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`. Depends only on the live value each
 * render (no comparison against stale state), so it can't suffer the
 * stale-closure bug where a `setTimeout` compares against a captured old value.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
