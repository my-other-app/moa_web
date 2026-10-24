"use client";

import * as React from "react";
import * as Sentry from "@sentry/nextjs";

/**
 * A failure in the root layout, which error.tsx sits inside and cannot catch.
 * It replaces the document, so it brings its own html and body and cannot
 * assume the stylesheet loaded -- hence the inline styles.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // A server failure was reported where it happened (it carries a digest);
    // only a failure in the browser is reported from here. A no-op when
    // Sentry is off.
    if (!error.digest) Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f6f7f9",
          color: "#1e1e2e",
          padding: "1.5rem",
        }}
      >
        <div style={{ maxWidth: "26rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.125rem", margin: 0 }}>
            The dashboard could not start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#6b7280", marginTop: "0.5rem" }}>
            Something failed before the page could render. Reloading usually
            clears it.
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              borderRadius: "0.5rem",
              border: "none",
              background: "#2c333d",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "1.25rem" }}>
              Reference {error.digest}
            </p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
