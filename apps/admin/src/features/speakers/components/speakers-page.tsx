"use client";

import * as React from "react";
import Link from "next/link";
import { GitMergeIcon } from "lucide-react";
import { PersonAvatar, formatDate, formatNumber } from "@moa/app-kit";
import { Button, DataTable, Input, NativeSelect, Pager, SearchField, StatusBadge, type DataTableColumn } from "@moa/ui";
import { useDebouncedValue } from "@moa/ui/hooks";

import { ClubPicker, type PickedClub } from "@/components/club-picker";
import { ExcelExportButton } from "@/components/excel-export-button";
import { useTopicTree } from "@/features/interests";

import { speakersExportUrl } from "../api";
import { useDuplicates, useSpeakers } from "../queries";
import { SORTS, STATUS_LABEL, STATUS_TONE, type SpeakerRow } from "../schemas";

const PAGE = 50;
const thisYear = new Date().getFullYear();
const YEARS = Array.from({ length: thisYear - 2022 }, (_, i) => thisYear - i);

/**
 * Speakers: everyone who has spoken at a MyOtherApp event, one profile per
 * person, with their talks and clubs. Search, filters by topic, city, club,
 * year, status and claimed, and the list as a workbook.
 */
export function SpeakersPage() {
  const topics = useTopicTree();
  const dupes = useDuplicates("open");
  const [q, setQ] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [topic, setTopic] = React.useState("");
  const [city, setCity] = React.useState("");
  const [club, setClub] = React.useState<PickedClub | null>(null);
  const [year, setYear] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [claimed, setClaimed] = React.useState("");
  const [sort, setSort] = React.useState("last_talk");
  const [page, setPage] = React.useState(1);
  const cityQuery = useDebouncedValue(city.trim(), 300);
  const filters = {
    q: search || undefined,
    topic: topic || undefined,
    city: cityQuery || undefined,
    clubId: club?.id,
    year: year ? Number(year) : undefined,
    status: status || undefined,
    claimed: claimed === "" ? undefined : claimed === "yes",
    sort,
  };
  const { data, isPending, isFetching } = useSpeakers({ ...filters, page, pageSize: PAGE });
  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };
  const waiting = dupes.data?.length ?? 0;

  const columns: DataTableColumn<SpeakerRow>[] = [
    {
      key: "who",
      header: "Speaker",
      cell: (s) => (
        <Link href={`/speakers/${s.id}`} className="flex min-w-0 items-center gap-2.5">
          <PersonAvatar name={s.name} photo={s.photo?.thumbnail ?? s.photo?.medium ?? null} className="size-8" />
          <span className="min-w-0">
            <span className="block truncate font-medium hover:underline">{s.name}</span>
            {s.headline ? <span className="text-ink-3 block truncate text-xs">{s.headline}</span> : null}
          </span>
        </Link>
      ),
    },
    { key: "city", header: "City", className: "hidden md:table-cell", headerClassName: "hidden md:table-cell", cell: (s) => s.city ?? "—" },
    {
      key: "topics",
      header: "Topics",
      className: "hidden xl:table-cell",
      headerClassName: "hidden xl:table-cell",
      cell: (s) => <span className="text-xs">{s.topics.map((t) => t.name).join(", ") || "—"}</span>,
    },
    { key: "talks", header: "Talks", className: "text-right", headerClassName: "text-right", cell: (s) => <span className="tabular-nums">{formatNumber(s.talks_count)}</span> },
    {
      key: "clubs",
      header: "Clubs",
      className: "hidden lg:table-cell",
      headerClassName: "hidden lg:table-cell",
      cell: (s) => <span className="text-xs">{s.clubs.map((c) => c.name).join(", ") || "—"}</span>,
    },
    { key: "last", header: "Last talk", cell: (s) => <span className="text-xs">{s.last_talk_at ? formatDate(s.last_talk_at) : "—"}</span> },
    {
      key: "status",
      header: "Status",
      cell: (s) => (
        <span className="flex flex-wrap gap-1">
          <StatusBadge tone={STATUS_TONE[s.status] ?? "default"} label={STATUS_LABEL[s.status] ?? s.status} />
          {s.claimed ? <StatusBadge tone="info" label="Claimed" /> : null}
        </span>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField label="Search speakers" placeholder="Name or headline…" value={q} onChange={setQ} onCommit={(v) => reset(setSearch)(v.trim())} className="w-[260px]" />
        <div className="flex-1" />
        <Button size="sm" variant="outline" asChild>
          <Link href="/speakers/duplicates">
            <GitMergeIcon /> Merge queue{waiting ? ` · ${formatNumber(waiting)}` : ""}
          </Link>
        </Button>
        <ExcelExportButton href={speakersExportUrl(filters)} stem="speakers" disabled={!data || data.total === 0} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <NativeSelect aria-label="Topic" size="sm" className="w-auto" value={topic} onChange={(e) => reset(setTopic)(e.target.value)}>
          <option value="">Every topic</option>
          {(topics.data ?? []).map((t) => (
            <option key={t.id} value={t.slug ?? String(t.id)}>
              {t.name}
            </option>
          ))}
        </NativeSelect>
        <Input aria-label="City" placeholder="City" className="input-sm h-8 w-[140px]" value={city} onChange={(e) => reset(setCity)(e.target.value)} />
        <NativeSelect aria-label="Year" size="sm" className="w-auto" value={year} onChange={(e) => reset(setYear)(e.target.value)}>
          <option value="">Any year</option>
          {YEARS.map((y) => (
            <option key={y} value={y}>
              Spoke in {y}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="Status" size="sm" className="w-auto" value={status} onChange={(e) => reset(setStatus)(e.target.value)}>
          <option value="">Active and hidden</option>
          <option value="active">Active</option>
          <option value="hidden">Hidden</option>
          <option value="merged">Merged</option>
        </NativeSelect>
        <NativeSelect aria-label="Claimed" size="sm" className="w-auto" value={claimed} onChange={(e) => reset(setClaimed)(e.target.value)}>
          <option value="">Claimed or not</option>
          <option value="yes">Claimed by the speaker</option>
          <option value="no">Not claimed</option>
        </NativeSelect>
        <NativeSelect aria-label="Sort" size="sm" className="w-auto" value={sort} onChange={(e) => reset(setSort)(e.target.value)}>
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </NativeSelect>
        <div className="w-[240px]">
          <ClubPicker value={club} onChange={reset(setClub)} label="Club" />
        </div>
      </div>
      <DataTable columns={columns} data={data?.items} rowKey={(s) => s.id} isLoading={isPending} emptyMessage="No speakers match." />
      {data && data.total > 0 ? <Pager page={page} pageCount={Math.max(1, Math.ceil(data.total / PAGE))} total={data.total} pageSize={PAGE} noun={["speaker", "speakers"]} busy={isFetching} onPage={setPage} /> : null}
    </div>
  );
}
