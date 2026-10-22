/**
 * Dựng dữ liệu hiển thị (bảng, biểu đồ) từ DashboardData. Mọi phép tính đi qua lib/metrics.
 */
import type { BreakdownRow, DashboardData, KeywordRow } from "./data";
import { campaignKey } from "./filters";
import { formatBucket } from "./format";
import {
  computeMetrics,
  derive,
  groupTotals,
  pctChange,
  PLATFORM_LABEL,
  PLATFORMS,
  safeDiv,
  timeSeries,
  OBJECTIVE_GROUPS,
  type Metrics,
  type MetricKey,
  type PerfRow,
} from "./metrics";
import { campaignReachMap, sumReach } from "./reach";

export interface PeriodMetrics {
  cur: Metrics;
  prev: Metrics | null;
  change: (key: MetricKey) => number | null;
}

export function periodMetrics(d: Pick<DashboardData, "rows" | "prevRows" | "filters">): PeriodMetrics {
  const cur = computeMetrics(d.rows);
  const prev = d.filters.compare ? computeMetrics(d.prevRows) : null;
  return { cur, prev, change: (k) => (prev ? pctChange(cur[k], prev[k]) : null) };
}

/** Dữ liệu biểu đồ theo thời gian, có nhãn theo độ chi tiết */
export function chartSeries(d: Pick<DashboardData, "filters">, rows: readonly PerfRow[]) {
  return timeSeries(rows, d.filters.from, d.filters.to, d.filters.gran).map((p) => ({
    ...p,
    label: formatBucket(p.bucket, d.filters.gran),
  }));
}

export type TableRow = Record<string, string | number | null>;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Đang chạy",
  ENABLED: "Đang chạy",
  PAUSED: "Tạm dừng",
  ARCHIVED: "Lưu trữ",
  REMOVED: "Đã xóa",
  DELETED: "Đã xóa",
};

export function statusLabel(s: string | null): string | null {
  return s ? (STATUS_LABEL[s.toUpperCase()] ?? s) : null;
}

/** Các cột metric chung cho bảng campaign / ad set. `platform` = dòng của 1 nền tảng → ẩn video views nền tảng kia. */
function metricCells(m: Metrics, prev: Metrics | undefined, compare: boolean, platform?: string): TableRow {
  return {
    spend: m.spend,
    spend_change: compare ? pctChange(m.spend, prev?.spend ?? null) : null,
    impressions: m.impressions,
    impressions_change: compare ? pctChange(m.impressions, prev?.impressions ?? null) : null,
    link_clicks: m.link_clicks,
    link_clicks_change: compare ? pctChange(m.link_clicks, prev?.link_clicks ?? null) : null,
    ctr: m.ctr,
    ctr_change: compare ? pctChange(m.ctr, prev?.ctr ?? null) : null,
    cpc: m.cpc,
    cpc_change: compare ? pctChange(m.cpc, prev?.cpc ?? null) : null,
    cpm: m.cpm,
    cpm_change: compare ? pctChange(m.cpm, prev?.cpm ?? null) : null,
    video_views_meta: platform === "google" ? null : m.video_views_meta,
    video_views_google: platform === "meta" ? null : m.video_views_google,
    // Google không có mess → để trống thay vì 0
    mess: platform === "google" ? null : m.mess,
    mess_change: compare && platform !== "google" ? pctChange(m.mess, prev?.mess ?? null) : null,
    cost_per_mess: m.cost_per_mess,
    cost_per_mess_change: compare ? pctChange(m.cost_per_mess, prev?.cost_per_mess ?? null) : null,
  };
}

