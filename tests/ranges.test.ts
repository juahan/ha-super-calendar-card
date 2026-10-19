import { describe, expect, it } from "vitest";
import { mergeRanges, planRanges, rangeCovers, rangeKey } from "../src/ranges";

const r = (startMs: number, endMs: number) => ({ startMs, endMs });

describe("range merging (§12)", () => {
  it("merges overlapping intervals", () => {
    expect(mergeRanges([r(0, 10), r(5, 15)])).toEqual([r(0, 15)]);
  });

  it("merges touching intervals", () => {
    expect(mergeRanges([r(0, 10), r(10, 20)])).toEqual([r(0, 20)]);
  });

  it("keeps disjoint intervals separate", () => {
    expect(mergeRanges([r(0, 10), r(20, 30)])).toEqual([r(0, 10), r(20, 30)]);
  });

  it("sorts and merges in any input order", () => {
    expect(mergeRanges([r(20, 30), r(0, 25), r(40, 50)])).toEqual([r(0, 30), r(40, 50)]);
  });

  it("drops invalid intervals", () => {
    expect(mergeRanges([r(10, 10), r(20, 10), r(0, 5)])).toEqual([r(0, 5)]);
    expect(mergeRanges([])).toEqual([]);
  });

  it("handles containment", () => {
    expect(mergeRanges([r(0, 100), r(20, 30)])).toEqual([r(0, 100)]);
  });
});

describe("range planning (§12)", () => {
  it("plans only active views", () => {
    const calendarOnly = planRanges({ calendar: r(0, 10) });
    expect(calendarOnly).toEqual([r(0, 10)]);
    const upcomingOnly = planRanges({ upcoming: r(100, 200) });
    expect(upcomingOnly).toEqual([r(100, 200)]);
    const weekOnly = planRanges({ selectedWeek: r(50, 60) });
    expect(weekOnly).toEqual([r(50, 60)]);
  });

  it("unions overlapping view ranges", () => {
    const merged = planRanges({ calendar: r(0, 100), upcoming: r(50, 200) });
    expect(merged).toEqual([r(0, 200)]);
  });

  it("keeps disjoint view ranges as separate requests", () => {
    const merged = planRanges({ calendar: r(0, 10), upcoming: r(100, 200) });
    expect(merged).toEqual([r(0, 10), r(100, 200)]);
  });

  it("ignores null ranges and empty values", () => {
    expect(planRanges({ calendar: null, upcoming: undefined, selectedWeek: null })).toEqual([]);
    expect(planRanges({ calendar: r(5, 5) })).toEqual([]);
  });
});

describe("range helpers", () => {
  it("rangeCovers only when fully contained", () => {
    expect(rangeCovers(r(0, 100), r(10, 20))).toBe(true);
    expect(rangeCovers(r(0, 100), r(0, 100))).toBe(true);
    expect(rangeCovers(r(10, 20), r(0, 100))).toBe(false);
    expect(rangeCovers(r(0, 100), r(50, 150))).toBe(false);
  });

  it("builds stable range keys", () => {
    expect(rangeKey(r(1, 2))).toBe("1:2");
  });
});
