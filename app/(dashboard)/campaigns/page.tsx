import { DataTable, type Column } from "@/components/DataTable";
import { EmptyState, Panel } from "@/components/KpiCard";
import { loadDashboard } from "@/lib/data";
import type { SearchParams } from "@/lib/filters";
import { campaignTable } from "@/lib/report";

const COLUMNS: Column[] = [
  { key: "name", label: "Campaign", format: "text" },
  { key: "platform", label: "Nền tảng", format: "text" },
  { key: "group", label: "Nhóm mục tiêu", format: "text" },
  { key: "objective_native", label: "Mục tiêu gốc", format: "text", hidden: true },
  { key: "status", label: "Trạng thái", format: "text" },
  { key: "campaign_id", label: "Campaign ID", format: "text", hidden: true },
  { key: "spend", label: "Spend", format: "money" },
  { key: "spend_change", label: "± Spend", format: "change", metric: "spend" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "impressions_change", label: "± Impr.", format: "change", metric: "impressions", hidden: true },
  { key: "reach", label: "Reach", format: "int" },
  { key: "frequency", label: "Frequency", format: "dec" },
  { key: "cpm", label: "CPM", format: "money" },
  { key: "cpm_change", label: "± CPM", format: "change", metric: "cpm", hidden: true },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "link_clicks_change", label: "± Clicks", format: "change", metric: "link_clicks", hidden: true },
  { key: "ctr", label: "CTR", format: "pct" },
  { key: "cpc", label: "CPC", format: "money" },
  { key: "cpc_change", label: "± CPC", format: "change", metric: "cpc", hidden: true },
  { key: "video_views_meta", label: "Video views Meta", format: "int" },
  { key: "video_views_google", label: "Video views Google", format: "int" },
  { key: "mess", label: "Mess", format: "int" },
  { key: "mess_change", label: "± Mess", format: "change", metric: "mess", hidden: true },
  { key: "cost_per_mess", label: "Cost per mess", format: "money" },
  { key: "cost_per_mess_change", label: "± Cost/mess", format: "change", metric: "cost_per_mess", hidden: true },
];

export default async function CampaignsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const d = await loadDashboard(await searchParams);
  if (d.scoped.size === 0) return <EmptyState>Không có campaign nào khớp bộ lọc.</EmptyState>;

  const { filters } = d;
  // Gồm cả campaign không phát sinh data trong kỳ để không "mất" campaign khi xuất CSV
  const table = campaignTable(d, { includeEmpty: true });
  const columns = COLUMNS.filter((c) => filters.compare || c.format !== "change");

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold">Chi tiết campaign</h1>
      <Panel
        title="Tất cả campaign"
        subtitle={
          <>
            Bấm tiêu đề cột để sắp xếp. Nút &quot;Cột&quot; để bật các cột % thay đổi.{" "}
            {d.standard ? "Reach tách theo nền tảng: dòng Tổng Meta / Tổng Google = cộng reach các campaign (không khử trùng người xem)." : "Reach / Frequency chỉ có cho kỳ chuẩn."} File CSV xuất theo đúng bộ lọc và cột đang hiển thị.
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={table.rows}
          totals={table.totals}
          initialSort={{ key: "spend", dir: "desc" }}
          searchKeys={["name", "campaign_id"]}
          filters={[
            { key: "platform", label: "Nền tảng" },
            { key: "group", label: "Nhóm" },
            { key: "status", label: "Trạng thái" },
          ]}
          csvFileName={`campaigns_${filters.from}_${filters.to}`}
          columnToggle
        />
      </Panel>
    </div>
  );
}
