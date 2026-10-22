/**
 * Seed data giả lập: 90 ngày, 6 campaign Meta + 4 campaign Google.
 *
 *   npm run seed                        # ghi thẳng vào Supabase (cần .env.local)
 *   SEED_TODAY=2026-10-22 npm run seed  # cố định mốc ngày
 *   npm run seed -- --sql seed.sql      # chỉ xuất file SQL để dán vào SQL Editor (không cần key)
 *
 * Ghi thẳng cần NEXT_PUBLIC_SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY trong .env.local.
 * Script XÓA toàn bộ data cũ trong các bảng (trừ allowed_users) rồi ghi lại.
 */
import { config as loadEnv } from "dotenv";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { clientConfig } from "../../config/client";
import { addDays, daysInclusive, eachDay, isISODate, startOfMonth, todayInTz, toUTC, type ISODate } from "../../lib/dates";
import { previousPeriod, resolveRange, PERIOD_TYPE } from "../../lib/filters";
import type { ObjectiveGroup, PerfRow, Platform } from "../../lib/metrics";
import { monthsInRange } from "../../lib/metrics";

loadEnv({ path: ".env.local" });
loadEnv();

const sqlFlag = process.argv.indexOf("--sql");
const sqlOut = sqlFlag >= 0 ? (process.argv[sqlFlag + 1] ?? "seed.sql") : null;

let db: SupabaseClient;
if (!sqlOut) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("Thiếu NEXT_PUBLIC_SUPABASE_URL hoặc SUPABASE_SERVICE_ROLE_KEY (hoặc dùng --sql để xuất file SQL)");
    process.exit(1);
  }
  db = createClient(url, serviceKey, { auth: { persistSession: false } });
}

// ---------------------------------------------------------------------------
// Random có seed cố định → chạy lại ra cùng data
// ---------------------------------------------------------------------------
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261022);
/** Nhiễu nhân quanh 1, biên độ ±amp */
const noise = (amp: number) => 1 + (rand() * 2 - 1) * amp;

// ---------------------------------------------------------------------------
// Định nghĩa campaign
// ---------------------------------------------------------------------------
interface CampaignDef {
  platform: Platform;
  campaign_id: string;
  campaign_name: string;
  objective_native: string;
  objective_group: ObjectiveGroup;
  status: string;
  adsets: string[];
  /** Spend trung bình / ngày / ad set (VND) */
  spend: number;
  cpm: number;
  ctr: number;
  /** video views / impressions */
  viewRate: number;
  /** mess / link click (chỉ Meta) */
  messRate: number;
  /** Tần suất cơ sở cho 1 ngày (dùng sinh reach) */
  baseFreq: number;
  /** Bắt đầu chạy sau N ngày kể từ đầu kỳ seed */
  startOffset?: number;
  /** Dừng N ngày trước cuối kỳ seed */
  stopBeforeEnd?: number;
}

