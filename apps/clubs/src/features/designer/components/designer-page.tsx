"use client";

import { Tabs, TabsList, TabsTrigger } from "@moa/ui";
import { useSearchParams } from "next/navigation";
import * as React from "react";

import { DESIGNERS } from "../config";
import { DESIGN_KINDS, type DesignKind, type DesignScope } from "../schemas";
import { LayerDesignerPage } from "./layer-designer";

const isKind = (v: string | null): v is DesignKind => !!v && (DESIGN_KINDS as readonly string[]).includes(v);

/** One page for every design: a tab each, the editor keyed so a draft never crosses over. `?kind=` opens on one. */
export function DesignerPage({ scope }: { scope: DesignScope }) {
  return (
    <React.Suspense fallback={null}>
      <Designers scope={scope} />
    </React.Suspense>
  );
}

function Designers({ scope }: { scope: DesignScope }) {
  const params = useSearchParams();
  const [kind, setKind] = React.useState<DesignKind>(() => {
    const asked = params.get("kind");
    return isKind(asked) ? asked : "ticket";
  });
  return (
    <div className="space-y-4">
      <Tabs value={kind} onValueChange={(v) => setKind(v as DesignKind)}>
        <TabsList>
          {DESIGN_KINDS.map((k) => (
            <TabsTrigger key={k} value={k}>
              {DESIGNERS[k].title}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <LayerDesignerPage key={kind} scope={scope} kind={kind} />
    </div>
  );
}
