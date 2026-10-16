import * as React from "react";
import { Search } from "lucide-react";

import { cn } from "../lib/cn";
import { useDebouncedValue } from "../hooks/use-debounced-value";

export interface SearchInputProps extends Omit<
  React.ComponentProps<"input">,
  "value" | "onChange"
> {
  /** Current, immediately-controlled text (drives what's displayed). */
  value: string;
  /** Fires on every keystroke, for updating the controlled `value`. */
  onChange: (value: string) => void;
  /** Fires `delayMs` after typing settles, for triggering a search/query. */
  onDebouncedChange: (value: string) => void;
  delayMs?: number;
  containerClassName?: string;
}

function SearchInput({
  value,
  onChange,
  onDebouncedChange,
  delayMs = 500,
  containerClassName,
  className,
  ...props
}: SearchInputProps) {
  const debounced = useDebouncedValue(value, delayMs);

  /*
   * The callback is held in a ref so a caller passing an inline arrow does not
   * re-fire the search on every render. The ref is written in an effect rather
   * than during render: a render can be thrown away under concurrent
   * rendering, which would leave the ref pointing at a callback from a commit
   * that never happened.
   */
  const onDebouncedChangeRef = React.useRef(onDebouncedChange);
  React.useEffect(() => {
    onDebouncedChangeRef.current = onDebouncedChange;
  }, [onDebouncedChange]);

  React.useEffect(() => {
    onDebouncedChangeRef.current(debounced);
  }, [debounced]);

  // The same pill as `SearchField`; this one debounces for screens that search as you type.
  return (
    <label className={cn("search", containerClassName)}>
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
        {...props}
      />
    </label>
  );
}

export { SearchInput };