const CAMPAIGNS: CampaignDef[] = [
  // Meta — Awareness
  { platform: "meta", campaign_id: "120210000000001", campaign_name: "AW | Video thương hiệu", objective_native: "OUTCOME_AWARENESS", objective_group: "Awareness", status: "ACTIVE",
    adsets: ["Nữ 25-44 HCM", "Rộng toàn quốc"], spend: 1_200_000, cpm: 22_000, ctr: 0.005, viewRate: 0.38, messRate: 0, baseFreq: 1.15 },
  { platform: "meta", campaign_id: "120210000000002", campaign_name: "AW | Reach Lookalike khách hàng", objective_native: "OUTCOME_AWARENESS", objective_group: "Awareness", status: "ACTIVE",
    adsets: ["LAL 1% khách mua", "LAL 3% tương tác"], spend: 800_000, cpm: 17_000, ctr: 0.004, viewRate: 0.12, messRate: 0, baseFreq: 1.05, startOffset: 14 },
  // Meta — Traffic
  { platform: "meta", campaign_id: "120210000000003", campaign_name: "TR | Website - Bộ sưu tập mới", objective_native: "OUTCOME_TRAFFIC", objective_group: "Traffic", status: "ACTIVE",
    adsets: ["Sở thích thời trang", "Retarget 30 ngày"], spend: 900_000, cpm: 38_000, ctr: 0.017, viewRate: 0.04, messRate: 0, baseFreq: 1.2 },
  { platform: "meta", campaign_id: "120210000000004", campaign_name: "TR | Website - Flash sale", objective_native: "OUTCOME_TRAFFIC", objective_group: "Traffic", status: "PAUSED",
    adsets: ["Broad 18-45", "Khách đã xem SP"], spend: 700_000, cpm: 42_000, ctr: 0.021, viewRate: 0.03, messRate: 0, baseFreq: 1.25, stopBeforeEnd: 12 },
  // Meta — Lead (tin nhắn)
  { platform: "meta", campaign_id: "120210000000005", campaign_name: "LD | Tin nhắn - Tư vấn sản phẩm", objective_native: "OUTCOME_ENGAGEMENT", objective_group: "Lead", status: "ACTIVE",
    adsets: ["Nữ 22-40 HCM-HN", "Sở thích làm đẹp"], spend: 1_500_000, cpm: 45_000, ctr: 0.014, viewRate: 0.06, messRate: 0.055, baseFreq: 1.2 },
  { platform: "meta", campaign_id: "120210000000006", campaign_name: "LD | Tin nhắn - Retarget", objective_native: "OUTCOME_ENGAGEMENT", objective_group: "Lead", status: "ACTIVE",
    adsets: ["Tương tác page 60 ngày", "Đã nhắn tin 90 ngày"], spend: 600_000, cpm: 62_000, ctr: 0.02, viewRate: 0.05, messRate: 0.085, baseFreq: 1.45 },
  // Google — Awareness
  { platform: "google", campaign_id: "21000000001", campaign_name: "YT | Video Awareness", objective_native: "VIDEO", objective_group: "Awareness", status: "ENABLED",
    adsets: ["In-stream - Sở thích", "Bumper - Remarketing"], spend: 1_000_000, cpm: 30_000, ctr: 0.003, viewRate: 0.27, messRate: 0, baseFreq: 1.3 },
  { platform: "google", campaign_id: "21000000002", campaign_name: "GDN | Display Awareness", objective_native: "DISPLAY", objective_group: "Awareness", status: "ENABLED",
    adsets: ["Chủ đề thời trang", "Đối tượng tùy chỉnh"], spend: 500_000, cpm: 11_000, ctr: 0.004, viewRate: 0, messRate: 0, baseFreq: 1.4 },
  // Google — Traffic
  { platform: "google", campaign_id: "21000000003", campaign_name: "SEA | Từ khóa thương hiệu", objective_native: "SEARCH", objective_group: "Traffic", status: "ENABLED",
    adsets: ["Brand - Exact", "Brand - Phrase"], spend: 350_000, cpm: 160_000, ctr: 0.085, viewRate: 0, messRate: 0, baseFreq: 1.6 },
  { platform: "google", campaign_id: "21000000004", campaign_name: "SEA | Từ khóa chung", objective_native: "SEARCH", objective_group: "Traffic", status: "ENABLED",
    adsets: ["Đầm công sở", "Áo kiểu nữ"], spend: 900_000, cpm: 240_000, ctr: 0.052, viewRate: 0, messRate: 0, baseFreq: 1.3 },
];

// ---------------------------------------------------------------------------
// Sinh daily_performance
// ---------------------------------------------------------------------------
const today: ISODate = process.env.SEED_TODAY && isISODate(process.env.SEED_TODAY)
  ? process.env.SEED_TODAY
  : todayInTz(clientConfig.timezone);
const end = addDays(today, -1);
const start = addDays(end, -89);
const days = eachDay(start, end);

function weekdayFactor(platform: Platform, date: ISODate): number {
  const dow = toUTC(date).getUTCDay(); // 0 CN, 6 T7
  const weekend = dow === 0 || dow === 6;
  // Meta mạnh cuối tuần; Search Google yếu cuối tuần
  if (platform === "meta") return weekend ? 1.12 : 0.97;
  return weekend ? 0.85 : 1.05;
}

