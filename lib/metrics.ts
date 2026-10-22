/**
 * Toàn bộ logic tính metric của dashboard. Hàm thuần, không I/O → dễ test.
 *
 * Nguyên tắc:
 *  - Mọi tỉ lệ (CPM, CTR, CPC, Cost per mess) tính từ TỔNG của kỳ, không lấy trung bình tỉ lệ theo ngày.
 *  - Reach / Frequency không cộng dồn (xem lib/reach.ts).
 *  - Video views của Meta và Google để riêng, không cộng.
 *  - Cost per mess = spend của các campaign CÓ PHÁT SINH MESS ÷ mess
 *    (không tính spend Awareness / Traffic / Google không tạo mess).
 */
import {
  addMonths,
  daysInclusive,
  daysInMonth,
  eachDay,
  endOfMonth,
  isoWeekStart,
  maxDate,
  minDate,
  startOfMonth,
  type ISODate,
} from "./dates";

export type Platform = "meta" | "google";
export const PLATFORMS: Platform[] = ["meta", "google"];
export const PLATFORM_LABEL: Record<Platform, string> = { meta: "Meta", google: "Google" };

export type ObjectiveGroup = "Awareness" | "Traffic" | "Lead" | "Chưa phân loại";
export const OBJECTIVE_GROUPS: ObjectiveGroup[] = ["Awareness", "Traffic", "Lead", "Chưa phân loại"];

export type Granularity = "day" | "week" | "month";

export interface PerfRow {
  date: ISODate;
  platform: Platform;
  campaign_id: string;
  adset_id: string;
  adset_name?: string | null;
  spend: number;
  impressions: number;
  link_clicks: number;
  video_views: number;
  mess: number;
  /**
   * true nếu campaign của dòng này có phát sinh mess trong kỳ đang xem (đánh dấu theo cả kỳ,
   * không theo từng ngày). Chưa đánh dấu → các hàm tổng hợp tự đánh dấu trên tập dòng được truyền vào.
   */
  mess_campaign?: boolean;
}

/** Các đại lượng cộng được */
export interface Totals {
  spend: number;
  spend_meta: number;
  spend_google: number;
  /** Spend của các campaign có phát sinh mess (tử số của Cost per mess) */
  spend_mess: number;
  impressions: number;
  link_clicks: number;
  mess: number;
  video_views_meta: number;
  video_views_google: number;
  rows: number;
}

/** Tổng + các tỉ lệ tính từ tổng. Tỉ lệ = null khi mẫu số = 0 (hiển thị "—"). */
export interface Metrics extends Totals {
  cpm: number | null;
  ctr: number | null; // dạng thập phân: 0.0123 = 1,23%
  cpc: number | null;
  cost_per_mess: number | null;
}

export type MetricKey =
  | "spend"
  | "impressions"
  | "link_clicks"
  | "mess"
  | "video_views_meta"
  | "video_views_google"
  | "cpm"
  | "ctr"
  | "cpc"
  | "cost_per_mess";

/** Metric mà giá trị THẤP hơn là tốt hơn */
export const COST_METRICS: ReadonlySet<string> = new Set(["cpm", "cpc", "cost_per_mess"]);

export function emptyTotals(): Totals {
  return {
    spend: 0,
    spend_meta: 0,
    spend_google: 0,
    spend_mess: 0,
    impressions: 0,
    link_clicks: 0,
    mess: 0,
    video_views_meta: 0,
    video_views_google: 0,
    rows: 0,
  };
}

export function addRow(t: Totals, r: PerfRow): Totals {
  const spend = Number(r.spend) || 0;
  const views = Number(r.video_views) || 0;
  t.spend += spend;
  t.impressions += Number(r.impressions) || 0;
  t.link_clicks += Number(r.link_clicks) || 0;
  t.mess += Number(r.mess) || 0;
  if (r.mess_campaign) t.spend_mess += spend;
  if (r.platform === "meta") {
    t.spend_meta += spend;
    t.video_views_meta += views;
  } else {
    t.spend_google += spend;
    t.video_views_google += views;
  }
  t.rows += 1;
  return t;
}

const rowCampaignKey = (r: PerfRow) => `${r.platform}:${r.campaign_id}`;

/** Khóa các campaign có tổng mess > 0 trên (các) tập dòng truyền vào */
export function messCampaignKeys(...lists: ReadonlyArray<readonly PerfRow[]>): Set<string> {
  const mess = new Map<string, number>();
  for (const rows of lists) for (const r of rows) mess.set(rowCampaignKey(r), (mess.get(rowCampaignKey(r)) ?? 0) + (Number(r.mess) || 0));
  return new Set([...mess].filter(([, m]) => m > 0).map(([k]) => k));
}

/** Gắn cờ mess_campaign cho từng dòng theo tập campaign cho trước */
export function withMessFlag(rows: readonly PerfRow[], keys: ReadonlySet<string>): PerfRow[] {
  return rows.map((r) => ({ ...r, mess_campaign: keys.has(rowCampaignKey(r)) }));
}

