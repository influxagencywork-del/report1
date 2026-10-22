import { clientConfig } from "@/config/client";
import { DonutChart, HorizontalBarChart, StackedBarChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { KpiTable } from "@/components/KpiTable";
import { loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { formatMoney, formatPct } from "@/lib/format";
import { groupTotals, OBJECTIVE_GROUPS, pacing, PLATFORM_LABEL, proratedBudget } from "@/lib/metrics";
import { chartSeries, periodMetrics, platformTable } from "@/lib/report";

const PLATFORM_COLUMNS: Column[] = [
  { key: "name", label: "Nền tảng", format: "text" },
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_share", label: "% Spend", format: "pct" },
  { key: "spend_change", label: "± Spend", format: "change", metric: "spend" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "impressions_change", label: "± Impr.", format: "change", metric: "impressions" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "mess", label: "Mess", format: "int" },
  { key: "cost_per_mess", label: "Cost per mess", format: "money" },
];

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams);
  const { cur, change } = periodMetrics(d);
  const { filters } = d;

  // Ngân sách theo nhóm mục tiêu đang lọc (ngân sách không tách theo nền tảng / campaign)
  const groups = filters.groups.length ? filters.groups : OBJECTIVE_GROUPS;
  const budget = proratedBudget(d.targets, filters.from, filters.to, groups);
  const pace = pacing(cur.spend, budget.budget);
  const budgetCaveat = filters.platforms.length > 0 || filters.campaigns.length > 0;

  // Spend theo bucket tách Meta / Google
  const meta = chartSeries(d, d.rows.filter((r) => r.platform === "meta"));
  const google = chartSeries(d, d.rows.filter((r) => r.platform === "google"));
  const stacked = meta.map((p, i) => ({ label: p.label, meta: p.spend, google: google[i].spend }));
  const stackSeries = d.platforms.map((p) => ({ key: p, name: PLATFORM_LABEL[p], color: clientConfig.platformColors[p], format: "money" as const }));

  const groupMap = new Map<string, string>();
  for (const [k, c] of d.scoped) groupMap.set(k, c.objective_group);
  const byGroup = groupTotals(d.rows, (r) => groupMap.get(`${r.platform}:${r.campaign_id}`) ?? "Chưa phân loại");
  const groupBars = OBJECTIVE_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({ label: g, value: byGroup.get(g)!.spend }));

  // Tỉ trọng chi tiêu & bảng đối chiếu: Tổng quan = Meta + Google
  const byPlatform = groupTotals(d.rows, (r) => r.platform);
  const donut = d.platforms.map((p) => ({ name: PLATFORM_LABEL[p], value: byPlatform.get(p)?.spend ?? 0, color: clientConfig.platformColors[p] }));
  const platforms = platformTable(d);
  const platformColumns = PLATFORM_COLUMNS.filter((c) => filters.compare || c.format !== "change");

  if (d.scoped.size === 0) return <EmptyState>Không có campaign nào khớp bộ lọc.</EmptyState>;

  return (
    <div className="space-y-6">
      <h1 className="sr-only">Tổng quan</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="Spend"
          value={cur.spend}
          format="money"
          metric="spend"
          change={change("spend")}
          compare={filters.compare}
          sub={
            budget.budget > 0 ? (
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2">
                  <span>Pacing ngân sách</span>
                  <strong className="tabular">{formatPct(pace, 1)}</strong>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`Đã chi ${formatPct(pace, 1)} ngân sách kỳ`}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (pace ?? 0) * 100)}%` }} />
                </div>
                <div className="text-ink-3">
                  Ngân sách kỳ: {formatMoney(budget.budget)}
                  {budget.missingMonths.length > 0 && " · thiếu ngân sách 1 số tháng"}
                  {budgetCaveat && " · ngân sách không tách theo nền tảng/campaign"}
                </div>
              </div>
            ) : (
              <span className="text-ink-3">Chưa có ngân sách cho kỳ này</span>
            )
          }
        />
        <KpiCard label="Impressions" value={cur.impressions} format="int" metric="impressions" change={change("impressions")} compare={filters.compare} />
        <KpiCard label="Link clicks" value={cur.link_clicks} format="int" metric="link_clicks" change={change("link_clicks")} compare={filters.compare} />
        <KpiCard label="Mess" value={cur.mess} format="int" metric="mess" change={change("mess")} compare={filters.compare} sub={<span className="text-ink-3">Chỉ Meta</span>} />
        <KpiCard
          label="Cost per mess"
          value={cur.cost_per_mess}
          format="money"
          metric="cost_per_mess"
          change={change("cost_per_mess")}
          compare={filters.compare}
          sub={<span className="text-ink-3">Spend của campaign có mess ÷ Mess</span>}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Spend theo thời gian" subtitle="Chia theo nền tảng">
            <StackedBarChart data={stacked} series={stackSeries} />
          </Panel>
        </div>
        <Panel title="Tỉ trọng chi tiêu theo nền tảng" subtitle="% trên tổng spend của kỳ đang lọc">
          <DonutChart data={donut} format="money" centerLabel="Tổng spend" />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-2">
          <Panel title="Đối chiếu theo nền tảng" subtitle="Dòng Tổng = Meta + Google, khớp với các thẻ ở trên và với trang Meta / Google.">
            <DataTable columns={platformColumns} rows={platforms.rows} totals={platforms.totals} initialSort={{ key: "spend", dir: "desc" }} />
          </Panel>
        </div>
        <Panel title="Spend theo nhóm mục tiêu">
          <HorizontalBarChart data={groupBars} format="money" name="Spend" />
        </Panel>
      </div>

      <Panel
        title="KPI theo nhóm mục tiêu"
        subtitle="Mục tiêu tháng và ngân sách được chia theo số ngày của kỳ. % đạt = thực tế ÷ mục tiêu."
      >
        <KpiTable data={d} groups={groups} />
      </Panel>
    </div>
  );
}
