import { describe, expect, it } from "vitest";
import { filtersToQuery, parseFilters, previousPeriod, resolveRange } from "./filters";
import { resolveReach, sumReach, type ReachRow } from "./reach";

const TODAY = "2026-10-22";

describe("resolveRange", () => {
  it("7 / 30 ngày kết thúc hôm qua", () => {
    expect(resolveRange("7d", TODAY)).toEqual({ from: "2026-10-15", to: "2026-10-21" });
    expect(resolveRange("30d", TODAY)).toEqual({ from: "2026-09-22", to: "2026-10-21" });
  });
  it("tháng này / tháng trước", () => {
    expect(resolveRange("this_month", TODAY)).toEqual({ from: "2026-10-01", to: "2026-10-21" });
    expect(resolveRange("this_month", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-01" });
    expect(resolveRange("last_month", TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(resolveRange("last_month", "2026-03-15")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
  });
  it("tùy chọn: đảo nếu ngược, chặn ngày tương lai, bỏ ngày sai", () => {
    expect(resolveRange("custom", TODAY, "2026-10-10", "2026-10-01")).toEqual({ from: "2026-10-01", to: "2026-10-10" });
    expect(resolveRange("custom", TODAY, "2026-10-10", "2026-12-01")).toEqual({ from: "2026-10-10", to: TODAY });
    expect(resolveRange("custom", TODAY, "2026-02-30", "2026-03-01")).toBeNull();
  });
});

describe("previousPeriod", () => {
  it("cùng độ dài, liền trước", () => {
    expect(previousPeriod("2026-10-15", "2026-10-21")).toEqual({ from: "2026-10-08", to: "2026-10-14" });
    expect(previousPeriod("2026-09-01", "2026-09-30")).toEqual({ from: "2026-08-02", to: "2026-08-31" });
  });
});

describe("parseFilters / filtersToQuery", () => {
  it("mặc định", () => {
    const f = parseFilters({}, TODAY);
    expect(f.range).toBe("30d");
    expect(f.compare).toBe(true);
    expect(f.platforms).toEqual([]);
    expect(f.gran).toBe("day");
  });
  it("đọc đủ tham số và bỏ giá trị lạ", () => {
    const f = parseFilters(
      { range: "custom", from: "2026-08-01", to: "2026-10-21", cmp: "0", platform: "meta,tiktok", group: "Lead", campaign: "meta:1,bad", gran: "week" },
      TODAY,
    );
    expect(f).toMatchObject({ range: "custom", from: "2026-08-01", to: "2026-10-21", compare: false, platforms: ["meta"], groups: ["Lead"], campaigns: ["meta:1"], gran: "week" });
  });
  it("chọn đủ mọi nền tảng = không lọc", () => {
    expect(parseFilters({ platform: "meta,google" }, TODAY).platforms).toEqual([]);
  });
  it("custom thiếu ngày → về mặc định", () => {
    expect(parseFilters({ range: "custom" }, TODAY).range).toBe("30d");
  });
  it("round-trip qua URL", () => {
    const f = parseFilters({ range: "7d", platform: "google", gran: "day", cmp: "0" }, TODAY);
    const q = Object.fromEntries(new URLSearchParams(filtersToQuery(f)));
    expect(parseFilters(q, TODAY)).toEqual(f);
  });
});

describe("resolveReach: cộng reach các campaign", () => {
  const P = { period_type: "last_7d", date_from: "2026-10-15", date_to: "2026-10-21" };
  const rows: ReachRow[] = [
    { ...P, platform: "meta", campaign_id: null, reach: 900, frequency: 2 }, // dòng toàn tài khoản: không dùng
    { ...P, platform: "meta", campaign_id: "c1", reach: 400, frequency: 1.5 },
    { ...P, platform: "meta", campaign_id: "c2", reach: 600, frequency: 3 },
    { ...P, platform: "google", campaign_id: "g1", reach: 500, frequency: 2 },
  ];
  const base = {
    isStandard: true,
    from: "2026-10-15",
    to: "2026-10-21",
    rows,
    platforms: ["meta", "google"] as const,
    activeCampaigns: new Set(["meta:c1", "meta:c2", "google:g1"]),
  };

  it("kỳ tùy chọn → custom", () => {
    expect(resolveReach({ ...base, isStandard: false }).kind).toBe("custom");
  });

  it("cộng reach trong từng nền tảng, frequency theo trọng số reach", () => {
    const r = resolveReach(base);
    expect(r).toEqual({
      kind: "sum",
      items: [
        // (400×1,5 + 600×3) / 1000 = 2,4
        { platform: "meta", reach: 1000, frequency: 2.4, campaigns: 2, missing: 0 },
        { platform: "google", reach: 500, frequency: 2, campaigns: 1, missing: 0 },
      ],
    });
  });

  it("chỉ cộng campaign trong phạm vi lọc", () => {
    const r = resolveReach({ ...base, platforms: ["meta"], activeCampaigns: new Set(["meta:c1"]) });
    expect(r).toEqual({ kind: "sum", items: [{ platform: "meta", reach: 400, frequency: 1.5, campaigns: 1, missing: 0 }] });
  });

  it("báo campaign thiếu dòng reach", () => {
    const r = resolveReach({ ...base, platforms: ["meta"], activeCampaigns: new Set(["meta:c1", "meta:c9"]) });
    expect(r.kind === "sum" && r.items[0].missing).toBe(1);
  });

  it("kỳ chuẩn nhưng chưa có data", () => {
    expect(resolveReach({ ...base, from: "2026-10-16", to: "2026-10-22" }).kind).toBe("missing");
  });

  it("sumReach", () => {
    expect(sumReach([])).toEqual({ reach: 0, frequency: null });
  });
});