/** Nếu dòng chưa được đánh dấu: đánh dấu dựa trên chính tập dòng này (cả kỳ) */
function ensureMessFlag(rows: readonly PerfRow[]): readonly PerfRow[] {
  return rows.some((r) => r.mess_campaign === undefined) ? withMessFlag(rows, messCampaignKeys(rows)) : rows;
}

export function sumRows(rows: readonly PerfRow[]): Totals {
  const t = emptyTotals();
  for (const r of ensureMessFlag(rows)) addRow(t, r);
  return t;
}

export function safeDiv(num: number, den: number): number | null {
  if (!den || !Number.isFinite(num) || !Number.isFinite(den)) return null;
  return num / den;
}

export function cpm(t: Pick<Totals, "spend" | "impressions">): number | null {
  const v = safeDiv(t.spend, t.impressions);
  return v === null ? null : v * 1000;
}

export function ctr(t: Pick<Totals, "link_clicks" | "impressions">): number | null {
  return safeDiv(t.link_clicks, t.impressions);
}

export function cpc(t: Pick<Totals, "spend" | "link_clicks">): number | null {
  return safeDiv(t.spend, t.link_clicks);
}

/** Tử số chỉ gồm spend của các campaign có phát sinh mess */
export function costPerMess(t: Pick<Totals, "spend_mess" | "mess">): number | null {
  return safeDiv(t.spend_mess, t.mess);
}

export function derive(t: Totals): Metrics {
  return { ...t, cpm: cpm(t), ctr: ctr(t), cpc: cpc(t), cost_per_mess: costPerMess(t) };
}

export function computeMetrics(rows: readonly PerfRow[]): Metrics {
  return derive(sumRows(rows));
}

/** % thay đổi so với kỳ trước. null nếu không so sánh được. */
export function pctChange(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}

/** Thay đổi là tốt (true), xấu (false) hay trung tính (null) */
export function changeIsGood(metric: string, change: number | null): boolean | null {
  if (change === null || change === 0) return null;
  return COST_METRICS.has(metric) ? change < 0 : change > 0;
}

// ---------------------------------------------------------------------------
// Gom nhóm
// ---------------------------------------------------------------------------

export function groupTotals<K extends string>(
  rows: readonly PerfRow[],
  keyOf: (r: PerfRow) => K,
): Map<K, Totals> {
  const m = new Map<K, Totals>();
  for (const r of ensureMessFlag(rows)) {
    const k = keyOf(r);
    let t = m.get(k);
    if (!t) {
      t = emptyTotals();
      m.set(k, t);
    }
    addRow(t, r);
  }
  return m;
}

export function bucketOf(date: ISODate, gran: Granularity): ISODate {
  if (gran === "week") return isoWeekStart(date);
  if (gran === "month") return startOfMonth(date);
  return date;
}

/** Danh sách bucket liên tục phủ [from, to], kể cả bucket không có data */
export function buckets(from: ISODate, to: ISODate, gran: Granularity): ISODate[] {
  const out: ISODate[] = [];
  for (const d of eachDay(from, to)) {
    const b = bucketOf(d, gran);
    if (out[out.length - 1] !== b) out.push(b);
  }
  return out;
}

export interface SeriesPoint extends Metrics {
  bucket: ISODate;
}

/** Chuỗi thời gian: mỗi điểm là tổng của bucket, tỉ lệ tính từ tổng của bucket */
export function timeSeries(
  rows: readonly PerfRow[],
  from: ISODate,
  to: ISODate,
  gran: Granularity,
): SeriesPoint[] {
  const grouped = groupTotals(rows, (r) => bucketOf(r.date, gran));
  return buckets(from, to, gran).map((b) => ({
    bucket: b,
    ...derive(grouped.get(b) ?? emptyTotals()),
  }));
}

// ---------------------------------------------------------------------------
// Ngân sách & KPI
// ---------------------------------------------------------------------------

export interface TargetRow {
  month: ISODate; // ngày đầu tháng
  objective_group: ObjectiveGroup;
  budget: number;
  kpi_metric: string;
  kpi_target: number;
}

/**
 * Tỉ lệ (0..1) của tháng `month` nằm trong khoảng [from, to].
 * Dùng để chia ngân sách / KPI khối lượng theo tháng về kỳ đang xem.
 */
export function monthShare(month: ISODate, from: ISODate, to: ISODate): number {
  const mStart = startOfMonth(month);
  const mEnd = endOfMonth(month);
  const s = maxDate(mStart, from);
  const e = minDate(mEnd, to);
  if (s > e) return 0;
  return daysInclusive(s, e) / daysInMonth(month);
}

/** Các tháng (ngày đầu tháng) giao với [from, to] */
export function monthsInRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