const perf: (PerfRow & { adset_name: string })[] = [];
for (const c of CAMPAIGNS) {
  c.adsets.forEach((adsetName, ai) => {
    const adsetId = `${c.campaign_id}${String(ai + 1).padStart(2, "0")}`;
    const adsetWeight = ai === 0 ? 1.15 : 0.85;
    days.forEach((date, di) => {
      if (c.startOffset && di < c.startOffset) return;
      if (c.stopBeforeEnd && di >= days.length - c.stopBeforeEnd) return;
      if (rand() < 0.015) return; // thỉnh thoảng không phân phối
      // Xu hướng: tăng nhẹ dần + mùa cao điểm cuối kỳ
      const trend = 0.85 + 0.3 * (di / days.length);
      const spend = Math.round(c.spend * adsetWeight * trend * weekdayFactor(c.platform, date) * noise(0.18));
      // CPM tăng khi chi nhiều hơn (cạnh tranh), có nhiễu
      const cpmDay = c.cpm * noise(0.12) * (0.95 + 0.1 * trend);
      const impressions = Math.max(0, Math.round((spend / cpmDay) * 1000));
      const link_clicks = Math.round(impressions * c.ctr * noise(0.2));
      const video_views = Math.round(impressions * c.viewRate * noise(0.15));
      const mess = c.platform === "meta" ? Math.round(link_clicks * c.messRate * noise(0.35)) : 0;
      perf.push({
        date,
        platform: c.platform,
        campaign_id: c.campaign_id,
        adset_id: adsetId,
        adset_name: adsetName,
        spend,
        impressions,
        link_clicks,
        video_views,
        mess,
      });
    });
  });
}

// ---------------------------------------------------------------------------
// period_reach cho các kỳ chuẩn + kỳ so sánh tương ứng
// ---------------------------------------------------------------------------
interface ReachInsert {
  period_type: string;
  platform: Platform;
  date_from: ISODate;
  date_to: ISODate;
  campaign_id: string | null;
  reach: number;
  frequency: number;
}

const periods = new Map<string, { type: string; from: ISODate; to: ISODate }>();
for (const [preset, type] of Object.entries(PERIOD_TYPE)) {
  const r = resolveRange(preset as keyof typeof PERIOD_TYPE, today)!;
  periods.set(`${r.from}|${r.to}`, { type, ...r });
  const p = previousPeriod(r.from, r.to);
  const key = `${p.from}|${p.to}`;
  if (!periods.has(key)) periods.set(key, { type: "compare", ...p });
}

const reachRows: ReachInsert[] = [];
for (const { type, from, to } of periods.values()) {
  const n = daysInclusive(from, to);
  for (const platform of ["meta", "google"] as Platform[]) {
    let platformImpr = 0;
    let sumReach = 0;
    let maxReach = 0;
    for (const c of CAMPAIGNS.filter((x) => x.platform === platform)) {
      const impr = perf
        .filter((r) => r.campaign_id === c.campaign_id && r.date >= from && r.date <= to)
        .reduce((s, r) => s + r.impressions, 0);
      if (impr === 0) continue;
      // Tần suất tăng theo log số ngày (người xem lặp lại), không tuyến tính
      const freq = c.baseFreq * (1 + 0.42 * Math.log(n)) * noise(0.05);
      const reach = Math.round(impr / freq);
      reachRows.push({ period_type: type, platform, date_from: from, date_to: to, campaign_id: c.campaign_id, reach, frequency: +(impr / reach).toFixed(4) });
      platformImpr += impr;
      sumReach += reach;
      maxReach = Math.max(maxReach, reach);
    }
    if (platformImpr === 0) continue;
    // Reach toàn tài khoản < tổng reach campaign (trùng người xem giữa các campaign)
    const accountReach = Math.max(maxReach, Math.round(sumReach * 0.72));
    reachRows.push({ period_type: type, platform, date_from: from, date_to: to, campaign_id: null, reach: accountReach, frequency: +(platformImpr / accountReach).toFixed(4) });
  }
}

