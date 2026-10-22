import { clientConfig } from "@/config/client";
import { DualAxisLineChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { ReachCards } from "@/components/ReachCards";
import { loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { campaignTable, chartSeries, periodMetrics } from "@/lib/report";

const COLUMNS: Column[] = [
  { key: "name", label: "Campaign", format: "text" },
  { key: "platform", label: "Nền tảng", format: "text" },
  { key: "status", label: "Trạng thái", format: "text" },
  { key: "spend", label: "Spend", format: "money" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "impressions_change", label: "± Impr.", format: "change", metric: "impressions" },
  { key: "reach", label: "Reach", format: "int" },
  { key: "frequency", label: "Frequency", format: "dec" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "cpm_change", label: "± CPM", format: "change", metric: "cpm" },
  { key: "video_views_meta", label: "Video views Meta", format: "int" },
  { key: "video_views_google", label: "Video views Google", format: "int" },
];

export default async function AwarenessPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams, "Awareness");
  if (d.scoped.size === 0) return <EmptyState>Không có campaign Awareness nào khớp bộ lọc hiện tại.</EmptyState>;

  const { cur, change } = periodMetrics(d);
  const { filters } = d;
  const series = chartSeries(d, d.rows);
  const table = campaignTable(d);
  const columns = COLUMNS.filter((c) => filters.compare || c.format !== "change");
  const showMeta = d.platforms.includes("meta");
  const showGoogle = d.platforms.includes("google");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Awareness</h1>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Impressions" value={cur.impressions} format="int" metric="impressions" change={change("impressions")} compare={filters.compare} />
        <ReachCards data={d} />
        <KpiCard label="CPM" value={cur.cpm} format="money" metric="cpm" change={change("cpm")} compare={filters.compare} />
        {showMeta && (
          <KpiCard
            label="Video views Meta"
            value={cur.video_views_meta}
            format="int"
            metric="video_views_meta"
            change={change("video_views_meta")}
            compare={filters.compare}
            sub={<span className="text-ink-3">Mọi lượt phát (video_play_actions)</span>}
          />
        )}
        {showGoogle && (
          <KpiCard
            label="Video views Google"
            value={cur.video_views_google}
            format="int"
            metric="video_views_google"
            change={change("video_views_google")}
            compare={filters.compare}
            sub={<span className="text-ink-3">Không cộng với Meta</span>}
          />
        )}
      </div>

      <Panel title="Impressions và CPM theo thời gian" subtitle="CPM mỗi điểm = tổng spend ÷ tổng impressions của điểm đó × 1000">
        <DualAxisLineChart
          data={series.map((p) => ({ label: p.label, impressions: p.impressions, cpm: p.cpm }))}
          left={{ key: "impressions", name: "Impressions", color: clientConfig.chartColors.primary, format: "int" }}
          right={{ key: "cpm", name: "CPM", color: clientConfig.chartColors.secondary, format: "money" }}
        />
      </Panel>

      <Panel title="Theo campaign" subtitle={d.standard ? "Reach tách theo nền tảng: dòng Tổng Meta / Tổng Google = cộng reach các campaign (không khử trùng người xem), frequency = tổng impressions ÷ tổng reach." : "Reach / Frequency chỉ có cho kỳ chuẩn."}>
        <DataTable columns={columns} rows={table.rows} totals={table.totals} initialSort={{ key: "spend", dir: "desc" }} />
      </Panel>
    </div>
  );
}
