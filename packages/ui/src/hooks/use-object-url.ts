import * as React from "react";

/**
 * A blob URL for a locally-picked File, revoked when the file changes or the
 * component unmounts.
 *
 * Derived during render rather than assigned from an effect: setting state in
 * an effect to mirror a prop costs an extra render pass, and the previous
 * version of this (duplicated in three places) tripped
 * `react-hooks/set-state-in-effect`. The effect here only owns the cleanup,
 * which is what actually needs to run on teardown -- without it every re-pick
 * leaks a blob for the life of the page.
 */
export function useObjectUrl(file: File | null | undefined): string | null {
  const url = React.useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file]
  );

  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}
