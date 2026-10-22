import { clientConfig } from "@/config/client";
import { AudienceChart, RegionChart } from "@/components/charts/BreakdownCharts";
import { BarLineChart, DualAxisLineChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/DataTable";
import { Funnel } from "@/components/Funnel";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { ReachCards } from "@/components/ReachCards";
import { TableTabs } from "@/components/TableTabs";
import { fetchBreakdown, loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { funnel } from "@/lib/metrics";
import { adsetTable, adTable, audienceData, campaignTable, chartSeries, groupTable, periodMetrics, regionData } from "@/lib/report";

const METRIC_COLUMNS: Column[] = [
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_change", label: "± Spend", format: "change", metric: "spend", hidden: true },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "cpc_change", label: "± CPC", format: "change", metric: "cpc", hidden: true },
  { key: "video_views_meta", label: "Video views", format: "int" },
  { key: "mess", label: "Mess", format: "int" },
  { key: "mess_change", label: "± Mess", format: "change", metric: "mess", hidden: true },
  { key: "cost_per_mess", label: "Cost per mess", format: "money" },
];

const BREAKDOWN_COLUMNS: Column[] = [
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_share", label: "% Spend", format: "pct" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "mess", label: "Mess", format: "int" },
  { key: "cost_per_mess", label: "Cost per mess", format: "money" },
];

/** Chèn cột Reach / Frequency ngay sau CPM */
function withReachColumns(cols: Column[]): Column[] {
  const i = cols.findIndex((c) => c.key === "cpm") + 1;
  return [...cols.slice(0, i), { key: "reach", label: "Reach", format: "int" }, { key: "frequency", label: "Frequency", format: "dec" }, ...cols.slice(i)];
}

export default async function MetaPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams, { platform: "meta" });
  if (d.scoped.size === 0) return <EmptyState>Không có campaign Meta nào khớp bộ lọc hiện tại.</EmptyState>;

  const { cur, change } = periodMetrics(d);
  const { filters } = d;
  const ids = [...d.scoped.values()].map((c) => c.campaign_id);
  const [ageGender, regions] = await Promise.all([
    fetchBreakdown("meta", "age_gender", filters.from, filters.to, ids),
    fetchBreakdown("meta", "region", filters.from, filters.to, ids),
  ]);
  const audience = audienceData(ageGender);
  const region = regionData(regions);

  const series = chartSeries(d, d.rows);
  const campaigns = campaignTable(d);
  const metricCols = METRIC_COLUMNS.filter((c) => filters.compare || c.format !== "change");
  const cmp = filters.compare;
  const csv = (level: string) => `meta_${level}_${filters.from}_${filters.to}`;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Meta</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
        <KpiCard label="Spend" value={cur.spend} format="money" metric="spend" change={change("spend")} compare={cmp} />
        <KpiCard label="Impressions" value={cur.impressions} format="int" metric="impressions" change={change("impressions")} compare={cmp} />
        <ReachCards data={d} />
        <KpiCard label="CPM" value={cur.cpm} format="money" metric="cpm" change={change("cpm")} compare={cmp} />
        <KpiCard label="Link clicks" value={cur.link_clicks} format="int" metric="link_clicks" change={change("link_clicks")} compare={cmp} />
        <KpiCard label="CTR" value={cur.ctr} format="pct" metric="ctr" change={change("ctr")} compare={cmp} />
        <KpiCard label="CPC" value={cur.cpc} format="money" metric="cpc" change={change("cpc")} compare={cmp} />
        <KpiCard
          label="Video views"
          value={cur.video_views_meta}
          format="int"
          metric="video_views_meta"
          change={change("video_views_meta")}
          compare={cmp}
          sub={<span className="text-ink-3">Mọi lượt phát (video_play_actions)</span>}
        />
        <KpiCard label="Mess" value={cur.mess} format="int" metric="mess" change={change("mess")} compare={cmp} />
        <KpiCard
          label="Cost per mess"
          value={cur.cost_per_mess}
          format="money"
          metric="cost_per_mess"
          change={change("cost_per_mess")}
          compare={cmp}
          sub={<span className="text-ink-3">Spend của campaign có mess ÷ Mess</span>}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Impressions và CPM" subtitle="CPM mỗi điểm = tổng spend ÷ tổng impressions × 1000">
          <DualAxisLineChart
            data={series.map((p) => ({ label: p.label, impressions: p.impressions, cpm: p.cpm }))}
            left={{ key: "impressions", name: "Impressions", color: clientConfig.chartColors.primary, format: "int" }}
            right={{ key: "cpm", name: "CPM", color: clientConfig.chartColors.secondary, format: "money" }}
          />
        </Panel>
        <Panel title="Link clicks và CPC" subtitle="CPC mỗi điểm = tổng spend ÷ tổng link clicks">
          <DualAxisLineChart
            data={series.map((p) => ({ label: p.label, link_clicks: p.link_clicks, cpc: p.cpc }))}
            left={{ key: "link_clicks", name: "Link clicks", color: clientConfig.chartColors.primary, format: "int" }}
            right={{ key: "cpc", name: "CPC", color: clientConfig.chartColors.secondary, format: "money" }}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Panel title="Mess và Cost per mess" subtitle="Cost per mess mỗi điểm = spend của campaign có mess ÷ mess">
            <BarLineChart
              data={series.map((p) => ({ label: p.label, mess: p.mess, cost_per_mess: p.cost_per_mess }))}
              bar={{ key: "mess", name: "Mess", color: clientConfig.chartColors.primary, format: "int" }}
              line={{ key: "cost_per_mess", name: "Cost per mess", color: clientConfig.chartColors.secondary, format: "money" }}
            />
          </Panel>
        </div>
        <Panel title="Phễu chuyển đổi" subtitle="Tỉ lệ giữa các bước (không phải phễu chặt). Độ dài thanh theo thang log.">
          <Funnel steps={funnel(cur)} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Đối tượng: tuổi × giới tính" subtitle="Chọn chỉ số để xem. Số liệu theo breakdown của Meta, có thể lệch nhẹ so với tổng campaign.">
          {audience.table.length ? <AudienceChart data={audience.chart} genders={audience.genders} /> : <p className="text-sm text-ink-3">Chưa có dữ liệu đối tượng cho kỳ này.</p>}
        </Panel>
        <Panel title="Khu vực (tỉnh / thành)" subtitle="Top 10 theo chỉ số đang chọn. Meta chỉ chia tới cấp region (tỉnh / thành).">
          {region.table.length ? <RegionChart data={region.table} /> : <p className="text-sm text-ink-3">Chưa có dữ liệu khu vực cho kỳ này.</p>}
        </Panel>
      </div>

      <Panel title="Chi tiết đối tượng & khu vực">
        <TableTabs
          initialSort={{ key: "spend", dir: "desc" }}
          tabs={[
            {
              id: "audience",
              label: "Tuổi × giới tính",
              columns: [
                { key: "age", label: "Tuổi", format: "text" },
                { key: "gender", label: "Giới tính", format: "text" },
                ...BREAKDOWN_COLUMNS,
              ],
              rows: audience.table,
              filters: [
                { key: "age", label: "Tuổi" },
                { key: "gender", label: "Giới tính" },
              ],
              csvFileName: csv("doi_tuong"),
            },
            {
              id: "region",
              label: "Khu vực",
              columns: [{ key: "name", label: "Khu vực", format: "text" }, ...BREAKDOWN_COLUMNS],
              rows: region.table,
              searchKeys: ["name"],
              csvFileName: csv("khu_vuc"),
            },
          ]}
        />
      </Panel>

      <Panel title="Theo nhóm mục tiêu">
        <DataTable columns={[{ key: "name", label: "Nhóm mục tiêu", format: "text" }, ...metricCols]} rows={groupTable(d, "meta")} totals={campaigns.totals} initialSort={{ key: "spend", dir: "desc" }} />
      </Panel>

      <Panel
        title="Campaign → Ad set → Ad"
        subtitle={d.standard ? "Reach / Frequency chỉ có ở cấp campaign. Nút \"Cột\" để bật các cột % thay đổi." : "Nút \"Cột\" để bật các cột % thay đổi."}
      >
        <TableTabs
          initialSort={{ key: "spend", dir: "desc" }}
          tabs={[
            {
              id: "campaign",
              label: "Campaign",
              columns: [
                { key: "name", label: "Campaign", format: "text" },
                { key: "group", label: "Nhóm mục tiêu", format: "text" },
                { key: "status", label: "Trạng thái", format: "text" },
                ...withReachColumns(metricCols),
              ],
              rows: campaigns.rows,
              totals: campaigns.totals,
              searchKeys: ["name"],
              filters: [
                { key: "group", label: "Nhóm" },
                { key: "status", label: "Trạng thái" },
              ],
              csvFileName: csv("campaign"),
            },
            {
              id: "adset",
              label: "Ad set",
              columns: [
                { key: "name", label: "Ad set", format: "text" },
                { key: "campaign", label: "Campaign", format: "text" },
                ...metricCols,
              ],
              rows: adsetTable(d),
              totals: campaigns.totals,
              searchKeys: ["name", "campaign"],
              filters: [{ key: "campaign", label: "Campaign" }],
              csvFileName: csv("adset"),
            },
            {
              id: "ad",
              label: "Ad",
              columns: [
                { key: "name", label: "Ad", format: "text" },
                { key: "adset", label: "Ad set", format: "text" },
                { key: "campaign", label: "Campaign", format: "text" },
                ...metricCols,
              ],
              rows: adTable(d),
              totals: campaigns.totals,
              searchKeys: ["name", "adset", "campaign"],
              filters: [{ key: "campaign", label: "Campaign" }],
              csvFileName: csv("ad"),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
