/**
 * Tiện ích ngày dạng chuỗi 'YYYY-MM-DD' (ngày theo lịch của tài khoản quảng cáo).
 * Mọi phép tính làm ở UTC trên chuỗi ngày để không bị lệch múi giờ của server.
 */

export type ISODate = string; // 'YYYY-MM-DD'

const DAY_MS = 86_400_000;

export function toUTC(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function fromUTC(date: Date): ISODate {
  return date.toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = toUTC(s);
  return !Number.isNaN(d.getTime()) && fromUTC(d) === s;
}

/** Ngày hôm nay theo múi giờ cho trước (vd Asia/Ho_Chi_Minh) */
export function todayInTz(timeZone: string, now: Date = new Date()): ISODate {
  // en-CA cho định dạng YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(new Date(toUTC(d).getTime() + n * DAY_MS));
}

/** Số ngày từ a đến b (b - a) */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / DAY_MS);
}

/** Số ngày của khoảng [from, to] tính cả 2 đầu */
export function daysInclusive(from: ISODate, to: ISODate): number {
  return diffDays(from, to) + 1;
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const dt = toUTC(startOfMonth(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return addDays(fromUTC(dt), -1);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const dt = toUTC(startOfMonth(d));
  dt.setUTCMonth(dt.getUTCMonth() + n);
  return fromUTC(dt);
}

export function daysInMonth(d: ISODate): number {
  return Number(endOfMonth(d).slice(8, 10));
}

/** Thứ Hai của tuần ISO chứa ngày d */
export function isoWeekStart(d: ISODate): ISODate {
  const dow = toUTC(d).getUTCDay(); // 0 = CN
  const offset = dow === 0 ? -6 : 1 - dow;
  return addDays(d, offset);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}
