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

/** Chia 1 số nguyên theo trọng số, tổng các phần luôn đúng bằng tổng ban đầu (phương pháp dư lớn nhất) */
function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  const raw = weights.map((w) => (total * w) / sum);
  const out = raw.map(Math.floor);
  let rest = total - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; rest > 0; k = (k + 1) % order.length, rest--) out[order[k][1]] += 1;
  return out;
}

/** Mẫu quảng cáo (ad) cho mỗi ad set Meta */
const AD_TEMPLATES = [
  ["Video 15s - Ưu đãi tháng", "Ảnh đơn - Sản phẩm bán chạy"],
  ["Carousel - Bộ sưu tập mới", "Video 6s - Thương hiệu"],
];

type PerfInsert = PerfRow & { adset_name: string; ad_id: string; ad_name: string | null };
const perf: PerfInsert[] = [];
/** Dòng cấp ad set (trước khi chia xuống ad) — dùng sinh breakdown và từ khóa */
const adsetDays: PerfInsert[] = [];
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
      const row: PerfInsert = {
        date,
        platform: c.platform,
        campaign_id: c.campaign_id,
        adset_id: adsetId,
        adset_name: adsetName,
        ad_id: "",
        ad_name: null,
        spend,
        impressions,
        link_clicks,
        video_views,
        mess,
      };
      adsetDays.push(row);
      if (c.platform === "google") {
        perf.push(row); // Google: dữ liệu ở cấp ad group
        return;
      }
      // Meta: chia xuống 2 ad; ad đầu dần chiếm ưu thế (Meta tối ưu phân phối)
      const share = 0.5 + 0.2 * (di / days.length) + (rand() - 0.5) * 0.1;
      const w = [share, 1 - share];
      // Mỗi ad có CTR khác nhau một chút → chia clicks theo trọng số đã điều chỉnh
      const ctrW = [w[0] * 1.1, w[1] * 0.9];
      const parts = {
        spend: allocate(spend, w),
        impressions: allocate(impressions, w),
        link_clicks: allocate(link_clicks, ctrW),
        video_views: allocate(video_views, w),
        mess: allocate(mess, ctrW),
      };
      AD_TEMPLATES[ai % AD_TEMPLATES.length].forEach((adName, k) => {
        perf.push({
          ...row,
          ad_id: `${adsetId}${k + 1}`,
          ad_name: adName,
          spend: parts.spend[k],
          impressions: parts.impressions[k],
          link_clicks: parts.link_clicks[k],
          video_views: parts.video_views[k],
          mess: parts.mess[k],
        });
      });
    });
  });
}

