import { clientConfig } from "@/config/client";
import { BarLineChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/DataTable";
import { Funnel } from "@/components/Funnel";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { funnel } from "@/lib/metrics";
import { campaignTable, chartSeries, periodMetrics } from "@/lib/report";

const COLUMNS: Column[] = [
  { key: "name", label: "Campaign", format: "text" },
  { key: "platform", label: "Nền tảng", format: "text" },
  { key: "status", label: "Trạng thái", format: "text" },
  { key: "spend", label: "Spend", format: "money" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "mess", label: "Mess", format: "int" },
  { key: "mess_change", label: "± Mess", format: "change", metric: "mess" },
  { key: "cost_per_mess", label: "Cost per mess", format: "money" },
  { key: "cost_per_mess_change", label: "± Cost/mess", format: "change", metric: "cost_per_mess" },
];

export default async function LeadPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams, "Lead");
  if (d.scoped.size === 0) return <EmptyState>Không có campaign Lead nào khớp bộ lọc hiện tại.</EmptyState>;

  const { cur, change } = periodMetrics(d);
  const { filters } = d;
  const series = chartSeries(d, d.rows);
  const table = campaignTable(d);
  const columns = COLUMNS.filter((c) => filters.compare || c.format !== "change");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Lead</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <KpiCard label="Mess" value={cur.mess} format="int" metric="mess" change={change("mess")} compare={filters.compare} />
        <KpiCard
          label="Cost per mess"
          value={cur.cost_per_mess}
          format="money"
          metric="cost_per_mess"
          change={change("cost_per_mess")}
          compare={filters.compare}
          sub={<span className="text-ink-3">Spend của campaign có mess ÷ tổng mess</span>}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Mess và Cost per mess theo thời gian" subtitle="Cost per mess mỗi điểm = spend của campaign có mess ÷ tổng mess của điểm đó">
            <BarLineChart
              data={series.map((p) => ({ label: p.label, mess: p.mess, cost_per_mess: p.cost_per_mess }))}
              bar={{ key: "mess", name: "Mess", color: clientConfig.chartColors.primary, format: "int" }}
              line={{ key: "cost_per_mess", name: "Cost per mess", color: clientConfig.chartColors.secondary, format: "money" }}
            />
          </Panel>
        </div>
        <Panel
          title="Phễu chuyển đổi"
          subtitle="Tỉ lệ giữa các bước, không phải phễu chặt: với quảng cáo tin nhắn, mess không nhất thiết đi qua link click. Độ dài thanh theo thang log."
        >
          <Funnel steps={funnel(cur)} />
        </Panel>
      </div>

      <Panel title="Theo campaign">
        <DataTable columns={columns} rows={table.rows} totals={table.totals} initialSort={{ key: "spend", dir: "desc" }} />
      </Panel>
    </div>
  );
}
