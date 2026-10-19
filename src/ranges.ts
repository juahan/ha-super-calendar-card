/**
 * Range planning (§12): determine required fetch ranges from the active views,
 * merging overlapping intervals. Disjoint ranges stay separate.
 */
import type { TimeRange } from "./types";

/** Merge overlapping or touching intervals; output sorted by start. */
export function mergeRanges(ranges: TimeRange[]): TimeRange[] {
  const sorted = ranges
    .filter((r) => Number.isFinite(r.startMs) && Number.isFinite(r.endMs) && r.endMs > r.startMs)
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged: TimeRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, range.endMs);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

export interface RangeNeeds {
  /** Complete displayed weeks (calendar view). */
  calendar?: TimeRange | null;
  /** Now through the configured horizon (upcoming view). */
  upcoming?: TimeRange | null;
  /** The selected week (week-filtered list). */
  selectedWeek?: TimeRange | null;
}

/**
 * Fetch ranges for the active views only (§12): hidden views are not
 * retrieved unnecessarily.
 */
export function planRanges(needs: RangeNeeds): TimeRange[] {
  const wanted: TimeRange[] = [];
  for (const range of [needs.calendar, needs.upcoming, needs.selectedWeek]) {
    if (range && range.endMs > range.startMs) {
      wanted.push(range);
    }
  }
  return mergeRanges(wanted);
}

/** Whether `covered` fully contains `range`. */
export function rangeCovers(covered: TimeRange, range: TimeRange): boolean {
  return covered.startMs <= range.startMs && covered.endMs >= range.endMs;
}

export function rangeKey(range: TimeRange): string {
  return `${range.startMs}:${range.endMs}`;
}
