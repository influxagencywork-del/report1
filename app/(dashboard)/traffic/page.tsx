import { clientConfig } from "@/config/client";
import { DualAxisLineChart } from "@/components/charts/Charts";
import type { Column } from "@/components/DataTable";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { TableTabs } from "@/components/TableTabs";
import { loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { adsetTable, campaignTable, chartSeries, periodMetrics } from "@/lib/report";

const METRIC_COLUMNS: Column[] = [
  { key: "spend", label: "Spend", format: "money" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "link_clicks_change", label: "± Clicks", format: "change", metric: "link_clicks" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "ctr_change", label: "± CTR", format: "change", metric: "ctr" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "cpc_change", label: "± CPC", format: "change", metric: "cpc" },
];

export default async function TrafficPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams, "Traffic");
  if (d.scoped.size === 0) return <EmptyState>Không có campaign Traffic nào khớp bộ lọc hiện tại.</EmptyState>;

  const { cur, change } = periodMetrics(d);
  const { filters } = d;
  const series = chartSeries(d, d.rows);
  const campaigns = campaignTable(d);
  const metricCols = METRIC_COLUMNS.filter((c) => filters.compare || c.format !== "change");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Traffic</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <KpiCard label="Link clicks" value={cur.link_clicks} format="int" metric="link_clicks" change={change("link_clicks")} compare={filters.compare} />
        <KpiCard label="CTR" value={cur.ctr} format="pct" metric="ctr" change={change("ctr")} compare={filters.compare} sub={<span className="text-ink-3">Tổng link clicks ÷ tổng impressions</span>} />
        <KpiCard label="CPC" value={cur.cpc} format="money" metric="cpc" change={change("cpc")} compare={filters.compare} sub={<span className="text-ink-3">Tổng spend ÷ tổng link clicks</span>} />
      </div>

      <Panel title="Link clicks và CPC theo thời gian" subtitle="CPC mỗi điểm = tổng spend ÷ tổng link clicks của điểm đó">
        <DualAxisLineChart
          data={series.map((p) => ({ label: p.label, link_clicks: p.link_clicks, cpc: p.cpc }))}
          left={{ key: "link_clicks", name: "Link clicks", color: clientConfig.chartColors.primary, format: "int" }}
          right={{ key: "cpc", name: "CPC", color: clientConfig.chartColors.secondary, format: "money" }}
        />
      </Panel>

      <Panel title="Chi tiết">
        <TableTabs
          initialSort={{ key: "spend", dir: "desc" }}
          tabs={[
            {
              id: "campaign",
              label: "Theo campaign",
              columns: [
                { key: "name", label: "Campaign", format: "text" },
                { key: "platform", label: "Nền tảng", format: "text" },
                { key: "status", label: "Trạng thái", format: "text" },
                ...metricCols,
              ],
              rows: campaigns.rows,
              totals: campaigns.totals,
            },
            {
              id: "adset",
              label: "Theo ad set / ad group",
              columns: [
                { key: "name", label: "Ad set / Ad group", format: "text" },
                { key: "campaign", label: "Campaign", format: "text" },
                { key: "platform", label: "Nền tảng", format: "text" },
                ...metricCols,
              ],
              rows: adsetTable(d),
              totals: campaigns.totals,
              searchKeys: ["name", "campaign"],
            },
          ]}
        />
      </Panel>
    </div>
  );
}
