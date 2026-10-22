import { ChangeBadge } from "@/components/KpiCard";
import type { DashboardData } from "@/lib/data";
import { campaignKey } from "@/lib/filters";
import { formatDec, formatInt } from "@/lib/format";
import { pctChange, PLATFORM_LABEL, type PerfRow } from "@/lib/metrics";
import { resolveReach, type ReachItem, type ReachResult } from "@/lib/reach";

function Card({ label, children, sub }: { label: string; children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 min-h-14">{children}</div>
      {sub && <div className="mt-2 border-t border-line pt-2 text-xs text-ink-3">{sub}</div>}
    </div>
  );
}

function Unavailable({ title, hint }: { title: string; hint: string }) {
  return (
    <div>
      <div className="text-base font-semibold text-ink-2">{title}</div>
      <div className="mt-1 text-xs text-ink-3">{hint}</div>
    </div>
  );
}

/** Campaign có phân phối (impressions > 0) trong tập dòng */
function activeCampaigns(rows: readonly PerfRow[]): Set<string> {
  return new Set(rows.filter((r) => r.impressions > 0).map((r) => campaignKey(r.platform, r.campaign_id)));
}

/**
 * Thẻ Reach + Frequency: cộng reach các campaign đang lọc, mỗi nền tảng 1 dòng. Chỉ có cho kỳ chuẩn.
 */
export function ReachCards({ data }: { data: DashboardData }) {
  const { filters } = data;
  const base = { isStandard: data.standard, rows: data.reach, platforms: data.platforms };
  const cur = resolveReach({ ...base, from: filters.from, to: filters.to, activeCampaigns: activeCampaigns(data.rows) });
  const prev = filters.compare
    ? resolveReach({ ...base, from: filters.prevFrom, to: filters.prevTo, activeCampaigns: activeCampaigns(data.prevRows) })
    : null;

  const prevItem = (p: ReachItem["platform"]) => (prev?.kind === "sum" ? prev.items.find((x) => x.platform === p) : undefined);

  const body = (field: "reach" | "frequency", r: ReachResult) => {
    switch (r.kind) {
      case "custom":
        return <Unavailable title="Chỉ có cho kỳ chuẩn" hint="Chọn 7 ngày, 30 ngày, tháng này hoặc tháng trước." />;
      case "missing":
        return <Unavailable title="Chưa có dữ liệu" hint="Kỳ này chưa có trong bảng period_reach." />;
      default:
        return (
          <ul className="space-y-1">
            {r.items.map((it) => {
              const p = prevItem(it.platform);
              return (
                <li key={it.platform} className="flex flex-wrap items-baseline gap-x-2">
                  {r.items.length > 1 && <span className="w-14 text-xs text-ink-3">{PLATFORM_LABEL[it.platform]}</span>}
                  <span className={`tabular font-semibold tracking-tight ${r.items.length > 1 ? "text-lg" : "text-2xl"}`}>
                    {field === "reach" ? formatInt(it.reach) : formatDec(it.frequency)}
                  </span>
                  {filters.compare && <ChangeBadge metric={field} change={p ? pctChange(it[field], p[field]) : null} />}
                </li>
              );
            })}
          </ul>
        );
    }
  };

  let note: string | undefined;
  if (cur.kind === "sum") {
    const n = cur.items.reduce((s, x) => s + x.campaigns, 0);
    const missing = cur.items.reduce((s, x) => s + x.missing, 0);
    note = `Cộng ${n} campaign${cur.items.length > 1 ? ", tách theo nền tảng" : ` ${PLATFORM_LABEL[cur.items[0].platform]}`}`;
    if (missing) note += ` · thiếu reach của ${missing} campaign`;
  }

  return (
    <>
      <Card label="Reach" sub={note}>
        {body("reach", cur)}
      </Card>
      <Card label="Frequency" sub={note && "Tổng impressions ÷ tổng reach các campaign"}>
        {body("frequency", cur)}
      </Card>
    </>
  );
}