/** Bảng theo campaign (gồm cả campaign trong phạm vi nhưng không có data trong kỳ) */
export function campaignTable(d: DashboardData, opts: { includeEmpty?: boolean } = {}): { rows: TableRow[]; totals: TableRow[] } {
  const keyOf = (r: PerfRow) => campaignKey(r.platform, r.campaign_id);
  const cur = groupTotals(d.rows, keyOf);
  const prev = groupTotals(d.prevRows, keyOf);
  const reach = d.standard ? campaignReachMap(d.reach, d.filters.from, d.filters.to) : new Map();
  const compare = d.filters.compare;

  const rows: TableRow[] = [];
  for (const [key, c] of d.scoped) {
    const t = cur.get(key);
    if (!t && !opts.includeEmpty) continue;
    const m = derive(t ?? computeMetrics([]));
    const p = prev.get(key);
    const r = reach.get(key);
    rows.push({
      name: c.campaign_name,
      platform: PLATFORM_LABEL[c.platform],
      group: c.objective_group,
      objective_native: c.objective_native,
      status: statusLabel(c.status),
      campaign_id: c.campaign_id,
      reach: r?.reach ?? null,
      frequency: r?.frequency ?? null,
      ...metricCells(m, p ? derive(p) : undefined, compare, c.platform),
    });
  }
  // Reach = cộng reach các campaign (không khử trùng), frequency tính lại theo trọng số reach.
  // Reach tách theo nền tảng → dòng Tổng riêng cho từng nền tảng; dòng Tổng chung để trống reach.
  const reachOf = (list: TableRow[]) => {
    const withReach = list.filter((r) => r.reach !== null).map((r) => ({ reach: Number(r.reach), frequency: Number(r.frequency) }));
    return withReach.length ? sumReach(withReach) : null;
  };
  const platformsInTable = PLATFORMS.filter((p) => rows.some((r) => r.platform === PLATFORM_LABEL[p]));
  const subtotals: TableRow[] = platformsInTable.map((p) => {
    const s = reachOf(rows.filter((r) => r.platform === PLATFORM_LABEL[p]));
    return {
      name: `Tổng ${PLATFORM_LABEL[p]}`,
      platform: PLATFORM_LABEL[p],
      group: "",
      reach: s?.reach ?? null,
      frequency: s?.frequency ?? null,
      ...metricCells(
        computeMetrics(d.rows.filter((r) => r.platform === p)),
        compare ? computeMetrics(d.prevRows.filter((r) => r.platform === p)) : undefined,
        compare,
        p,
      ),
    };
  });
  if (subtotals.length === 1) return { rows, totals: [{ ...subtotals[0], name: "Tổng" }] };

  const grand: TableRow = {
    name: "Tổng",
    platform: "",
    group: "",
    reach: null,
    frequency: null,
    ...metricCells(computeMetrics(d.rows), compare ? computeMetrics(d.prevRows) : undefined, compare),
  };
  return { rows, totals: [...subtotals, grand] };
}

/** Bảng theo ad set */
export function adsetTable(d: DashboardData): TableRow[] {
  const keyOf = (r: PerfRow) => `${r.platform}:${r.adset_id}`;
  const cur = groupTotals(d.rows, keyOf);
  const prev = groupTotals(d.prevRows, keyOf);
  const names = new Map<string, { adset: string; campaign: string; platform: string; raw: string }>();
  for (const r of d.rows) {
    const k = keyOf(r);
    if (!names.has(k)) {
      const c = d.scoped.get(campaignKey(r.platform, r.campaign_id));
      names.set(k, { adset: r.adset_name ?? r.adset_id, campaign: c?.campaign_name ?? r.campaign_id, platform: PLATFORM_LABEL[r.platform], raw: r.platform });
    }
  }
  return [...cur].map(([k, t]) => {
    const p = prev.get(k);
    const n = names.get(k)!;
    return {
      name: n.adset,
      campaign: n.campaign,
      platform: n.platform,
      ...metricCells(derive(t), p ? derive(p) : undefined, d.filters.compare, n.raw),
    };
  });
}

/** Bảng theo ad (mẫu quảng cáo) — chỉ các dòng có ad_id (Meta) */
export function adTable(d: DashboardData): TableRow[] {
  const keyOf = (r: PerfRow) => `${r.platform}:${r.ad_id ?? ""}`;
  const withAd = (rows: readonly PerfRow[]) => rows.filter((r) => r.ad_id);
  const cur = groupTotals(withAd(d.rows), keyOf);
  const prev = groupTotals(withAd(d.prevRows), keyOf);
  const names = new Map<string, { ad: string; adset: string; campaign: string; raw: string }>();
  for (const r of withAd(d.rows)) {
    const k = keyOf(r);
    if (!names.has(k)) {
      const c = d.scoped.get(campaignKey(r.platform, r.campaign_id));
      names.set(k, { ad: r.ad_name ?? r.ad_id!, adset: r.adset_name ?? r.adset_id, campaign: c?.campaign_name ?? r.campaign_id, raw: r.platform });
    }
  }
  return [...cur].map(([k, t]) => {
    const p = prev.get(k);
    const n = names.get(k)!;
    return {
      name: n.ad,
      adset: n.adset,
      campaign: n.campaign,
      ...metricCells(derive(t), p ? derive(p) : undefined, d.filters.compare, n.raw),
    };
  });
}

