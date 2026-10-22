/**
 * Dựng dữ liệu hiển thị (bảng, biểu đồ) từ DashboardData. Mọi phép tính đi qua lib/metrics.
 */
import type { DashboardData } from "./data";
import { campaignKey } from "./filters";
import { formatBucket } from "./format";
import {
  computeMetrics,
  derive,
  groupTotals,
  pctChange,
  PLATFORM_LABEL,
  PLATFORMS,
  timeSeries,
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
