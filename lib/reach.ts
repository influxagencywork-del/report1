/**
 * Reach & Frequency.
 *
 * Reach đọc từ period_reach (giá trị theo campaign cho đúng kỳ chuẩn), không tính từ daily_performance.
 * Theo yêu cầu của client: Reach của nhiều campaign = CỘNG reach các campaign (không khử trùng người xem),
 * tách riêng theo nền tảng (mỗi nền tảng = 1 tài khoản quảng cáo).
 * Frequency = Σ(reach × frequency) ÷ Σ reach (tức tổng impressions ÷ tổng reach).
 */
import type { ISODate } from "./dates";
import type { Platform } from "./metrics";

export interface ReachRow {
  period_type: string;
  platform: Platform;
  date_from: ISODate;
  date_to: ISODate;
  campaign_id: string | null;
  reach: number;
  frequency: number;
}

export interface ReachItem {
  platform: Platform;
  reach: number;
  frequency: number;
  /** Số campaign đã cộng */
  campaigns: number;
  /** Số campaign có phân phối trong kỳ nhưng chưa có dòng reach */
  missing: number;
}

export type ReachResult =
  | { kind: "custom" } // kỳ tùy chọn → "Chỉ có cho kỳ chuẩn"
  | { kind: "missing" } // kỳ chuẩn nhưng không campaign nào có dòng reach
  | { kind: "sum"; items: ReachItem[] };

function matchPeriod(r: ReachRow, from: ISODate, to: ISODate) {
  return r.date_from === from && r.date_to === to;
}

/** Cộng reach của nhiều campaign; frequency tính lại có trọng số theo reach */
export function sumReach(items: ReadonlyArray<{ reach: number; frequency: number }>): { reach: number; frequency: number | null } {
  let reach = 0;
  let impressions = 0;
  for (const it of items) {
    reach += Number(it.reach);
    impressions += Number(it.reach) * Number(it.frequency);
  }
  return { reach, frequency: reach > 0 ? impressions / reach : null };
}

export function resolveReach(opts: {
  isStandard: boolean;
  from: ISODate;
  to: ISODate;
  rows: readonly ReachRow[];
  /** Nền tảng đang trong phạm vi lọc (giữ thứ tự hiển thị) */
  platforms: readonly Platform[];
  /** Campaign trong phạm vi lọc CÓ phân phối trong kỳ, khóa "platform:campaign_id" */
  activeCampaigns: ReadonlySet<string>;
}): ReachResult {
  const { isStandard, from, to, rows, platforms, activeCampaigns } = opts;
  if (!isStandard) return { kind: "custom" };

  const byKey = new Map<string, ReachRow>();
  for (const r of rows) if (r.campaign_id !== null && matchPeriod(r, from, to)) byKey.set(`${r.platform}:${r.campaign_id}`, r);

  const items: ReachItem[] = [];
  for (const p of platforms) {
    const keys = [...activeCampaigns].filter((k) => k.startsWith(`${p}:`));
    if (!keys.length) continue;
    const found = keys.map((k) => byKey.get(k)).filter((r): r is ReachRow => !!r);
    if (!found.length) continue;
    const s = sumReach(found);
    items.push({ platform: p, reach: s.reach, frequency: s.frequency ?? 0, campaigns: found.length, missing: keys.length - found.length });
  }
  return items.length ? { kind: "sum", items } : { kind: "missing" };
}

/** Reach của từng campaign cho bảng (null nếu không có / kỳ tùy chọn) */
export function campaignReachMap(
  rows: readonly ReachRow[],
  from: ISODate,
  to: ISODate,
): Map<string, { reach: number; frequency: number }> {
  const m = new Map<string, { reach: number; frequency: number }>();
  for (const r of rows) {
    if (r.campaign_id !== null && matchPeriod(r, from, to)) {
      m.set(`${r.platform}:${r.campaign_id}`, { reach: Number(r.reach), frequency: Number(r.frequency) });
    }
  }
  return m;
}