/** Bảng theo nhóm mục tiêu (trong phạm vi trang) */
export function groupTable(d: DashboardData, platform?: string): TableRow[] {
  const groupOf = (r: PerfRow) => d.scoped.get(campaignKey(r.platform, r.campaign_id))?.objective_group ?? "Chưa phân loại";
  const cur = groupTotals(d.rows, groupOf);
  const prev = groupTotals(d.prevRows, groupOf);
  return OBJECTIVE_GROUPS.filter((g) => cur.has(g)).map((g) => {
    const p = prev.get(g);
    return { name: g, ...metricCells(derive(cur.get(g)!), p ? derive(p) : undefined, d.filters.compare, platform) };
  });
}

/** Bảng đối chiếu Meta / Google / Tổng cho trang Tổng quan */
export function platformTable(d: DashboardData): { rows: TableRow[]; totals: TableRow } {
  const all = computeMetrics(d.rows);
  const cur = groupTotals(d.rows, (r) => r.platform);
  const prev = groupTotals(d.prevRows, (r) => r.platform);
  const rows = PLATFORMS.filter((p) => cur.has(p)).map((p) => {
    const m = derive(cur.get(p)!);
    const pv = prev.get(p);
    return {
      name: PLATFORM_LABEL[p],
      spend_share: safeDiv(m.spend, all.spend),
      ...metricCells(m, pv ? derive(pv) : undefined, d.filters.compare, p),
    };
  });
  return {
    rows,
    totals: {
      name: "Tổng",
      spend_share: all.spend ? 1 : null,
      ...metricCells(all, d.filters.compare ? computeMetrics(d.prevRows) : undefined, d.filters.compare),
    },
  };
}

// ---------------------------------------------------------------------------
// Breakdown đối tượng / khu vực (Meta)
// ---------------------------------------------------------------------------

const GENDER_LABEL: Record<string, string> = { female: "Nữ", male: "Nam", unknown: "Không rõ" };
export const genderLabel = (g: string) => GENDER_LABEL[g] ?? g;

/** Đổi breakdown sang dạng PerfRow để dùng chung công thức; khóa nhóm nằm trong adset_id */
function breakdownAsRows(rows: readonly BreakdownRow[], keyOf: (r: BreakdownRow) => string = () => ""): PerfRow[] {
  return rows.map((r) => ({
    date: "",
    platform: "meta",
    campaign_id: r.campaign_id,
    adset_id: keyOf(r),
    spend: r.spend,
    impressions: r.impressions,
    link_clicks: r.link_clicks,
    video_views: 0,
    mess: r.mess,
  }));
}

/** Gộp breakdown theo khóa; tỉ lệ tính từ tổng, cost per mess theo quy tắc campaign có mess */
export function breakdownMetrics(rows: readonly BreakdownRow[], keyOf: (r: BreakdownRow) => string): Map<string, Metrics> {
  const grouped = groupTotals(breakdownAsRows(rows, keyOf), (r) => r.adset_id);
  return new Map([...grouped].map(([k, t]) => [k, derive(t)]));
}

function breakdownCells(m: Metrics, total: Metrics): TableRow {
  return {
    spend: m.spend,
    spend_share: safeDiv(m.spend, total.spend),
    impressions: m.impressions,
    link_clicks: m.link_clicks,
    ctr: m.ctr,
    cpc: m.cpc,
    cpm: m.cpm,
    mess: m.mess,
    cost_per_mess: m.cost_per_mess,
  };
}

export const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+", "Unknown"];

