"use client";

import * as React from "react";
import { Button, EmptyState, Notice, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@moa/ui";

import { useAccess } from "@/features/access";
import { useFeatureGate } from "@/features/plan";

import { errorText } from "../lib/time";
import { useGamesSettings } from "../queries";
import { DEFAULT_NAME, GAME_FEATURE, type GameSettings } from "../schemas";
import { CardsPanel } from "./cards-panel";
import { DesignerPanel } from "./designer-panel";
import { HuntPanel } from "./hunt-panel";
import { PlayersPanel } from "./players-panel";
import { SetupPanel } from "./setup-panel";

/** The one line under the heading: which games are on, by their names. */
export function gamesLine(s: GameSettings): string {
  const on = [s.cards_on ? s.cards_name || DEFAULT_NAME.cards : null, s.hunt_on ? s.hunt_name || DEFAULT_NAME.hunt : null].filter(Boolean);
  return on.length ? `On: ${on.join(" and ")}` : "No game is on for this event";
}

/**
 * Event → Games: Hero Cards and the Scavenger Hunt, each its own game,
 * switched on per event and named by the club. Apart from Quests and
 * everything else. Changing things is for the owner and admins (and
 * editors); door staff see the monitors and nothing else.
 */
export function GamesPage({ eventId }: { eventId: number }) {
  const settings = useGamesSettings(eventId);
  const { can } = useAccess();
  const cardsGate = useFeatureGate(GAME_FEATURE.cards, { eventId });
  const huntGate = useFeatureGate(GAME_FEATURE.hunt, { eventId });
  const canEdit = Boolean(can.edit_events);
  const canExport = Boolean(can.exports);
  const s = settings.data;

  return (
    <div className="flex flex-col gap-3.5">
      <header>
        <h2 className="m-0 text-[17px] font-semibold tracking-[-0.02em]">Games</h2>
        <p className="text-ink-2 mt-1 text-[13px]">{s ? gamesLine(s) : "Hero Cards and the Scavenger Hunt: games players play on their phones at the event."}</p>
      </header>

      {settings.isPending ? (
        <>
          <Skeleton className="h-[160px] rounded-2xl" />
          <Skeleton className="h-[320px] rounded-2xl" />
        </>
      ) : settings.isError ? (
        <EmptyState
          tone="muted"
          title="Could not load the games"
          description={errorText(settings.error)}
          action={
            <Button variant="secondary" size="sm" onClick={() => void settings.refetch()}>
              Try again
            </Button>
          }
        />
      ) : !s ? (
        <EmptyState tone="muted" title="Games are not here yet" description="Hero Cards and the Scavenger Hunt come with the next update of MyOtherApp." />
      ) : (
        <>
          {!canEdit ? (
            <Notice tone="neutral" tag="Read only">
              Your role can watch the games run; switching them on, changing the rules and cards, and resetting PINs are for the club&apos;s owner and admins.
            </Notice>
          ) : null}
          <Tabs defaultValue="setup" className="flex flex-col gap-3.5">
            <TabsList aria-label="Games sections" className="flex-wrap">
              <TabsTrigger value="setup">Setup</TabsTrigger>
              <TabsTrigger value="cards">{s.cards_name || DEFAULT_NAME.cards}</TabsTrigger>
              <TabsTrigger value="designer">Card designer</TabsTrigger>
              <TabsTrigger value="hunt">{s.hunt_name || DEFAULT_NAME.hunt}</TabsTrigger>
              <TabsTrigger value="players">Players</TabsTrigger>
            </TabsList>
            <TabsContent value="setup">
              <SetupPanel eventId={eventId} s={s} canEdit={canEdit} />
            </TabsContent>
            <TabsContent value="cards">
              <CardsPanel eventId={eventId} canEdit={canEdit} locked={cardsGate.locked} />
            </TabsContent>
            <TabsContent value="designer">
              <DesignerPanel eventId={eventId} canEdit={canEdit} locked={cardsGate.locked} theme={s.theme} />
            </TabsContent>
            <TabsContent value="hunt">
              <HuntPanel eventId={eventId} canEdit={canEdit} locked={huntGate.locked} theme={s.theme} />
            </TabsContent>
            <TabsContent value="players">
              <PlayersPanel eventId={eventId} s={s} canEdit={canEdit} canExport={canExport} />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
