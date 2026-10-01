"use client";

import * as React from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";
import {
  FormControl,
  FormDescription,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

/**
 * A colour input paired with its hex value.
 *
 * The native swatch alone hides the actual value, which matters when a club is
 * matching brand colours; the text field lets them paste an exact hex.
 */
export function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} colour picker`}
            className="border-input size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label={`${label} hex value`}
            className="font-mono text-xs uppercase"
            spellCheck={false}
          />
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  description,
}: {
  label: string;
  value: T;
  options: readonly T[];
  onChange: (v: T) => void;
  description?: string;
}) {
  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <FormControl>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
        </FormControl>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {description ? <FormDescription>{description}</FormDescription> : null}
    </FormItem>
  );
}

export function ToggleField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
      <div className="space-y-0.5 pr-4">
        <FormLabel>{label}</FormLabel>
        {description ? <FormDescription>{description}</FormDescription> : null}
      </div>
      <FormControl>
        <Switch checked={checked} onCheckedChange={onChange} />
      </FormControl>
    </FormItem>
  );
}

/**
 * Image picker with a live preview.
 *
 * `existingUrl` keeps an already-uploaded image visible on edit, so it is
 * obvious the template has one even though no new file is selected -- and the
 * encoder only sends a file when one was actually picked.
 */
export function ImageField({
  label,
  file,
  existingUrl,
  onChange,
  hint,
}: {
  label: string;
  file: File | undefined;
  existingUrl?: string | null;
  onChange: (f: File | undefined) => void;
  hint?: string;
}) {
  const [preview, setPreview] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const shown = preview ?? existingUrl ?? null;

  return (
    <FormItem>
      <FormLabel>{label}</FormLabel>
      <FormControl>
        <div className="flex items-center gap-3">
          <label
            className={cn(
              "border-input hover:border-ring hover:bg-accent/40 bg-muted/40 grid size-16 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-md border border-dashed transition-colors",
              pressable
            )}
          >
            {shown ? (
              // eslint-disable-next-line @next/next/no-img-element -- blob: and
              // arbitrary S3 hosts; next/image adds nothing for a 64px chip.
              <img src={shown} alt="" className="size-16 object-contain" />
            ) : (
              <ImagePlusIcon className="text-muted-foreground size-4" />
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onChange(e.target.files?.[0])}
            />
          </label>
          <div className="min-w-0 text-xs">
            {hint ? <p className="text-muted-foreground">{hint}</p> : null}
            {file ? (
              <button
                type="button"
                onClick={() => onChange(undefined)}
                className="text-muted-foreground hover:text-foreground mt-1 inline-flex items-center gap-1"
              >
                <XIcon className="size-3" /> Clear selection
              </button>
            ) : null}
          </div>
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}
