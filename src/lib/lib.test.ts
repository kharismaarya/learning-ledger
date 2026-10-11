import { afterEach, describe, expect, it, vi } from "vitest";
import { dayLabel, daysBetween, fmtD, parseD, today } from "./dates";
import { hostOf, plural } from "./text";

describe("dates", () => {
  afterEach(() => vi.useRealTimers());

  it("today() is the local date as YYYY-MM-DD, zero-padded", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 23, 59)); // 5 Jan, late evening local time
    expect(today()).toBe("2026-01-05");
  });

  it("parseD reads a date in local time, not UTC", () => {
    const d = parseD("2026-10-11")!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 11, 0]);
    expect(parseD("")).toBeNull();
    expect(parseD(undefined)).toBeNull();
  });

  it("fmtD formats en-GB and is empty for no date", () => {
    expect(fmtD("2026-10-11")).toBe("11 Oct");
    expect(fmtD("2027-01-01", { day: "numeric", month: "short", year: "2-digit" })).toBe("1 Jan 27");
    expect(fmtD("")).toBe("");
  });

  it("daysBetween counts calendar days, including across a DST change", () => {
    expect(daysBetween(parseD("2026-10-10")!, parseD("2026-10-11")!)).toBe(1);
    expect(daysBetween(parseD("2026-03-01")!, parseD("2026-04-01")!)).toBe(31);
    expect(daysBetween(parseD("2026-10-11")!, parseD("2026-10-10")!)).toBe(-1);
  });

  it("dayLabel shows weekday in the timeline and month in grouped views", () => {
    expect(dayLabel("2026-10-09", false)).toBe("09 Fri");
    expect(dayLabel("2026-10-09", true)).toBe("09 Oct");
    expect(dayLabel(undefined, true)).toBe("");
  });
});

describe("text", () => {
  it("plural", () => {
    expect(plural(1, "entry", "entries")).toBe("1 entry");
    expect(plural(0, "entry", "entries")).toBe("0 entries");
    expect(plural(2, "topic")).toBe("2 topics");
  });

  it("hostOf strips www and falls back to the raw text for non-URLs", () => {
    expect(hostOf("https://www.youtube.com/watch?v=1")).toBe("youtube.com");
    expect(hostOf("https://claude.ai/chat/x")).toBe("claude.ai");
    expect(hostOf("not a url")).toBe("not a url");
    expect(hostOf("")).toBe("");
  });
});