// ---------------------------------------------------------------------------
// targets: 3 tháng gần nhất (tháng hiện tại + 2 tháng trước)
// ---------------------------------------------------------------------------
const groupOf = new Map(CAMPAIGNS.map((c) => [`${c.platform}:${c.campaign_id}`, c.objective_group]));
const targetMonths = monthsInRange(start, end).slice(-3);
// Hệ số để tạo đủ trạng thái xanh / vàng / đỏ trên bảng KPI
const KPI_PLAN: Record<"Awareness" | "Traffic" | "Lead", { metric: string; factor: number; budgetFactor: number }> = {
  Awareness: { metric: "impressions", factor: 0.95, budgetFactor: 1.0 },
  Traffic: { metric: "cpc", factor: 0.9, budgetFactor: 1.08 },
  Lead: { metric: "cost_per_mess", factor: 0.72, budgetFactor: 0.95 },
};
const roundTo = (v: number, step: number) => Math.round(v / step) * step;

const targetRows = targetMonths.flatMap((m) => {
  const monthDays = days.filter((d) => startOfMonth(d) === m);
  const dim = Number(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate());
  const scale = dim / monthDays.length; // tháng chưa hết → ngoại suy cả tháng
  return (Object.keys(KPI_PLAN) as Array<keyof typeof KPI_PLAN>).map((group) => {
    const rows = perf.filter((r) => startOfMonth(r.date) === m && groupOf.get(`${r.platform}:${r.campaign_id}`) === group);
    const spend = rows.reduce((s, r) => s + r.spend, 0);
    const impr = rows.reduce((s, r) => s + r.impressions, 0);
    const clicks = rows.reduce((s, r) => s + r.link_clicks, 0);
    const mess = rows.reduce((s, r) => s + r.mess, 0);
    const spendMeta = rows.filter((r) => r.platform === "meta").reduce((s, r) => s + r.spend, 0);
    const plan = KPI_PLAN[group];
    const wobble = noise(0.04);
    let kpi_target: number;
    if (plan.metric === "impressions") kpi_target = roundTo((impr * scale) / (plan.factor * wobble), 10_000);
    else if (plan.metric === "cpc") kpi_target = roundTo((spend / clicks) * plan.factor * wobble, 50);
    else kpi_target = roundTo((spendMeta / mess) * plan.factor * wobble, 1_000);
    return {
      month: m,
      objective_group: group,
      budget: roundTo(spend * scale * plan.budgetFactor * wobble, 1_000_000),
      kpi_metric: plan.metric,
      kpi_target,
    };
  });
});

// ---------------------------------------------------------------------------
// sync_log: Meta sync đều; Google lỗi 2 lần gần nhất → kích hoạt banner cảnh báo
// ---------------------------------------------------------------------------
// hoursAgo: giờ trước thời điểm chạy seed (bản SQL dùng now() - interval nên vẫn tương đối lúc chạy)
const SYNC_PLAN = [
  { hoursAgo: 74, platform: "meta", status: "success", rows_written: 24, error: null },
  { hoursAgo: 73.9, platform: "google", status: "success", rows_written: 16, error: null },
  { hoursAgo: 50, platform: "meta", status: "success", rows_written: 24, error: null },
  { hoursAgo: 49.9, platform: "google", status: "success", rows_written: 16, error: null },
  { hoursAgo: 26, platform: "meta", status: "success", rows_written: 22, error: null },
  { hoursAgo: 25.9, platform: "google", status: "error", rows_written: 0, error: "AuthenticationError.OAUTH_TOKEN_EXPIRED" },
  { hoursAgo: 2, platform: "meta", status: "success", rows_written: 22, error: null },
  { hoursAgo: 1.9, platform: "google", status: "error", rows_written: 0, error: "AuthenticationError.OAUTH_TOKEN_EXPIRED" },
];
const now = Date.now();
const syncRows = SYNC_PLAN.map(({ hoursAgo, ...r }) => ({ run_at: new Date(now - hoursAgo * 3_600_000).toISOString(), ...r }));
const campaignRows = CAMPAIGNS.map(({ platform, campaign_id, campaign_name, objective_native, objective_group, status }) => ({
  platform, campaign_id, campaign_name, objective_native, objective_group, status,
}));

