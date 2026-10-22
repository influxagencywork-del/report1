import { clientConfig } from "@/config/client";
import type { DashboardData } from "@/lib/data";
import { campaignKey } from "@/lib/filters";
import { formatMoney, formatPct, formatValue, EMPTY, type ValueFormat } from "@/lib/format";
import {
  computeMetrics,
  kpiAttainment,
  kpiStatus,
  metricValue,
  pacing,
  periodKpiTarget,
  proratedBudget,
  type KpiStatus,
  type ObjectiveGroup,
} from "@/lib/metrics";

const KPI_LABEL: Record<string, { label: string; format: ValueFormat }> = {
  impressions: { label: "Impressions", format: "int" },
  link_clicks: { label: "Link clicks", format: "int" },
  mess: { label: "Mess", format: "int" },
  video_views: { label: "Video views", format: "int" },
  cpm: { label: "CPM", format: "money" },
  cpc: { label: "CPC", format: "money" },
  ctr: { label: "CTR", format: "pct" },
  cost_per_mess: { label: "Cost per mess", format: "money" },
};

const STATUS: Record<KpiStatus, { label: string; dot: string; bg: string; icon: string }> = {
  green: { label: "Đạt", dot: "var(--status-green)", bg: "bg-[#e7f6e7]", icon: "✓" },
  yellow: { label: "Gần đạt", dot: "var(--status-yellow)", bg: "bg-[#fff4d6]", icon: "!" },
  red: { label: "Chưa đạt", dot: "var(--status-red)", bg: "bg-[#fbe7e7]", icon: "✕" },
  none: { label: "Không có mục tiêu", dot: "#c3c2b7", bg: "bg-page", icon: "–" },
};

export function StatusChip({ status, value }: { status: KpiStatus; value: number | null }) {
  const s = STATUS[status];
  return (
    <span className={`tabular inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium text-ink ${s.bg}`}>
      <span aria-hidden className="grid size-3.5 place-items-center rounded-full text-[9px] font-bold text-white" style={{ background: s.dot }}>
        {s.icon}
      </span>
      {value === null ? s.label : `${formatPct(value, 0)} · ${s.label}`}
    </span>
  );
}

/** Bảng KPI theo nhóm mục tiêu: thực tế vs mục tiêu, % đạt tô xanh / vàng / đỏ */
export function KpiTable({ data, groups }: { data: DashboardData; groups: readonly ObjectiveGroup[] }) {
  const { filters } = data;
  const groupOf = new Map<string, ObjectiveGroup>();
  for (const [k, c] of data.scoped) groupOf.set(k, c.objective_group);

  const rows = groups
    .map((g) => {
      const m = computeMetrics(data.rows.filter((r) => groupOf.get(campaignKey(r.platform, r.campaign_id)) === g));
      const kpi = periodKpiTarget(data.targets, g, filters.from, filters.to);
      const budget = proratedBudget(data.targets, filters.from, filters.to, [g]).budget;
      const actual = kpi ? metricValue(m, kpi.metric) : null;
      const att = kpi ? kpiAttainment(kpi.metric, actual, kpi.target) : null;
      return { g, m, kpi, budget, actual, att, status: kpiStatus(att, clientConfig.kpiThresholds) };
    })
    .filter((r) => r.m.rows > 0 || r.kpi);

  if (!rows.length) return <p className="text-sm text-ink-3">Không có dữ liệu.</p>;

  return (
    <div className="relative overflow-x-auto rounded-lg border border-line">
      <table className="tabular w-full min-w-max text-sm">
        <thead className="bg-page text-xs text-ink-2">
          <tr className="[&>th]:border-b [&>th]:border-line [&>th]:px-3 [&>th]:py-2 [&>th]:font-medium">
            <th className="text-left">Nhóm mục tiêu</th>
            <th className="text-right">Spend</th>
            <th className="text-right">Ngân sách kỳ</th>
            <th className="text-right">Pacing</th>
            <th className="text-left">KPI</th>
            <th className="text-right">Thực tế</th>
            <th className="text-right">Mục tiêu</th>
            <th className="text-left">% đạt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const meta = r.kpi ? (KPI_LABEL[r.kpi.metric] ?? { label: r.kpi.metric, format: "dec" as const }) : null;
            return (
              <tr key={r.g} className="border-b border-line last:border-b-0 [&>td]:px-3 [&>td]:py-2.5">
                <td className="font-medium">{r.g}</td>
                <td className="text-right">{formatMoney(r.m.spend)}</td>
                <td className="text-right">{r.budget > 0 ? formatMoney(r.budget) : EMPTY}</td>
                <td className="text-right">{formatPct(pacing(r.m.spend, r.budget), 1)}</td>
                <td>{meta?.label ?? EMPTY}</td>
                <td className="text-right">{meta ? formatValue(r.actual, meta.format) : EMPTY}</td>
                <td className="text-right">{meta && r.kpi ? formatValue(r.kpi.target, meta.format) : EMPTY}</td>
                <td>
                  <StatusChip status={r.status} value={r.att} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
