import { describe, expect, it } from "vitest";
import type { BreakdownRow, CampaignRow, DashboardData, KeywordRow } from "./data";
import { parseFilters } from "./filters";
import type { PerfRow } from "./metrics";
import { adsetTable, adTable, audienceData, keywordTable, platformTable, regionData } from "./report";

function row(p: Partial<PerfRow>): PerfRow {
  return { date: "2026-10-01", platform: "meta", campaign_id: "m1", adset_id: "s1", spend: 0, impressions: 0, link_clicks: 0, video_views: 0, mess: 0, ...p };
}

const CAMPAIGNS: CampaignRow[] = [
  { platform: "meta", campaign_id: "m1", campaign_name: "Meta lead", objective_native: null, objective_group: "Lead", status: "ACTIVE" },
  { platform: "meta", campaign_id: "m2", campaign_name: "Meta awareness", objective_native: null, objective_group: "Awareness", status: "ACTIVE" },
  { platform: "google", campaign_id: "g1", campaign_name: "Search", objective_native: "SEARCH", objective_group: "Traffic", status: "ENABLED" },
];

function dashboard(rows: PerfRow[]): DashboardData {
  return {
    filters: parseFilters({ cmp: "0" }, "2026-10-22"),
    today: "2026-10-22",
    campaigns: CAMPAIGNS,
    scoped: new Map(CAMPAIGNS.map((c) => [`${c.platform}:${c.campaign_id}`, c])),
    platforms: ["meta", "google"],
    rows,
    prevRows: [],
    targets: [],
    reach: [],
    standard: true,
  };
}

const ROWS = [
  row({ campaign_id: "m1", adset_id: "s1", ad_id: "a1", ad_name: "Ad 1", spend: 600, impressions: 6000, link_clicks: 60, mess: 6 }),
  row({ campaign_id: "m1", adset_id: "s1", ad_id: "a2", ad_name: "Ad 2", spend: 400, impressions: 4000, link_clicks: 40, mess: 4 }),
  row({ campaign_id: "m2", adset_id: "s2", ad_id: "a3", ad_name: "Ad 3", spend: 1000, impressions: 50000, link_clicks: 50 }),
  row({ platform: "google", campaign_id: "g1", adset_id: "ag1", ad_id: "", spend: 3000, impressions: 1000, link_clicks: 100 }),
];

describe("Tổng quan = Meta + Google", () => {
  it("dòng Tổng khớp tổng các nền tảng, % spend cộng lại = 100%", () => {
    const t = platformTable(dashboard(ROWS));
    const sum = (k: string) => t.rows.reduce((s, r) => s + Number(r[k]), 0);
    expect(sum("spend")).toBe(t.totals.spend);
    expect(sum("impressions")).toBe(t.totals.impressions);
    expect(sum("link_clicks")).toBe(t.totals.link_clicks);
    expect(sum("spend_share")).toBeCloseTo(1);
    // Mess chỉ ở Meta; dòng Google để trống
    expect(t.rows.find((r) => r.name === "Google")?.mess).toBeNull();
  });
});

describe("Campaign → Ad set → Ad", () => {
  it("tổng các ad = tổng ad set (Meta)", () => {
    const d = dashboard(ROWS);
    const ads = adTable(d);
    const adsets = adsetTable(d).filter((r) => r.platform === "Meta");
    expect(ads).toHaveLength(3);
    const sum = (rows: typeof ads, k: string) => rows.reduce((s, r) => s + Number(r[k]), 0);
    expect(sum(ads, "spend")).toBe(sum(adsets, "spend"));
    expect(sum(ads, "mess")).toBe(sum(adsets, "mess"));
  });
  it("bảng ad không chứa dòng Google (Google ở cấp ad group)", () => {
    expect(adTable(dashboard(ROWS)).every((r) => r.campaign !== "Search")).toBe(true);
  });
});

describe("Breakdown đối tượng / khu vực", () => {
  const B: BreakdownRow[] = [
    { campaign_id: "m1", value1: "25-34", value2: "female", spend: 700, impressions: 7000, link_clicks: 70, mess: 7 },
    { campaign_id: "m1", value1: "25-34", value2: "male", spend: 300, impressions: 3000, link_clicks: 30, mess: 3 },
    { campaign_id: "m2", value1: "25-34", value2: "female", spend: 1000, impressions: 50000, link_clicks: 50, mess: 0 },
  ];

  it("cost per mess theo segment chỉ tính spend của campaign có mess", () => {
    const a = audienceData(B);
    const female = a.table.find((r) => r.gender === "Nữ")!;
    // Spend nữ 25-34 = 1.700 nhưng chỉ 700 của campaign có mess (m1) → 700 / 7
    expect(female.spend).toBe(1700);
    expect(female.cost_per_mess).toBe(100);
  });

  it("CTR theo segment tính từ tổng, % spend cộng lại = 100%", () => {
    const a = audienceData(B);
    expect(a.table.find((r) => r.gender === "Nữ")!.ctr).toBeCloseTo(120 / 57000);
    expect(a.table.reduce((s, r) => s + Number(r.spend_share), 0)).toBeCloseTo(1);
  });

  it("dữ liệu biểu đồ: 1 cột / nhóm tuổi, chồng theo giới tính", () => {
    const a = audienceData(B);
    expect(a.chart).toEqual([
      { label: "25-34", female_spend: 1700, female_impressions: 57000, female_link_clicks: 120, female_mess: 7, male_spend: 300, male_impressions: 3000, male_link_clicks: 30, male_mess: 3 },
    ]);
  });

  it("khu vực sắp theo spend giảm dần", () => {
    const r = regionData([
      { campaign_id: "m1", value1: "Hanoi", value2: "", spend: 100, impressions: 1, link_clicks: 0, mess: 0 },
      { campaign_id: "m1", value1: "Ho Chi Minh City", value2: "", spend: 300, impressions: 1, link_clicks: 0, mess: 0 },
    ]);
    expect(r.table.map((x) => x.name)).toEqual(["Ho Chi Minh City", "Hanoi"]);
  });
});

describe("Từ khóa Google", () => {
  const K: KeywordRow[] = [
    { campaign_id: "g1", ad_group_id: "ag1", keyword_id: "k1", keyword_text: "đầm công sở", match_type: "PHRASE", status: "ENABLED", spend: 2000, impressions: 800, clicks: 80, conversions: 4, quality_score: 7 },
    { campaign_id: "g1", ad_group_id: "ag1", keyword_id: "k2", keyword_text: "đầm dự tiệc", match_type: "BROAD", status: "ENABLED", spend: 1000, impressions: 200, clicks: 20, conversions: 0, quality_score: 4 },
  ];

  it("tính tỉ lệ từ tổng và gắn cờ từ khóa tiêu tiền 0 chuyển đổi", () => {
    const t = keywordTable(K, dashboard(ROWS));
    const waste = t.rows.find((r) => r.name === "đầm dự tiệc")!;
    expect(waste.flag).toBe("Tiêu tiền, 0 chuyển đổi");
    expect(waste.cost_per_conv).toBeNull();
    expect(waste.match).toBe("Mở rộng");
    expect(t.wasted).toEqual({ count: 1, spend: 1000 });
    expect(t.totals.cpc).toBe(30); // 3.000 / 100
    expect(t.totals.cost_per_conv).toBe(750); // 3.000 / 4
  });
});
