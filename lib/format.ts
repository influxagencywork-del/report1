import { clientConfig } from "@/config/client";
import type { ISODate } from "./dates";
import type { Granularity } from "./metrics";

const { locale, currency, timezone } = clientConfig;

export type ValueFormat = "money" | "int" | "pct" | "dec" | "text";

const moneyFmt = new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 });
const intFmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 0 });
const decFmt = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const EMPTY = "—";

export function formatMoney(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? EMPTY : moneyFmt.format(v);
}

export function formatInt(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? EMPTY : intFmt.format(v);
}

/** v dạng thập phân: 0.0123 → "1,23%" */
export function formatPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return EMPTY;
  return `${new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v * 100)}%`;
}

export function formatDec(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? EMPTY : decFmt.format(v);
}

export function formatValue(v: number | string | null | undefined, f: ValueFormat): string {
  if (typeof v === "string") return v;
  switch (f) {
    case "money":
      return formatMoney(v);
    case "int":
      return formatInt(v);
    case "pct":
      return formatPct(v);
    case "dec":
      return formatDec(v);
    default:
      return v === null || v === undefined ? EMPTY : String(v);
  }
}

/** % thay đổi có dấu: +12,3% / −4,0% */
export function formatChange(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return EMPTY;
  const s = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(Math.abs(v) * 100);
  return `${v > 0 ? "+" : v < 0 ? "−" : ""}${s}%`;
}

/** Số rút gọn cho trục biểu đồ: 1,2 tỷ / 350 tr / 12 N */
export function formatCompact(v: number): string {
  const abs = Math.abs(v);
  const f = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(x);
  if (abs >= 1e9) return `${f(v / 1e9)} tỷ`;
  if (abs >= 1e6) return `${f(v / 1e6)} tr`;
  if (abs >= 1e3) return `${f(v / 1e3)} N`;
  return f(v);
}

export function formatDate(d: ISODate): string {
  return `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
}

export function formatBucket(d: ISODate, gran: Granularity): string {
  if (gran === "month") return `${d.slice(5, 7)}/${d.slice(0, 4)}`;
  const dm = `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  return gran === "week" ? `Tuần ${dm}` : dm;
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(iso));
}
