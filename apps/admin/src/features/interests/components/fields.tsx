import * as React from "react";

/** One labelled field in a topic or interest dialog: the label, the control, a hint, the error. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: React.ReactNode;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="eyebrow">
        {label}
      </label>
      {children}
      {hint ? (
        <span id={`${id}-hint`} className="text-ink-3 text-[12px]">
          {hint}
        </span>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-refuse m-0 text-[12px]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** aria wiring for a control inside a Field. */
export function fieldAria(id: string, error: string | undefined, hint?: boolean) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined,
  } as const;
}
