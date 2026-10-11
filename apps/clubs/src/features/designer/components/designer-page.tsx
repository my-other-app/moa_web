"use client";

import { Tabs, TabsList, TabsTrigger } from "@moa/ui";
import * as React from "react";

import { DESIGNERS } from "../config";
import { DESIGN_KINDS, type DesignKind } from "../schemas";
import { LayerDesignerPage } from "./layer-designer";

/** One page for both designs: a tab each, the editor keyed so a draft never crosses over. */
export function DesignerPage({ eventId }: { eventId: number }) {
  const [kind, setKind] = React.useState<DesignKind>("ticket");
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
      <LayerDesignerPage key={kind} eventId={eventId} kind={kind} />
    </div>
  );
}
