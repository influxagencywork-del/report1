/**
 * Bộ lọc dùng chung cho mọi trang, lưu trên URL.
 *
 * Tham số URL:
 *   range    = 7d | 30d | this_month | last_month | custom
 *   from,to  = YYYY-MM-DD (chỉ khi range=custom)
 *   cmp      = 0 để tắt so sánh kỳ trước (mặc định bật)
 *   platform = meta,google
 *   group    = Awareness,Traffic,Lead,Chưa phân loại
 *   campaign = meta:123,google:456   (platform:campaign_id)
 *   gran     = day | week | month
 */
import {
  addDays,
  addMonths,
  daysInclusive,
  endOfMonth,
  isISODate,
  maxDate,
  minDate,
  startOfMonth,
  type ISODate,
} from "./dates";
import { OBJECTIVE_GROUPS, PLATFORMS, type Granularity, type ObjectiveGroup, type Platform } from "./metrics";

export type RangePreset = "7d" | "30d" | "this_month" | "last_month" | "custom";
export const RANGE_PRESETS: RangePreset[] = ["7d", "30d", "this_month", "last_month", "custom"];
export const RANGE_LABEL: Record<RangePreset, string> = {
  "7d": "7 ngày qua",
  "30d": "30 ngày qua",
  this_month: "Tháng này",
  last_month: "Tháng trước",
  custom: "Tùy chọn",
};
export const GRAN_LABEL: Record<Granularity, string> = { day: "Ngày", week: "Tuần", month: "Tháng" };

/** period_type lưu trong bảng period_reach cho các kỳ chuẩn */
export const PERIOD_TYPE: Record<Exclude<RangePreset, "custom">, string> = {
  "7d": "last_7d",
  "30d": "last_30d",
  this_month: "this_month",
  last_month: "last_month",
};

export interface Filters {
  range: RangePreset;
  from: ISODate;
  to: ISODate;
  compare: boolean;
  prevFrom: ISODate;
  prevTo: ISODate;
  /** Rỗng = tất cả */
  platforms: Platform[];
  groups: ObjectiveGroup[];
  /** Khóa campaign dạng "platform:campaign_id" */
  campaigns: string[];
  gran: Granularity;
}

export type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function list(v: string | string[] | undefined): string[] {
  const s = first(v);
  if (!s) return [];
  return [...new Set(s.split(",").map((x) => x.trim()).filter(Boolean))];
}

export function campaignKey(platform: string, campaignId: string): string {
  return `${platform}:${campaignId}`;
}

/**
 * Khoảng ngày của preset. Kỳ chuẩn tính đến HẾT HÔM QUA vì data hôm nay chưa đầy đủ.
 */
export function resolveRange(
  preset: RangePreset,
  today: ISODate,
  customFrom?: string,
  customTo?: string,
): { from: ISODate; to: ISODate } | null {
  const yesterday = addDays(today, -1);
  switch (preset) {
    case "7d":
      return { from: addDays(yesterday, -6), to: yesterday };
    case "30d":
      return { from: addDays(yesterday, -29), to: yesterday };
    case "this_month": {
      const from = startOfMonth(today);
      // Ngày mùng 1: chưa có ngày nào trọn vẹn → hiển thị hôm nay
      return { from, to: maxDate(from, yesterday) };
    }
    case "last_month": {
      const m = addMonths(today, -1);
      return { from: m, to: endOfMonth(m) };
    }
    case "custom": {
      if (!isISODate(customFrom) || !isISODate(customTo)) return null;
      const from = minDate(customFrom, customTo);
      const to = minDate(maxDate(customFrom, customTo), today);
      if (from > to) return null;
      return { from, to };
    }
  }
}

/** Kỳ trước liền kề, cùng số ngày */
export function previousPeriod(from: ISODate, to: ISODate): { from: ISODate; to: ISODate } {
  const len = daysInclusive(from, to);
  const prevTo = addDays(from, -1);
  return { from: addDays(prevTo, -(len - 1)), to: prevTo };
}

export function defaultGranularity(from: ISODate, to: ISODate): Granularity {
  const len = daysInclusive(from, to);
  if (len > 180) return "month";
  if (len > 62) return "week";
  return "day";
}

export function parseFilters(sp: SearchParams, today: ISODate, defaultRange: RangePreset = "30d"): Filters {
  let range = (first(sp.range) as RangePreset) ?? defaultRange;
  if (!RANGE_PRESETS.includes(range)) range = defaultRange;

  let resolved = resolveRange(range, today, first(sp.from), first(sp.to));
  if (!resolved) {
    range = defaultRange === "custom" ? "30d" : defaultRange;
    resolved = resolveRange(range, today)!;
  }
  const { from, to } = resolved;
  const prev = previousPeriod(from, to);

  const platforms = list(sp.platform).filter((p): p is Platform => PLATFORMS.includes(p as Platform));
  const groups = list(sp.group).filter((g): g is ObjectiveGroup => OBJECTIVE_GROUPS.includes(g as ObjectiveGroup));
  const campaigns = list(sp.campaign).filter((c) => /^(meta|google):.+$/.test(c));
  const granRaw = first(sp.gran);
  const gran: Granularity =
    granRaw === "day" || granRaw === "week" || granRaw === "month" ? granRaw : defaultGranularity(from, to);

  return {
    range,
    from,
    to,
    compare: first(sp.cmp) !== "0",
    prevFrom: prev.from,
    prevTo: prev.to,
    platforms: platforms.length === PLATFORMS.length ? [] : platforms,
    groups: groups.length === OBJECTIVE_GROUPS.length ? [] : groups,
    campaigns,
    gran,
  };
}

/** Ghi bộ lọc ra query string (bỏ qua giá trị mặc định cho URL gọn) */
export function filtersToQuery(f: Partial<Filters> & { range: RangePreset }): string {
  const q = new URLSearchParams();
  q.set("range", f.range);
  if (f.range === "custom" && f.from && f.to) {
    q.set("from", f.from);
    q.set("to", f.to);
  }
  if (f.compare === false) q.set("cmp", "0");
  if (f.platforms?.length) q.set("platform", f.platforms.join(","));
  if (f.groups?.length) q.set("group", f.groups.join(","));
  if (f.campaigns?.length) q.set("campaign", f.campaigns.join(","));
  if (f.gran) q.set("gran", f.gran);
  return q.toString();
}

export function isStandardPeriod(f: Pick<Filters, "range">): boolean {
  return f.range !== "custom";
}
