"use client";

import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { clientConfig } from "@/config/client";
import { formatCompact, formatValue, type ValueFormat } from "@/lib/format";

type MetricKey = "spend" | "impressions" | "link_clicks" | "mess";
const METRICS: { key: MetricKey; label: string; format: ValueFormat }[] = [
  { key: "spend", label: "Spend", format: "money" },
  { key: "impressions", label: "Impressions", format: "int" },
  { key: "link_clicks", label: "Link clicks", format: "int" },
  { key: "mess", label: "Mess", format: "int" },
];

const GRID = "#e1e0d9";
const AXIS = { fontSize: 11, fill: "#6f6d68" };

/** Màu theo giới tính: 2 màu khác tông + xám trung tính cho "không rõ" */
const GENDER_COLOR: Record<string, string> = { female: "#2a78d6", male: "#1baf7a", unknown: "#c3c2b7" };
const GENDER_LABEL: Record<string, string> = { female: "Nữ", male: "Nam", unknown: "Không rõ" };

function MetricToggle({ value, onChange }: { value: MetricKey; onChange: (k: MetricKey) => void }) {
  return (
    <div role="group" aria-label="Chỉ số" className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs">
      {METRICS.map((m) => (
        <button
          key={m.key}
          type="button"
          aria-pressed={value === m.key}
          onClick={() => onChange(m.key)}
          className={`rounded-md px-2.5 py-1 ${value === m.key ? "bg-ink font-medium text-white" : "text-ink-2 hover:text-ink"}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Cột theo nhóm tuổi, chồng theo giới tính */
export function AudienceChart({ data, genders }: { data: Record<string, string | number | null>[]; genders: string[] }) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const fmt = METRICS.find((m) => m.key === metric)!.format;
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <MetricToggle value={metric} onChange={setMetric} />
      </div>
      <div style={{ height: 280 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} width={56} />
            <Tooltip
              cursor={{ fill: "rgba(11,11,11,0.04)" }}
              formatter={(v: number, name: string) => [formatValue(v, fmt), name]}
              labelFormatter={(l) => `Tuổi ${l}`}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRID }}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "#52514e" }} iconType="square" iconSize={10} />
            {genders.map((g, i) => (
              <Bar
                key={g}
                dataKey={`${g}_${metric}`}
                name={GENDER_LABEL[g] ?? g}
                stackId="a"
                fill={GENDER_COLOR[g] ?? "#898781"}
                stroke="#fcfcfb"
                strokeWidth={1}
                radius={i === genders.length - 1 ? [4, 4, 0, 0] : 0}
                maxBarSize={48}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Cột ngang theo khu vực, top N theo chỉ số đang chọn */
export function RegionChart({ data, top = 10 }: { data: Record<string, string | number | null>[]; top?: number }) {
  const [metric, setMetric] = useState<MetricKey>("spend");
  const fmt = METRICS.find((m) => m.key === metric)!.format;
  const rows = [...data]
    .map((r) => ({ label: String(r.name), value: Number(r[metric] ?? 0) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, top);
  return (
    <div>
      <div className="mb-2 flex justify-end">
        <MetricToggle value={metric} onChange={setMetric} />
      </div>
      <div style={{ height: Math.max(180, rows.length * 32 + 30) }}>
        <ResponsiveContainer>
          <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 24, left: 8, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid stroke={GRID} horizontal={false} />
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCompact(v)} />
            <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#52514e" }} tickLine={false} axisLine={false} width={150} />
            <Tooltip
              cursor={{ fill: "rgba(11,11,11,0.04)" }}
              formatter={(v: number) => [formatValue(v, fmt), METRICS.find((m) => m.key === metric)!.label]}
              contentStyle={{ fontSize: 12, borderRadius: 8, borderColor: GRID }}
            />
            <Bar dataKey="value" fill={clientConfig.chartColors.primary} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
