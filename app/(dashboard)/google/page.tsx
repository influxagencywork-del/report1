import { clientConfig } from "@/config/client";
import { DualAxisLineChart } from "@/components/charts/Charts";
import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState, KpiCard, Panel } from "@/components/KpiCard";
import { ReachCards } from "@/components/ReachCards";
import { TableTabs } from "@/components/TableTabs";
import { fetchKeywords, loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { formatMoney } from "@/lib/format";
import { adsetTable, campaignTable, chartSeries, groupTable, keywordTable, periodMetrics } from "@/lib/report";

const METRIC_COLUMNS: Column[] = [
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_change", label: "± Spend", format: "change", metric: "spend", hidden: true },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "link_clicks", label: "Clicks", format: "int" },
  { key: "link_clicks_change", label: "± Clicks", format: "change", metric: "link_clicks", hidden: true },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "cpc_change", label: "± CPC", format: "change", metric: "cpc", hidden: true },
  { key: "video_views_google", label: "Video views", format: "int" },
];

const KEYWORD_COLUMNS: Column[] = [
  { key: "name", label: "Từ khóa", format: "text" },
  { key: "match", label: "Kiểu khớp", format: "text" },
  { key: "campaign", label: "Campaign", format: "text", hidden: true },
  { key: "ad_group", label: "Ad group", format: "text" },
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_share", label: "% Spend", format: "pct" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "clicks", label: "Clicks", format: "int" },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "conversions", label: "Chuyển đổi", format: "num" },
  { key: "conv_rate", label: "Tỉ lệ CĐ", format: "pct" },
  { key: "cost_per_conv", label: "Chi phí / CĐ", format: "money" },
  { key: "quality_score", label: "Điểm CL", format: "int" },
  { key: "flag", label: "Cảnh báo", format: "text" },
];

/** Chèn cột Reach / Frequency ngay sau CPM */
function withReachColumns(cols: Column[]): Column[] {
  const i = cols.findIndex((c) => c.key === "cpm") + 1;
  return [...cols.slice(0, i), { key: "reach", label: "Reach", format: "int" }, { key: "frequency", label: "Frequency", format: "dec" }, ...cols.slice(i)];
}

export default async function GooglePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams, { platform: "google" });
  if (d.scoped.size === 0) return <EmptyState>Không có campaign Google nào khớp bộ lọc hiện tại.</EmptyState>;

  const { cur, change } = periodMetrics(d);
  const { filters } = d;
  const ids = [...d.scoped.values()].map((c) => c.campaign_id);
  const keywords = keywordTable(await fetchKeywords(filters.from, filters.to, ids), d);

  const series = chartSeries(d, d.rows);
  const campaigns = campaignTable(d);
  const metricCols = METRIC_COLUMNS.filter((c) => filters.compare || c.format !== "change");
  const cmp = filters.compare;
  const csv = (level: string) => `google_${level}_${filters.from}_${filters.to}`;

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Google</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Spend" value={cur.spend} format="money" metric="spend" change={change("spend")} compare={cmp} />
        <KpiCard label="Impressions" value={cur.impressions} format="int" metric="impressions" change={change("impressions")} compare={cmp} />
        <ReachCards data={d} />
        <KpiCard label="CPM" value={cur.cpm} format="money" metric="cpm" change={change("cpm")} compare={cmp} />
        <KpiCard label="Clicks" value={cur.link_clicks} format="int" metric="link_clicks" change={change("link_clicks")} compare={cmp} />
        <KpiCard label="CTR" value={cur.ctr} format="pct" metric="ctr" change={change("ctr")} compare={cmp} />
        <KpiCard label="CPC" value={cur.cpc} format="money" metric="cpc" change={change("cpc")} compare={cmp} />
        <KpiCard label="Video views" value={cur.video_views_google} format="int" metric="video_views_google" change={change("video_views_google")} compare={cmp} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Impressions và CPM" subtitle="CPM mỗi điểm = tổng spend ÷ tổng impressions × 1000">
          <DualAxisLineChart
            data={series.map((p) => ({ label: p.label, impressions: p.impressions, cpm: p.cpm }))}
            left={{ key: "impressions", name: "Impressions", color: clientConfig.chartColors.primary, format: "int" }}
            right={{ key: "cpm", name: "CPM", color: clientConfig.chartColors.secondary, format: "money" }}
          />
        </Panel>
        <Panel title="Clicks và CPC" subtitle="CPC mỗi điểm = tổng spend ÷ tổng clicks">
          <DualAxisLineChart
            data={series.map((p) => ({ label: p.label, clicks: p.link_clicks, cpc: p.cpc }))}
            left={{ key: "clicks", name: "Clicks", color: clientConfig.chartColors.primary, format: "int" }}
            right={{ key: "cpc", name: "CPC", color: clientConfig.chartColors.secondary, format: "money" }}
          />
        </Panel>
      </div>

      <Panel
        title="Từ khóa đang chi tiêu"
        subtitle={
          <>
            Chỉ campaign Search. Mặc định sắp theo spend giảm dần.
            {keywords.wasted.count > 0 && (
              <>
                {" "}
                <strong className="text-bad">
                  {keywords.wasted.count} từ khóa tiêu {formatMoney(keywords.wasted.spend)} nhưng 0 chuyển đổi.
                </strong>
              </>
            )}
          </>
        }
      >
        <DataTable
          columns={KEYWORD_COLUMNS}
          rows={keywords.rows}
          totals={keywords.totals}
          initialSort={{ key: "spend", dir: "desc" }}
          searchKeys={["name", "ad_group", "campaign"]}
          filters={[
            { key: "match", label: "Kiểu khớp" },
            { key: "ad_group", label: "Ad group" },
            { key: "flag", label: "Cảnh báo" },
          ]}
          csvFileName={csv("tu_khoa")}
          columnToggle
          emptyText="Không có từ khóa nào trong kỳ / bộ lọc này"
        />
      </Panel>

      <Panel title="Theo nhóm mục tiêu">
        <DataTable columns={[{ key: "name", label: "Nhóm mục tiêu", format: "text" }, ...metricCols]} rows={groupTable(d, "google")} totals={campaigns.totals} initialSort={{ key: "spend", dir: "desc" }} />
      </Panel>

      <Panel title="Campaign → Ad group" subtitle="Nút &quot;Cột&quot; để bật các cột % thay đổi.">
        <TableTabs
          initialSort={{ key: "spend", dir: "desc" }}
          tabs={[
            {
              id: "campaign",
              label: "Campaign",
              columns: [
                { key: "name", label: "Campaign", format: "text" },
                { key: "group", label: "Nhóm mục tiêu", format: "text" },
                { key: "objective_native", label: "Loại", format: "text" },
                { key: "status", label: "Trạng thái", format: "text" },
                ...withReachColumns(metricCols),
              ],
              rows: campaigns.rows,
              totals: campaigns.totals,
              searchKeys: ["name"],
              filters: [
                { key: "group", label: "Nhóm" },
                { key: "objective_native", label: "Loại" },
              ],
              csvFileName: csv("campaign"),
            },
            {
              id: "adgroup",
              label: "Ad group",
              columns: [
                { key: "name", label: "Ad group", format: "text" },
                { key: "campaign", label: "Campaign", format: "text" },
                ...metricCols,
              ],
              rows: adsetTable(d),
              totals: campaigns.totals,
              searchKeys: ["name", "campaign"],
              filters: [{ key: "campaign", label: "Campaign" }],
              csvFileName: csv("adgroup"),
            },
          ]}
        />
      </Panel>
    </div>
  );
}
