"use client";

import * as React from "react";
import { ArrowDownNarrowWideIcon, ArrowUpNarrowWideIcon, XIcon } from "lucide-react";
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from "@moa/ui";
import { pressable } from "@moa/ui/motion";

import type { useListParams } from "../hooks/use-list-params";

/**
 * Filter and sort controls for a list page.
 *
 * Every admin table shipped with a search box and nothing else -- no way to
 * narrow by type or status, and a fixed order you could not change. These
 * read and write the URL through useListParams, so a filtered view is
 * bookmarkable and the back button steps through changes.
 */
export interface FilterSpec {
  /** Query-string key, which is also the API's parameter name. */
  key: string;
  label: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Shown when nothing is selected. Selecting it removes the key. */
  allLabel?: string;
}

export interface SortSpec {
  key?: string;
  orderKey?: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  defaultValue: string;
  /** Most lists are newest-first by default. */
  defaultOrder?: "asc" | "desc";
}

const ALL = "__all__";

export function ListFilters({
  params,
  filters = [],
  sort,
  className,
}: {
  params: ReturnType<typeof useListParams>;
  filters?: ReadonlyArray<FilterSpec>;
  sort?: SortSpec;
  className?: string;
}) {
  const sortKey = sort?.key ?? "sort";
  const orderKey = sort?.orderKey ?? "order";

  const filterKeys = filters.map((f) => f.key);
  const activeFilters = params.activeCount(filterKeys);
  const sortValue = params.param(sortKey) ?? sort?.defaultValue;
  const order = params.param(orderKey) ?? sort?.defaultOrder ?? "desc";

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {filters.map((filter) => {
        const value = params.param(filter.key);
        return (
          <Select
            key={filter.key}
            value={value ?? ALL}
            onValueChange={(next) =>
              params.setParam(filter.key, next === ALL ? undefined : next)
            }
          >
            <SelectTrigger
              size="sm"
              aria-label={filter.label}
              className={cn("w-auto min-w-[8rem]", value && "border-primary/50")}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>
                {filter.allLabel ?? `All ${filter.label.toLowerCase()}`}
              </SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      })}

      {sort ? (
        <div className="flex items-center gap-1">
          <Select
            value={sortValue}
            onValueChange={(next) =>
              params.setParam(sortKey, next === sort.defaultValue ? undefined : next)
            }
          >
            <SelectTrigger size="sm" aria-label="Sort by" className="w-auto min-w-[9rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sort.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  Sort: {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            size="icon-sm"
            variant="outline"
            className={pressable}
            aria-label={
              order === "asc" ? "Sorted ascending — switch to descending" : "Sorted descending — switch to ascending"
            }
            onClick={() => {
              const next = order === "asc" ? "desc" : "asc";
              // Only the non-default direction needs to be in the URL.
              params.setParam(
                orderKey,
                next === (sort.defaultOrder ?? "desc") ? undefined : next
              );
            }}
          >
            {order === "asc" ? (
              <ArrowUpNarrowWideIcon />
            ) : (
              <ArrowDownNarrowWideIcon />
            )}
          </Button>
        </div>
      ) : null}

      {activeFilters > 0 ? (
        <Button
          size="sm"
          variant="ghost"
          className={pressable}
          onClick={() => params.clearParams(filterKeys)}
        >
          <XIcon /> Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}
        </Button>
      ) : null}
    </div>
  );
}