export function audienceData(rows: readonly BreakdownRow[]) {
  const total = derive(computeMetrics(breakdownAsRows(rows)));
  const byAgeGender = breakdownMetrics(rows, (r) => `${r.value1}|${r.value2}`);
  const ages = [...new Set(rows.map((r) => r.value1))].sort((a, b) => {
    const ia = AGE_ORDER.indexOf(a), ib = AGE_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
  });
  const genders = ["female", "male", "unknown"].filter((g) => rows.some((r) => r.value2 === g));
  const table: TableRow[] = [];
  for (const a of ages) for (const g of genders) {
    const m = byAgeGender.get(`${a}|${g}`);
    if (m) table.push({ name: `${a} · ${genderLabel(g)}`, age: a, gender: genderLabel(g), ...breakdownCells(m, total) });
  }
  // Dữ liệu biểu đồ: mỗi nhóm tuổi 1 cột, chồng theo giới tính, cho từng metric
  const chart = ages.map((a) => {
    const point: Record<string, string | number | null> = { label: a };
    for (const g of genders) {
      const m = byAgeGender.get(`${a}|${g}`);
      for (const k of ["spend", "impressions", "link_clicks", "mess"] as const) point[`${g}_${k}`] = m ? m[k] : 0;
    }
    return point;
  });
  return { table, chart, genders, total };
}

export function regionData(rows: readonly BreakdownRow[]) {
  const total = derive(computeMetrics(breakdownAsRows(rows)));
  const byRegion = breakdownMetrics(rows, (r) => r.value1);
  const table: TableRow[] = [...byRegion].map(([name, m]) => ({ name, ...breakdownCells(m, total) }));
  table.sort((a, b) => Number(b.spend) - Number(a.spend));
  return { table, total };
}

// ---------------------------------------------------------------------------
// Từ khóa Google
// ---------------------------------------------------------------------------

const MATCH_LABEL: Record<string, string> = { EXACT: "Chính xác", PHRASE: "Cụm từ", BROAD: "Mở rộng" };

export interface KeywordTable {
  rows: TableRow[];
  totals: TableRow;
  /** Số từ khóa tiêu tiền nhưng 0 chuyển đổi, và tổng tiền của chúng */
  wasted: { count: number; spend: number };
}

export function keywordTable(keywords: readonly KeywordRow[], d: DashboardData): KeywordTable {
  const totalSpend = keywords.reduce((s, k) => s + k.spend, 0);
  const adGroupName = new Map(d.rows.map((r) => [r.adset_id, r.adset_name ?? r.adset_id]));
  let wastedCount = 0;
  let wastedSpend = 0;
  const rows = keywords.map((k) => {
    const wasted = k.spend > 0 && k.conversions === 0;
    if (wasted) {
      wastedCount += 1;
      wastedSpend += k.spend;
    }
    return {
      name: k.keyword_text,
      match: MATCH_LABEL[k.match_type] ?? k.match_type,
      campaign: d.scoped.get(campaignKey("google", k.campaign_id))?.campaign_name ?? k.campaign_id,
      ad_group: adGroupName.get(k.ad_group_id) ?? k.ad_group_id,
      spend: k.spend,
      spend_share: safeDiv(k.spend, totalSpend),
      impressions: k.impressions,
      clicks: k.clicks,
      ctr: safeDiv(k.clicks, k.impressions),
      cpc: safeDiv(k.spend, k.clicks),
      conversions: k.conversions,
      conv_rate: safeDiv(k.conversions, k.clicks),
      cost_per_conv: safeDiv(k.spend, k.conversions),
      quality_score: k.quality_score,
      flag: wasted ? "Tiêu tiền, 0 chuyển đổi" : k.quality_score !== null && k.quality_score <= 4 ? "Điểm chất lượng thấp" : "",
    };
  });
  const sum = (f: (k: KeywordRow) => number) => keywords.reduce((s, k) => s + f(k), 0);
  const clicks = sum((k) => k.clicks);
  const impr = sum((k) => k.impressions);
  const conv = sum((k) => k.conversions);
  return {
    rows,
    totals: {
      name: "Tổng",
      match: "",
      campaign: "",
      ad_group: "",
      spend: totalSpend,
      spend_share: totalSpend ? 1 : null,
      impressions: impr,
      clicks,
      ctr: safeDiv(clicks, impr),
      cpc: safeDiv(totalSpend, clicks),
      conversions: conv,
      conv_rate: safeDiv(conv, clicks),
      cost_per_conv: safeDiv(totalSpend, conv),
      quality_score: null,
      flag: "",
    },
    wasted: { count: wastedCount, spend: wastedSpend },
  };
}