export interface ProratedBudget {
  budget: number;
  /** Có tháng nào trong kỳ thiếu target không */
  missingMonths: ISODate[];
}

/** Ngân sách của kỳ = Σ ngân sách tháng × (số ngày của kỳ trong tháng / số ngày của tháng) */
export function proratedBudget(
  targets: readonly TargetRow[],
  from: ISODate,
  to: ISODate,
  groups: readonly ObjectiveGroup[],
): ProratedBudget {
  let budget = 0;
  const missingMonths: ISODate[] = [];
  for (const m of monthsInRange(from, to)) {
    const share = monthShare(m, from, to);
    const rows = targets.filter((t) => startOfMonth(t.month) === m && groups.includes(t.objective_group));
    if (rows.length === 0) missingMonths.push(m);
    for (const t of rows) budget += Number(t.budget) * share;
  }
  return { budget, missingMonths };
}

/** % pacing = spend / ngân sách của kỳ */
export function pacing(spend: number, budget: number): number | null {
  return safeDiv(spend, budget);
}

export type KpiStatus = "green" | "yellow" | "red" | "none";

/** Giá trị của 1 metric lấy từ Metrics */
export function metricValue(m: Metrics, key: string): number | null {
  switch (key) {
    case "impressions":
    case "link_clicks":
    case "mess":
    case "spend":
      return m[key];
    case "video_views":
      return m.video_views_meta + m.video_views_google;
    case "cpm":
    case "ctr":
    case "cpc":
    case "cost_per_mess":
      return m[key];
    default:
      return null;
  }
}

/**
 * Mục tiêu KPI của kỳ:
 *  - Metric khối lượng (impressions, clicks, mess...): cộng mục tiêu tháng × tỉ lệ ngày.
 *  - Metric tỉ lệ / chi phí (CPM, CPC, CTR, cost per mess): không chia theo ngày;
 *    nếu kỳ trải nhiều tháng thì lấy bình quân gia quyền theo số ngày.
 */
export function periodKpiTarget(
  targets: readonly TargetRow[],
  group: ObjectiveGroup,
  from: ISODate,
  to: ISODate,
): { metric: string; target: number } | null {
  const rows = targets.filter((t) => t.objective_group === group);
  if (rows.length === 0) return null;
  let metric: string | null = null;
  let volume = 0;
  let weighted = 0;
  let weight = 0;
  for (const m of monthsInRange(from, to)) {
    const t = rows.find((r) => startOfMonth(r.month) === m);
    if (!t) continue;
    metric ??= t.kpi_metric;
    if (t.kpi_metric !== metric) continue; // đổi metric giữa các tháng: chỉ dùng metric đầu tiên
    const share = monthShare(m, from, to);
    volume += Number(t.kpi_target) * share;
    const days = share * daysInMonth(m);
    weighted += Number(t.kpi_target) * days;
    weight += days;
  }
  if (metric === null || weight === 0) return null;
  const isRatio = COST_METRICS.has(metric) || metric === "ctr";
  return { metric, target: isRatio ? weighted / weight : volume };
}

/**
 * % đạt KPI:
 *  - Khối lượng / CTR: thực tế ÷ mục tiêu (cao hơn là tốt)
 *  - Chi phí: mục tiêu ÷ thực tế (thấp hơn là tốt)
 */
export function kpiAttainment(metric: string, actual: number | null, target: number | null): number | null {
  if (actual === null || target === null) return null;
  if (COST_METRICS.has(metric)) {
    if (actual === 0) return null;
    return target / actual;
  }
  return safeDiv(actual, target);
}

export function kpiStatus(
  attainment: number | null,
  thresholds: { green: number; yellow: number },
): KpiStatus {
  if (attainment === null) return "none";
  if (attainment >= thresholds.green) return "green";
  if (attainment >= thresholds.yellow) return "yellow";
  return "red";
}

// ---------------------------------------------------------------------------
// Phễu
// ---------------------------------------------------------------------------

export interface FunnelStep {
  key: "impressions" | "link_clicks" | "mess";
  label: string;
  value: number;
  /** Tỉ lệ chuyển từ bước trước sang bước này */
  rateFromPrev: number | null;
  /** Tỉ lệ rơi rụng so với bước trước = 1 - rateFromPrev */
  dropFromPrev: number | null;
}

export function funnel(t: Pick<Totals, "impressions" | "link_clicks" | "mess">): FunnelStep[] {
  const steps: Array<Pick<FunnelStep, "key" | "label" | "value">> = [
    { key: "impressions", label: "Impressions", value: t.impressions },
    { key: "link_clicks", label: "Link clicks", value: t.link_clicks },
    { key: "mess", label: "Mess", value: t.mess },
  ];
  return steps.map((s, i) => {
    const rate = i === 0 ? null : safeDiv(s.value, steps[i - 1].value);
    return { ...s, rateFromPrev: rate, dropFromPrev: rate === null ? null : 1 - rate };
  });
}
