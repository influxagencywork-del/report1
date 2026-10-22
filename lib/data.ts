/**
 * Lớp đọc dữ liệu (CHỈ ĐỌC) từ Supabase cho các trang dashboard.
 * Mọi query chạy bằng session của user → RLS áp dụng.
 */
import { cache } from "react";
import { clientConfig } from "@/config/client";
import { createClient } from "./supabase/server";
import { todayInTz, type ISODate } from "./dates";
import { campaignKey, isStandardPeriod, parseFilters, type Filters, type SearchParams } from "./filters";
import { messCampaignKeys, PLATFORMS, withMessFlag, type ObjectiveGroup, type PerfRow, type Platform, type TargetRow } from "./metrics";
import type { ReachRow } from "./reach";

const PAGE = 1000; // giới hạn số dòng mỗi request của Supabase

export interface CampaignRow {
  platform: Platform;
  campaign_id: string;
  campaign_name: string;
  objective_native: string | null;
  objective_group: ObjectiveGroup;
  status: string | null;
}

export interface SyncStatus {
  lastSuccessAt: string | null;
  perPlatform: { platform: Platform; lastSuccessAt: string | null; stale: boolean; lastError: string | null }[];
  stale: boolean;
}

export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user;
});

/** true nếu email của user có trong allowed_users (đọc được dòng của chính mình) */
export const isAllowed = cache(async () => {
  const user = await getUser();
  if (!user?.email) return false;
  const supabase = await createClient();
  const { data, error } = await supabase.from("allowed_users").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
  // Lỗi kết nối KHÔNG được hiểu là "không có quyền" → ném lỗi để hiện trang báo lỗi + nút thử lại
  if (error) throw new Error(`Không kiểm tra được quyền truy cập: ${error.message}`);
  return !!data;
});

export const getCampaigns = cache(async (): Promise<CampaignRow[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .select("platform, campaign_id, campaign_name, objective_native, objective_group, status")
    .order("platform")
    .order("campaign_name");
  if (error) throw error;
  return (data ?? []) as CampaignRow[];
});

export const getSyncStatus = cache(async (): Promise<SyncStatus> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sync_log")
    .select("run_at, platform, status, error")
    .order("run_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const rows = data ?? [];
  const staleMs = clientConfig.syncStaleHours * 3_600_000;
  const now = Date.now();
  const perPlatform = PLATFORMS.map((platform) => {
    const lastSuccess = rows.find((r) => r.platform === platform && r.status === "success");
    const latest = rows.find((r) => r.platform === platform);
    const lastSuccessAt = lastSuccess?.run_at ?? null;
    return {
      platform,
      lastSuccessAt,
      stale: !lastSuccessAt || now - new Date(lastSuccessAt).getTime() > staleMs,
      lastError: latest && latest.status !== "success" ? latest.error : null,
    };
  });
  const successes = perPlatform.map((p) => p.lastSuccessAt).filter((x): x is string => !!x);
  return {
    lastSuccessAt: successes.length ? successes.sort().at(-1)! : null,
    perPlatform,
    stale: perPlatform.some((p) => p.stale),
  };
});

