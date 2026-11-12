"use client";

import { ApiError } from "@moa/api";
import { Button, FigurePanel, Notice, type NoticeTone, toast } from "@moa/ui";
import { AlertTriangleIcon, Loader2Icon, RotateCcwIcon, ScanEyeIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { fitImage } from "@/lib/images";

import { type ArtworkField, previewPresetHtml, previewPresetPng } from "../api";
import type { DesignerConfig } from "../config";
import { bindableSlots, choiceFor, defaultIdOf, hasPhotoQuestion, presetProblems, questionFields, tidyChoice, usesBuiltIn } from "../presets";
import { useArtwork, useResetLayout, useSaveArtwork, useSavePreset } from "../queries";
import { AUDIENCES, type Audience, type DesignInfo, type DesignScope, type LayerDesign, type PresetChoice } from "../schemas";
import { PreviewDialog, ResetDialog } from "./dialogs";
import { OptionsPanel } from "./options-panel";
import { PreviewFrame } from "./preview-frame";
import { BackToDesigns, DesignBar, SaveBar, type SaveState } from "./shell";

const errorCopy = (err: unknown) => (err instanceof Error && err.message ? err.message : "Something went wrong.");

/** How long the preview waits after the last change before asking the server again. */
const PREVIEW_DELAY_MS = 300;

/**
 * The server's field errors, keyed the way the panel keys its own
 * ("options.title", "bindings.zone", "accent"). A refused preset answers
 * `errors: {fields: {path: message}}`; other refusals a flat map of lists.
 */
export const serverProblems = (err: unknown) => {
  const out = new Map<string, string>();
  if (!(err instanceof ApiError) || !err.fieldErrors) return out;
  const raw = err.fieldErrors as Record<string, unknown>;
  const byField = raw.fields && typeof raw.fields === "object" && !Array.isArray(raw.fields) ? (raw.fields as Record<string, unknown>) : raw;
  for (const [k, v] of Object.entries(byField)) {
    const message = typeof v === "string" ? v : Array.isArray(v) && typeof v[0] === "string" ? v[0] : null;
    if (message) out.set(k.replace(/^body\./, ""), message);
  }
  return out;
};

/** What changes for things already out when the design changes, by kind. */
const ALREADY_OUT: Record<string, string> = {
  certificate: "Certificates already issued keep the design they were made with.",
  ticket: "Tickets open in the design in use when they are opened.",
  badge: "Cards print in the design in use when they are printed.",
};

/**
 * Where the open design comes from, said once above the preview: the
 * built-in default, the club's design, the event's own, or one group's copy.
 */
const Provenance = ({
  scope,
  audience,
  scopeName,
  config,
  design,
  inUse,
  name,
  defaultName,
  onReset,
}: {
  scope: DesignScope;
  audience: Audience;
  scopeName: string;
  config: DesignerConfig;
  design: LayerDesign;
  inUse: boolean;
  name: string;
  defaultName: string;
  onReset: () => void;
}) => {
  const noun = config.noun;
  // A club's design saved as a ready design has no row of the canvas's kind behind isOwn; one that differs from the built-in is its own.
  const owns = design.isOwn || (scope.kind === "club" && design.active === "preset" && !usesBuiltIn(design));
  const reset = (label: string) => (
    <Button size="sm" variant="secondary" onClick={onReset}>
      <RotateCcwIcon /> {label}
    </Button>
  );
  let tone: NoticeTone = "neutral";
  let tag: string;
  let body: string;
  let action: React.ReactNode = null;
  const using = inUse ? "" : ` ${name} is not in use until you save it.`;

  if (scope.kind === "club") {
    if (owns) {
      tag = "Club design";
      body = `Your club's ${noun} design. Every event without its own uses it.${using}`;
      action = reset("Back to the built-in design");
    } else {
      tone = "accent";
      tag = "Built in";
      body = `Your club has not picked a ${noun} design, so events use ${defaultName}. Save one to make it your club's.${using}`;
    }
  } else if (audience === "event_default") {
    if (design.isOwn) {
      tag = "This event";
      body = `This event's own ${noun} design. Changes to your club's design no longer reach it.${using}`;
      action = reset("Use the club's design");
    } else if (usesBuiltIn(design)) {
      tone = "accent";
      tag = "Built in";
      body = `Nothing is picked for this event or your club yet, so ${noun}s use ${defaultName}. Saving sets the design for this event only.${using}`;
    } else {
      tag = "Club design";
      body = `This event uses your club's ${noun} design. Saving here makes a copy for this event only.${using}`;
      action = (
        <Button asChild size="sm" variant="secondary">
          <Link href={`/templates?kind=${config.kind}`}>Edit the club&apos;s design</Link>
        </Button>
      );
    }
  } else if (design.isOwn) {
    tone = "caution";
    tag = "Own copy";
    body = `${scopeName} have their own ${noun} design. Changes to the event's design do not reach it.${using}`;
    action = reset("Use the event's design");
  } else {
    tone = "caution";
    tag = "Follows event";
    body = `${scopeName} get the event's design. Saving here gives them their own, for example in another colour.${using}`;
  }
  return (
    <Notice tone={tone} tag={tag} action={action}>
      {body}
    </Notice>
  );
};

export const PresetEditor = ({
  scope,
  config,
  audience,
  picker,
  design,
  info,
  dirtyRef,
  onBack,
  onReset,
}: {
  scope: DesignScope;
  config: DesignerConfig;
  audience: Audience;
  picker: React.ReactNode;
  /** What GET /layout answered for this kind and audience: the catalogue, what is in use, the brand, the questions. */
  design: LayerDesign;
  /** The ready design open here. */
  info: DesignInfo;
  dirtyRef: React.MutableRefObject<boolean>;
  onBack: () => void;
  /** After a reset: the design in use changed, so the tab goes back to the gallery. */
  onReset: () => void;
}) => {
  const kind = config.kind;
  const save = useSavePreset(scope, kind, audience);
  const reset = useResetLayout(scope, kind, audience);
  const fields = React.useMemo(() => questionFields(design), [design]);
  const slots = React.useMemo(() => bindableSlots(info, design.bindable), [info, design.bindable]);
  const scopeName = AUDIENCES.find((a) => a.value === audience)?.label ?? "Everyone";
  const Noun = config.noun[0]!.toUpperCase() + config.noun.slice(1);
  const subject = scope.kind === "club" ? `Your club's ${config.noun} design` : `${Noun} for ${scopeName.toLowerCase()}`;
  const defaultName = design.catalogue.find((d) => d.id === defaultIdOf(design))?.name ?? "the built-in design";
  const owns = design.isOwn || (scope.kind === "club" && design.active === "preset" && !usesBuiltIn(design));

  // Opened on the saved settings when this is the design in use, else on the design's own defaults.
  const [start] = React.useState<PresetChoice>(() => choiceFor(info, design.preset));
  const [saved, setSaved] = React.useState<string | null>(() =>
    design.active === "preset" && design.preset?.id === info.id ? JSON.stringify(tidyChoice(choiceFor(info, design.preset), info)) : null
  );
  const [choice, setChoice] = React.useState<PresetChoice>(start);
  const [fromServer, setFromServer] = React.useState<Map<string, string>>(() => new Map());
  const [dialog, setDialog] = React.useState<"preview" | "reset" | null>(null);
  const [png, setPng] = React.useState<Blob | null>(null);
  const [pngBusy, setPngBusy] = React.useState<string | null>(null);

  const current = JSON.stringify(tidyChoice(choice, info));
  const inUse = saved !== null;
  const changed = current !== JSON.stringify(tidyChoice(start, info));
  const needsSave = !inUse || current !== saved;
  React.useEffect(() => {
    dirtyRef.current = changed && needsSave;
    return () => {
      dirtyRef.current = false;
    };
  }, [changed, needsSave, dirtyRef]);
  // Leaving with unsaved changes asks first.
  React.useEffect(() => {
    if (!(changed && needsSave)) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [changed, needsSave]);

  const problems = React.useMemo(() => presetProblems(info, choice, fields, design.bindable), [info, choice, fields, design.bindable]);
  const problemMap = React.useMemo(() => {
    const m = new Map(fromServer);
    for (const p of problems) if (!m.has(p.path)) m.set(p.path, p.message);
    return m;
  }, [problems, fromServer]);

  const change = (fn: (c: PresetChoice) => PresetChoice) => {
    setChoice(fn);
    if (fromServer.size) setFromServer(new Map());
  };

  // ─── The live preview: the server fills the design, the browser draws it ───
  // A picture uploaded changes the document without changing the settings: the preview asks again.
  const [pictures, setPictures] = React.useState(0);
  const requestKey = `${pictures}:${current}`;
  const [shown, setShown] = React.useState<{ key: string; html: string } | null>(null);
  const [failed, setFailed] = React.useState<{ key: string; message: string } | null>(null);
  const blocked = problems.length > 0;
  React.useEffect(() => {
    if (blocked) return;
    const ctrl = new AbortController();
    const key = `${pictures}:${current}`;
    const timer = setTimeout(() => {
      previewPresetHtml(scope, kind, audience, JSON.parse(current) as PresetChoice, null, ctrl.signal)
        .then((html) => setShown({ key, html }))
        .catch((err: unknown) => {
          if (!ctrl.signal.aborted) setFailed({ key, message: errorCopy(err) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [blocked, current, pictures, scope, kind, audience]);
  const previewError = failed?.key === requestKey ? failed.message : null;
  const updating = !blocked && !previewError && shown?.key !== requestKey;

  // A certificate's logo and signatures: the event's artwork, stored on upload.
  const withPictures = kind === "certificate" && scope.kind === "event";
  const artwork = useArtwork(scope, kind, audience, withPictures);
  const saveArtwork = useSaveArtwork(scope, kind, audience);
  const [pictureBusy, setPictureBusy] = React.useState<ArtworkField | null>(null);
  const savePicture = async (field: ArtworkField, picked: File | null) => {
    let file: File | null = null;
    if (picked) {
      try {
        file = await fitImage(picked, "image");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "That image is too big to send");
        return;
      }
    }
    setPictureBusy(field);
    try {
      await saveArtwork.mutateAsync({ field, file });
      setPictures((n) => n + 1);
      toast.success(file ? "Picture saved" : "Picture removed", { description: "It is on this event's certificates from now on." });
    } catch (err) {
      toast.error(errorCopy(err));
    } finally {
      setPictureBusy(null);
    }
  };

  const doSave = async () => {
    if (problems.length) {
      toast.warning(`${problems.length} to fix before saving`, { description: problems[0]!.message });
      return;
    }
    try {
      await save.mutateAsync(JSON.parse(current) as PresetChoice);
      setSaved(current);
      dirtyRef.current = false;
      toast.success(`${subject} saved`, { description: `${info.name}. ${config.savedNote}` });
    } catch (err) {
      setFromServer(serverProblems(err));
      toast.error(errorCopy(err));
    }
  };

  const exact = async (ticketId?: string) => {
    if (problems.length) {
      toast.warning("Fix the marked settings first", { description: problems[0]!.message });
      return;
    }
    setPngBusy(ticketId ?? "sample");
    try {
      setPng(await previewPresetPng(scope, kind, audience, JSON.parse(current) as PresetChoice, ticketId ?? null));
    } catch (err) {
      toast.error(errorCopy(err));
    } finally {
      setPngBusy(null);
    }
  };

  const resetCopy =
    scope.kind === "club"
      ? {
          title: `Go back to the built-in ${config.noun}?`,
          body: `Your club's ${config.noun} design is removed, and events without their own use ${defaultName}. ${ALREADY_OUT[kind] ?? ""}`,
          confirm: "Use the built-in design",
          done: "Back to the built-in design",
        }
      : audience === "event_default"
        ? {
            title: "Use your club's design again?",
            body: `This event's own ${config.noun} design is removed and it follows your club's again. ${ALREADY_OUT[kind] ?? ""}`,
            confirm: "Use the club's design",
            done: "Back to your club's design",
          }
        : {
            title: `Reset ${scopeName}?`,
            body: `Their own copy is removed and they get the event's design again. ${ALREADY_OUT[kind] ?? ""}`,
            confirm: "Reset",
            done: `${scopeName} follow the event's design again`,
          };
  const doReset = async () => {
    try {
      await reset.mutateAsync();
      toast.success(resetCopy.done);
      dirtyRef.current = false;
      setDialog(null);
      onReset();
    } catch (err) {
      toast.error(errorCopy(err));
    }
  };

  const saveState: SaveState = save.isPending
    ? "saving"
    : !inUse
      ? changed
        ? "dirty"
        : "starter"
      : needsSave
        ? save.isError
          ? "error"
          : "dirty"
        : owns
          ? "saved"
          : "clean";
  const saveDetail = {
    saving: subject,
    error: `${errorCopy(save.error)} Your changes are still here; try again.`,
    dirty: problems.length ? `${subject} · ${problems.length} to fix before it can be saved` : `${subject} · ${info.name}`,
    starter: `${info.name} is not in use until you save it`,
    saved: `${subject} · ${info.name}. ${config.savedNote}`,
    clean:
      scope.kind === "club"
        ? `${info.name}, the built-in design; save to make it your club's`
        : audience !== "event_default"
          ? "Following the event's design"
          : usesBuiltIn(design)
            ? `${info.name}, the built-in design`
            : "Following your club's design",
  }[saveState];

  const photoHint =
    kind === "badge" && info.hasPhoto && (scope.kind === "club" || !hasPhotoQuestion(design)) ? (
      <Notice
        tone="neutral"
        tag="Photos"
        action={
          scope.kind === "event" ? (
            <Button asChild size="xs" variant="secondary">
              <Link href={`/events/${scope.eventId}/edit#section-questions`}>Sign-up questions</Link>
            </Button>
          ) : null
        }
      >
        {scope.kind === "event"
          ? "The sign-up form asks for no photo, so photos come from each guest's app profile. Anyone without one gets their initials."
          : "Photos come from each guest's app profile, or from a photo question on the event's form. Anyone without one gets their initials."}
      </Notice>
    ) : null;

  return (
    <>
      <DesignBar
        left={
          <>
            <BackToDesigns onClick={onBack} />
            {picker}
          </>
        }
        actions={
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setDialog("preview")}>
              <ScanEyeIcon /> Exact preview
            </Button>
          </div>
        }
      />
      <Provenance
        scope={scope}
        audience={audience}
        scopeName={scopeName}
        config={config}
        design={design}
        inUse={inUse}
        name={info.name}
        defaultName={defaultName}
        onReset={() => setDialog("reset")}
      />

      <div className="grid items-start gap-3.5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <FigurePanel role="region" aria-label="Preview" className="overflow-hidden p-0 lg:sticky lg:top-2">
          <div className="border-line-soft flex flex-wrap items-center gap-2 border-b px-4 py-2.5">
            <span className="text-ink text-[13px] font-medium">{info.name}</span>
            <span className="text-ink-3 text-[12px]">· with the sample guest</span>
            <span className="flex-1" />
            {blocked ? (
              <span className="text-refuse inline-flex items-center gap-1.5 text-[12px] font-medium">
                <AlertTriangleIcon className="size-3.5" aria-hidden="true" /> Fix the marked settings to update it
              </span>
            ) : updating ? (
              <span className="text-ink-3 inline-flex items-center gap-1.5 text-[12px]" role="status">
                <Loader2Icon className="size-3.5 animate-spin" aria-hidden="true" /> Updating
              </span>
            ) : null}
          </div>
          <div className="bg-[repeating-conic-gradient(var(--sunken)_0_25%,var(--surface)_0_50%)] bg-[length:22px_22px] p-6">
            {previewError && !shown ? (
              <p role="alert" className="text-ink-2 m-0 py-16 text-center text-[13px]">
                The preview could not load: {previewError}
              </p>
            ) : (
              <PreviewFrame html={shown?.html ?? null} width={info.page.widthPx} height={info.page.heightPx} title={`${info.name}, live preview`} />
            )}
            {previewError && shown ? (
              <p role="alert" className="text-refuse m-0 mt-3 text-center text-[12px]">
                The preview did not update: {previewError}
              </p>
            ) : null}
          </div>
          <p className="text-ink-3 border-line-soft m-0 border-t px-4 py-2.5 text-[11.5px] leading-[1.5]">
            Drawn by your browser. Exact preview renders the real {config.noun}, for the sample guest or someone registered.
          </p>
        </FigurePanel>

        <div className="flex min-w-0 flex-col gap-3.5">
          <OptionsPanel
            design={info}
            choice={choice}
            onChange={change}
            problems={problemMap}
            fields={fields}
            slots={slots}
            artwork={withPictures ? { urls: artwork.data, busy: pictureBusy, onSave: (f, file) => void savePicture(f, file) } : null}
            clubScope={scope.kind === "club"}
            photoHint={photoHint}
          />
        </div>
      </div>

      <SaveBar
        state={saveState}
        detail={saveDetail}
        onDiscard={() => {
          setChoice(start);
          setFromServer(new Map());
        }}
        onSave={() => void doSave()}
      />

      <PreviewDialog
        open={dialog === "preview"}
        onClose={() => {
          setDialog(null);
          setPng(null);
        }}
        config={config}
        eventId={scope.kind === "event" ? scope.eventId : null}
        image={png}
        busy={pngBusy}
        onPick={exact}
        onBack={() => setPng(null)}
      />
      <ResetDialog
        open={dialog === "reset"}
        onClose={() => setDialog(null)}
        title={resetCopy.title}
        body={resetCopy.body}
        confirm={resetCopy.confirm}
        busy={reset.isPending}
        onConfirm={() => void doReset()}
      />
    </>
  );
};
