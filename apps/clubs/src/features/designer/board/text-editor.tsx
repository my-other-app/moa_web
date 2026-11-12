"use client";

import type { TextLayerV2, TokenGroup } from "@moa/layout";
import { Button } from "@moa/ui";
import * as React from "react";

import { TokenMenu } from "../components/fields";
import type { DesignToken } from "../schemas";

/**
 * Writing in a text layer where it sits: a text box over the layer, in its
 * font, size and alignment, showing the template itself ({{tokens}} and
 * all), with the token menu above it. Every keystroke is part of one undo
 * step. Escape or Done finishes; so does a click anywhere else on the stage.
 */
export const TextEditor = ({
  layer,
  frame,
  zoom,
  color,
  onChange,
  onDone,
  tokens,
  samples,
  groups,
}: {
  layer: TextLayerV2;
  /** Where the layer is on screen. */
  frame: React.CSSProperties;
  zoom: number;
  /** The text's colour as painted. */
  color: string;
  onChange: (text: string) => void;
  onDone: () => void;
  tokens: DesignToken[];
  samples: Record<string, string>;
  groups: TokenGroup[];
}) => {
  const area = React.useRef<HTMLTextAreaElement>(null);
  const caret = React.useRef<{ start: number; end: number }>({ start: layer.text.length, end: layer.text.length });

  React.useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const remember = () => {
    const el = area.current;
    if (el) caret.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const insert = (snippet: string) => {
    const { start, end } = caret.current;
    const next = layer.text.slice(0, start) + snippet + layer.text.slice(end);
    onChange(next);
    const at = start + snippet.length;
    caret.current = { start: at, end: at };
    // After the menu hands focus back, put the caret after what was inserted.
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(at, at);
    });
  };

  const pad = layer.padding.map((p) => `${p * zoom}px`).join(" ");
  return (
    <div data-editor="" className="z-20" style={frame}>
      <div className="bg-surface border-line-soft shadow-floating absolute bottom-full left-0 mb-2 flex items-center gap-1.5 rounded-[var(--radius-md)] border p-1" style={{ transform: frame.transform ? "none" : undefined }}>
        <TokenMenu onInsert={insert} tokens={tokens} samples={samples} groups={groups} />
        <Button type="button" size="xs" onClick={onDone}>
          Done
        </Button>
      </div>
      <textarea
        ref={area}
        aria-label={`Text of ${layer.name}`}
        value={layer.text}
        spellCheck={false}
        onChange={(e) => {
          onChange(e.target.value);
          remember();
        }}
        onSelect={remember}
        onKeyUp={remember}
        onBlur={remember}
        onKeyDown={(e) => {
          if (e.key === "Escape" || (e.key === "Enter" && (e.metaKey || e.ctrlKey))) {
            e.preventDefault();
            onDone();
          }
          e.stopPropagation();
        }}
        className="ring-brand block size-full resize-none overflow-hidden bg-white/85 ring-2 outline-none"
        style={{
          fontFamily: `'${layer.font.family}'`,
          fontWeight: layer.font.weight,
          fontStyle: layer.font.style,
          fontSize: layer.size * zoom,
          lineHeight: layer.lineHeight,
          letterSpacing: `${layer.letterSpacing}em`,
          textAlign: layer.align,
          textTransform: layer.transform === "upper" ? "uppercase" : layer.transform === "lower" ? "lowercase" : "none",
          color,
          padding: pad,
        }}
      />
    </div>
  );
};