async function fetchPerf(from: ISODate, to: ISODate, platforms: Platform[], campaignIds: string[]): Promise<PerfRow[]> {
  if (campaignIds.length === 0) return [];
  const supabase = await createClient();
  const out: PerfRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    let q = supabase
      .from("daily_performance")
      .select("date, platform, campaign_id, adset_id, adset_name, ad_id, ad_name, spend, impressions, link_clicks, video_views, mess")
      .gte("date", from)
      .lte("date", to)
      .in("campaign_id", campaignIds)
      .order("date")
      .order("platform")
      .order("adset_id")
      .order("ad_id")
      .range(offset, offset + PAGE - 1);
    if (platforms.length) q = q.in("platform", platforms);
    const { data, error } = await q;
    if (error) throw error;
    for (const r of data ?? []) {
      out.push({
        ...r,
        spend: Number(r.spend),
        impressions: Number(r.impressions),
        link_clicks: Number(r.link_clicks),
        video_views: Number(r.video_views),
        mess: Number(r.mess),
      } as PerfRow);
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

async function fetchTargets(from: ISODate, to: ISODate): Promise<TargetRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("targets")
    .select("month, objective_group, budget, kpi_metric, kpi_target")
    .gte("month", `${from.slice(0, 7)}-01`)
    .lte("month", to);
  if (error) throw error;
  return (data ?? []).map((t) => ({ ...t, budget: Number(t.budget), kpi_target: Number(t.kpi_target) })) as TargetRow[];
}

async function fetchReach(periods: { from: ISODate; to: ISODate }[]): Promise<ReachRow[]> {
  const supabase = await createClient();
  const out: ReachRow[] = [];
  for (const p of periods) {
    const { data, error } = await supabase
      .from("period_reach")
      .select("period_type, platform, date_from, date_to, campaign_id, reach, frequency")
      .eq("date_from", p.from)
      .eq("date_to", p.to);
    if (error) throw error;
    out.push(...((data ?? []) as ReachRow[]));
  }
  return out;
}

export interface DashboardData {
  filters: Filters;
  today: ISODate;
  campaigns: CampaignRow[];
  /** Campaign trong phạm vi (bộ lọc + phạm vi trang), theo khóa platform:id */
  scoped: Map<string, CampaignRow>;
  /** Nền tảng trong phạm vi */
  platforms: Platform[];
  rows: PerfRow[];
  prevRows: PerfRow[];
  targets: TargetRow[];
  reach: ReachRow[];
  standard: boolean;
}

/**
 * Nạp toàn bộ data cho 1 trang.
 * @param opts.platform Trang của riêng 1 nền tảng (Meta / Google): bỏ qua bộ lọc nền tảng trên URL.
 */
export async function loadDashboard(searchParams: SearchParams, opts: { platform?: Platform } = {}): Promise<DashboardData> {
  const today = todayInTz(clientConfig.timezone);
  const filters = parseFilters(searchParams, today, clientConfig.defaultRange);
  const campaigns = await getCampaigns();

  const scoped = new Map<string, CampaignRow>();
  for (const c of campaigns) {
    const key = campaignKey(c.platform, c.campaign_id);
    if (opts.platform ? c.platform !== opts.platform : filters.platforms.length && !filters.platforms.includes(c.platform)) continue;
    if (filters.groups.length && !filters.groups.includes(c.objective_group)) continue;
    if (filters.campaigns.length && !filters.campaigns.includes(key)) continue;
    scoped.set(key, c);
  }
  const ids = [...new Set([...scoped.values()].map((c) => c.campaign_id))];
  const platforms = opts.platform ? [opts.platform] : filters.platforms.length ? filters.platforms : PLATFORMS;
  const inScope = (r: PerfRow) => scoped.has(campaignKey(r.platform, r.campaign_id));

  const standard = isStandardPeriod(filters);
  const [rows, prevRows, targets, reach] = await Promise.all([
    fetchPerf(filters.from, filters.to, platforms, ids),
    filters.compare ? fetchPerf(filters.prevFrom, filters.prevTo, platforms, ids) : Promise.resolve([]),
    fetchTargets(filters.compare ? filters.prevFrom : filters.from, filters.to),
    standard
      ? fetchReach(filters.compare ? [{ from: filters.from, to: filters.to }, { from: filters.prevFrom, to: filters.prevTo }] : [{ from: filters.from, to: filters.to }])
      : Promise.resolve([]),
  ]);

  // Campaign "có mess" xác định trên cả kỳ này + kỳ so sánh để 2 kỳ dùng cùng 1 tập campaign
  const cur = rows.filter(inScope);
  const prev = prevRows.filter(inScope);
  const messKeys = messCampaignKeys(cur, prev);

  return {
    filters,
    today,
    campaigns,
    scoped,
    platforms,
    rows: withMessFlag(cur, messKeys),
    prevRows: withMessFlag(prev, messKeys),
    targets,
    reach,
    standard,
  };
}

// ---------------------------------------------------------------------------
// Breakdown (đối tượng / khu vực) và từ khóa: gộp phía DB qua RPC (RLS vẫn áp dụng)
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  campaign_id: string;
  value1: string;
  value2: string;
  spend: number;
  impressions: number;
  link_clicks: number;
  mess: number;
}

export async function fetchBreakdown(
  platform: Platform,
  type: "age_gender" | "region",
  from: ISODate,
  to: ISODate,
  campaignIds: string[],
): Promise<BreakdownRow[]> {
  if (!campaignIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("breakdown_summary", {
    p_platform: platform,
    p_type: type,
    p_from: from,
    p_to: to,
    p_campaign_ids: campaignIds,
  });
  if (error) throw error;
  return ((data ?? []) as BreakdownRow[]).map((r) => ({
    ...r,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    link_clicks: Number(r.link_clicks),
    mess: Number(r.mess),
  }));
}

export interface KeywordRow {
  campaign_id: string;
  ad_group_id: string;
  keyword_id: string;
  keyword_text: string;
  match_type: string;
  status: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  quality_score: number | null;
}

export async function fetchKeywords(from: ISODate, to: ISODate, campaignIds: string[]): Promise<KeywordRow[]> {
  if (!campaignIds.length) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("keyword_summary", { p_from: from, p_to: to, p_campaign_ids: campaignIds });
  if (error) throw error;
  return ((data ?? []) as KeywordRow[]).map((r) => ({
    ...r,
    spend: Number(r.spend),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    quality_score: r.quality_score === null ? null : Number(r.quality_score),
  }));
}