// ---------------------------------------------------------------------------
// daily_breakdown (Meta): tuổi × giới tính và region, chia từ tổng campaign / ngày
// ---------------------------------------------------------------------------
const AGES = ["18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
const AGE_W = [0.17, 0.35, 0.26, 0.12, 0.07, 0.03];
const GENDERS = ["female", "male", "unknown"];
const GENDER_W = [0.63, 0.34, 0.03];
const REGIONS: [string, number][] = [
  ["Ho Chi Minh City", 0.38], ["Hanoi", 0.24], ["Da Nang", 0.06], ["Binh Duong Province", 0.06], ["Dong Nai Province", 0.05],
  ["Haiphong", 0.04], ["Can Tho", 0.04], ["Khanh Hoa Province", 0.03], ["Ba Ria-Vung Tau Province", 0.03], ["Other", 0.07],
];

interface BreakdownInsert {
  date: ISODate;
  platform: Platform;
  campaign_id: string;
  breakdown_type: "age_gender" | "region";
  value1: string;
  value2: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  mess: number;
}
const breakdowns: BreakdownInsert[] = [];
const campaignDays = new Map<string, { date: ISODate; campaign_id: string; spend: number; impressions: number; link_clicks: number; mess: number }>();
for (const r of adsetDays.filter((x) => x.platform === "meta")) {
  const k = `${r.campaign_id}|${r.date}`;
  const t = campaignDays.get(k) ?? { date: r.date, campaign_id: r.campaign_id, spend: 0, impressions: 0, link_clicks: 0, mess: 0 };
  t.spend += r.spend; t.impressions += r.impressions; t.link_clicks += r.link_clicks; t.mess += r.mess;
  campaignDays.set(k, t);
}
// Mỗi campaign lệch tệp một chút (Lead nghiêng nữ 25-44, Awareness rộng hơn)
const campaignSkew = new Map(CAMPAIGNS.map((c, i) => [c.campaign_id, { young: 0.8 + 0.1 * (i % 4), female: c.objective_group === "Lead" ? 1.25 : 1 }]));
for (const t of campaignDays.values()) {
  const sk = campaignSkew.get(t.campaign_id)!;
  // tuổi × giới tính
  const segs: { a: string; g: string; w: number; ctr: number; msg: number }[] = [];
  AGES.forEach((a, ai) => GENDERS.forEach((g, gi) => {
    const ageW = AGE_W[ai] * (ai <= 1 ? sk.young : 1);
    const gW = GENDER_W[gi] * (g === "female" ? sk.female : 1);
    segs.push({ a, g, w: ageW * gW * noise(0.15), ctr: ai <= 1 ? 1.15 : ai >= 4 ? 0.7 : 1, msg: g === "female" && ai >= 1 && ai <= 2 ? 1.4 : 0.8 });
  }));
  const sp = allocate(t.spend, segs.map((x) => x.w));
  const im = allocate(t.impressions, segs.map((x) => x.w * noise(0.05)));
  const cl = allocate(t.link_clicks, segs.map((x) => x.w * x.ctr));
  const ms = allocate(t.mess, segs.map((x) => x.w * x.ctr * x.msg));
  segs.forEach((x, i) => {
    if (sp[i] + im[i] + cl[i] + ms[i] === 0) return;
    breakdowns.push({ date: t.date, platform: "meta", campaign_id: t.campaign_id, breakdown_type: "age_gender", value1: x.a, value2: x.g,
      spend: sp[i], impressions: im[i], link_clicks: cl[i], mess: ms[i] });
  });
  // region
  const rw = REGIONS.map(([, w]) => w * noise(0.12));
  const rsp = allocate(t.spend, rw);
  const rim = allocate(t.impressions, rw.map((w) => w * noise(0.05)));
  const rcl = allocate(t.link_clicks, rw.map((w, i) => w * (i < 2 ? 1.1 : 0.9)));
  const rms = allocate(t.mess, rw.map((w, i) => w * (i < 2 ? 1.2 : 0.8)));
  REGIONS.forEach(([name], i) => {
    if (rsp[i] + rim[i] + rcl[i] + rms[i] === 0) return;
    breakdowns.push({ date: t.date, platform: "meta", campaign_id: t.campaign_id, breakdown_type: "region", value1: name, value2: "",
      spend: rsp[i], impressions: rim[i], link_clicks: rcl[i], mess: rms[i] });
  });
}

// ---------------------------------------------------------------------------
// keyword_performance (Google Search): chia từ tổng ad group / ngày
// ---------------------------------------------------------------------------
interface KeywordDef { text: string; match: "EXACT" | "PHRASE" | "BROAD"; w: number; ctr: number; conv: number; qs: number }
const KEYWORDS: Record<string, KeywordDef[]> = {
  // Brand - Exact
  "2100000000301": [
    { text: "abc fashion", match: "EXACT", w: 0.55, ctr: 1.1, conv: 0.09, qs: 9 },
    { text: "abc fashion official", match: "EXACT", w: 0.25, ctr: 1.0, conv: 0.08, qs: 8 },
    { text: "shop abc", match: "EXACT", w: 0.2, ctr: 0.9, conv: 0.06, qs: 7 },
  ],
  // Brand - Phrase
  "2100000000302": [
    { text: "abc fashion sale", match: "PHRASE", w: 0.4, ctr: 1.05, conv: 0.07, qs: 8 },
    { text: "đầm abc", match: "PHRASE", w: 0.35, ctr: 1.0, conv: 0.06, qs: 7 },
    { text: "abc store hcm", match: "PHRASE", w: 0.25, ctr: 0.9, conv: 0.05, qs: 7 },
  ],
  // Đầm công sở
  "2100000000401": [
    { text: "đầm công sở", match: "PHRASE", w: 0.35, ctr: 1.1, conv: 0.035, qs: 7 },
    { text: "đầm công sở cao cấp", match: "EXACT", w: 0.2, ctr: 1.3, conv: 0.05, qs: 8 },
    { text: "váy công sở đẹp", match: "BROAD", w: 0.25, ctr: 0.9, conv: 0.02, qs: 5 },
    { text: "đầm dự tiệc", match: "BROAD", w: 0.2, ctr: 0.7, conv: 0, qs: 4 }, // cắn tiền, không ra đơn
  ],
  // Áo kiểu nữ
  "2100000000402": [
    { text: "áo kiểu nữ", match: "PHRASE", w: 0.35, ctr: 1.1, conv: 0.03, qs: 7 },
    { text: "áo sơ mi nữ", match: "EXACT", w: 0.25, ctr: 1.2, conv: 0.04, qs: 8 },
    { text: "áo nữ giá rẻ", match: "BROAD", w: 0.22, ctr: 0.8, conv: 0.004, qs: 3 }, // cắn tiền, gần như không ra đơn
    { text: "thời trang nữ", match: "BROAD", w: 0.18, ctr: 0.75, conv: 0.01, qs: 4 },
  ],
};

interface KeywordInsert {
  date: ISODate;
  platform: "google";
  campaign_id: string;
  ad_group_id: string;
  keyword_id: string;
  keyword_text: string;
  match_type: string;
  status: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  quality_score: number;
}
const keywords: KeywordInsert[] = [];
for (const r of adsetDays) {
  const defs = KEYWORDS[r.adset_id];
  if (!defs) continue;
  const w = defs.map((k) => k.w * noise(0.15));
  const sp = allocate(r.spend, w);
  const im = allocate(r.impressions, w.map((x, i) => x / defs[i].ctr)); // từ khóa CTR thấp cần nhiều impressions hơn
  const cl = allocate(r.link_clicks, w);
  defs.forEach((k, i) => {
    keywords.push({
      date: r.date,
      platform: "google",
      campaign_id: r.campaign_id,
      ad_group_id: r.adset_id,
      keyword_id: `${r.adset_id}${String(i + 1).padStart(3, "0")}`,
      keyword_text: k.text,
      match_type: k.match,
      status: "ENABLED",
      spend: sp[i],
      impressions: im[i],
      clicks: cl[i],
      conversions: Math.round(cl[i] * k.conv * noise(0.4)),
      quality_score: k.qs,
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
  Traffic: { metric: "link_clicks", factor: 0.9, budgetFactor: 1.08 },
  Lead: { metric: "mess", factor: 0.72, budgetFactor: 0.95 },
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
    const plan = KPI_PLAN[group];
    const wobble = noise(0.04);
    // KPI khối lượng: mục tiêu cả tháng = thực tế ngoại suy ÷ hệ số đạt mong muốn
    const actual = plan.metric === "impressions" ? impr : plan.metric === "link_clicks" ? clicks : mess;
    const step = plan.metric === "impressions" ? 10_000 : plan.metric === "link_clicks" ? 100 : 10;
    const kpi_target = roundTo((actual * scale) / (plan.factor * wobble), step);
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
    "delete from public.daily_breakdown;",
    "delete from public.keyword_performance;",
    "delete from public.daily_performance;",
    "delete from public.period_reach;",
    "delete from public.campaigns;",
    "delete from public.targets;",
    "delete from public.sync_log;",
    sqlInserts("campaigns", campaignRows),
    sqlInserts("daily_performance", perf as unknown as Record<string, SqlValue>[]),
    sqlInserts("period_reach", reachRows as unknown as Record<string, SqlValue>[]),
    sqlInserts("daily_breakdown", breakdowns as unknown as Record<string, SqlValue>[]),
    sqlInserts("keyword_performance", keywords as unknown as Record<string, SqlValue>[]),
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

  await must(db.from("daily_breakdown").delete().gte("date", "1900-01-01"), "xóa daily_breakdown");
  await must(db.from("keyword_performance").delete().gte("date", "1900-01-01"), "xóa keyword_performance");
  await must(db.from("daily_performance").delete().gte("date", "1900-01-01"), "xóa daily_performance");
  await must(db.from("period_reach").delete().gte("id", 0), "xóa period_reach");
  await must(db.from("campaigns").delete().in("platform", ["meta", "google"]), "xóa campaigns");
  await must(db.from("targets").delete().gte("month", "1900-01-01"), "xóa targets");
  await must(db.from("sync_log").delete().gte("id", 0), "xóa sync_log");

  await insertChunks("campaigns", campaignRows);
  await insertChunks("daily_performance", perf);
  await insertChunks("period_reach", reachRows);
  await insertChunks("daily_breakdown", breakdowns);
  await insertChunks("keyword_performance", keywords);
  await insertChunks("targets", targetRows);
  await insertChunks("sync_log", syncRows);

  console.log(`✓ campaigns: ${CAMPAIGNS.length}`);
  console.log(`✓ daily_performance: ${perf.length}`);
  console.log(`✓ period_reach: ${reachRows.length} (${periods.size} kỳ)`);
  console.log(`✓ daily_breakdown: ${breakdowns.length}`);
  console.log(`✓ keyword_performance: ${keywords.length}`);
  console.log(`✓ targets: ${targetRows.length} (${targetMonths.join(", ")})`);
  console.log(`✓ sync_log: ${syncRows.length}`);
}

if (sqlOut) writeSql(sqlOut);
else main();