// ---------------------------------------------------------------------------
// Xuất file SQL
// ---------------------------------------------------------------------------
type SqlValue = string | number | null | { raw: string };
const lit = (v: SqlValue) =>
  v === null ? "null" : typeof v === "number" ? String(v) : typeof v === "object" ? v.raw : `'${v.replace(/'/g, "''")}'`;

function sqlInserts(table: string, rows: Record<string, SqlValue>[], size = 500): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const out: string[] = [];
  for (let i = 0; i < rows.length; i += size) {
    const values = rows.slice(i, i + size).map((r) => `(${cols.map((c) => lit(r[c])).join(", ")})`);
    out.push(`insert into public.${table} (${cols.join(", ")}) values\n${values.join(",\n")};`);
  }
  return out.join("\n\n");
}

function writeSql(path: string) {
  const sql = [
    `-- Data giả lập: ${start} → ${end} (hôm nay = ${today}). Tạo bởi: npm run seed -- --sql`,
    "-- XÓA data cũ (trừ allowed_users) rồi ghi lại. Chạy trong Supabase → SQL Editor.",
    "begin;",
    "delete from public.daily_performance;",
    "delete from public.period_reach;",
    "delete from public.campaigns;",
    "delete from public.targets;",
    "delete from public.sync_log;",
    sqlInserts("campaigns", campaignRows),
    sqlInserts("daily_performance", perf as unknown as Record<string, SqlValue>[]),
    sqlInserts("period_reach", reachRows as unknown as Record<string, SqlValue>[]),
    sqlInserts("targets", targetRows as unknown as Record<string, SqlValue>[]),
    sqlInserts(
      "sync_log",
      SYNC_PLAN.map(({ hoursAgo, ...r }) => ({ run_at: { raw: `now() - interval '${hoursAgo * 60} minutes'` }, ...r })),
    ),
    "commit;",
    "",
  ].join("\n\n");
  writeFileSync(path, sql);
  console.log(`✓ Đã ghi ${path} (${(sql.length / 1024).toFixed(0)} KB, ${perf.length} dòng daily_performance)`);
}

// ---------------------------------------------------------------------------
// Ghi vào DB
// ---------------------------------------------------------------------------
async function must<T>(p: PromiseLike<{ error: unknown; data?: T }>, label: string) {
  const { error } = await p;
  if (error) {
    console.error(`✗ ${label}:`, error);
    process.exit(1);
  }
}

async function insertChunks(table: string, rows: object[], size = 500) {
  for (let i = 0; i < rows.length; i += size) {
    await must(db.from(table).insert(rows.slice(i, i + size)), `insert ${table}`);
  }
}

async function main() {
  console.log(`Seed: ${start} → ${end} (hôm nay = ${today})`);

  await must(db.from("daily_performance").delete().gte("date", "1900-01-01"), "xóa daily_performance");
  await must(db.from("period_reach").delete().gte("id", 0), "xóa period_reach");
  await must(db.from("campaigns").delete().in("platform", ["meta", "google"]), "xóa campaigns");
  await must(db.from("targets").delete().gte("month", "1900-01-01"), "xóa targets");
  await must(db.from("sync_log").delete().gte("id", 0), "xóa sync_log");

  await insertChunks("campaigns", campaignRows);
  await insertChunks("daily_performance", perf);
  await insertChunks("period_reach", reachRows);
  await insertChunks("targets", targetRows);
  await insertChunks("sync_log", syncRows);

  console.log(`✓ campaigns: ${CAMPAIGNS.length}`);
  console.log(`✓ daily_performance: ${perf.length}`);
  console.log(`✓ period_reach: ${reachRows.length} (${periods.size} kỳ)`);
  console.log(`✓ targets: ${targetRows.length} (${targetMonths.join(", ")})`);
  console.log(`✓ sync_log: ${syncRows.length}`);
}

if (sqlOut) writeSql(sqlOut);
else main();
