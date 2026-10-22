"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clientConfig } from "@/config/client";
import { formatCompact, formatValue, type ValueFormat } from "@/lib/format";

const INK_3 = "#6f6d68";
const GRID = "#e1e0d9";
const AXIS = { fontSize: 11, fill: INK_3 };
const H = 280;

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
  format: ValueFormat;
}

function axisTick(format: ValueFormat) {
  return (v: number) => (format === "pct" ? formatValue(v, "pct") : formatCompact(v));
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null }>;
  label?: string;
  series: SeriesDef[];
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="tabular rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md">
      <div className="mb-1 font-medium text-ink">{label}</div>
      {series.map((s) => {
        const p = payload.find((x) => x.dataKey === s.key);
        return (
          <div key={s.key} className="flex items-center gap-2 text-ink-2">
            <span aria-hidden className="inline-block size-2 rounded-sm" style={{ background: s.color }} />
            <span>{s.name}</span>
            <span className="ml-auto pl-4 font-medium text-ink">{formatValue(p?.value ?? null, s.format)}</span>
          </div>
        );
      })}
    </div>
  );
}

const legendStyle = { fontSize: 12, color: "#52514e", paddingTop: 4 };

/** Cột chồng (vd spend Meta / Google theo ngày) */
export function StackedBarChart({ data, series }: { data: Record<string, number | string | null>[]; series: SeriesDef[] }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="20%">
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(series[0].format)} width={56} />
          <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip series={series} />} />
          <Legend wrapperStyle={legendStyle} iconType="square" iconSize={10} />
          {series.map((s, i) => (
            <Bar
isAnimationActive={false}               key={s.key}
              dataKey={s.key}
              name={s.name}
              stackId="a"
              fill={s.color}
              stroke="#fcfcfb"
              strokeWidth={1}
              radius={i === series.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cột ngang đơn (vd spend theo nhóm mục tiêu) */
export function HorizontalBarChart({ data, format, name }: { data: { label: string; value: number }[]; format: ValueFormat; name: string }) {
  const series: SeriesDef[] = [{ key: "value", name, color: clientConfig.chartColors.primary, format }];
  return (
    <div style={{ height: Math.max(160, data.length * 56 + 40) }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(format)} />
          <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: "#52514e" }} tickLine={false} axisLine={false} width={110} />
          <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip series={series} />} />
          <Bar isAnimationActive={false} dataKey="value" name={name} fill={clientConfig.chartColors.primary} radius={[0, 4, 4, 0]} maxBarSize={32} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 2 đường, 2 trục Y (trái: khối lượng, phải: chi phí) */
export function DualAxisLineChart({ data, left, right }: { data: Record<string, number | string | null>[]; left: SeriesDef; right: SeriesDef }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(left.format)} width={56} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(right.format)} width={56} />
          <Tooltip cursor={{ stroke: INK_3, strokeDasharray: "3 3" }} content={<ChartTooltip series={[left, right]} />} />
          <Legend wrapperStyle={legendStyle} iconType="plainline" formatter={(v, e) => `${v} (trục ${e.dataKey === left.key ? "trái" : "phải"})`} />
          <Line isAnimationActive={false} yAxisId="l" type="monotone" dataKey={left.key} name={left.name} stroke={left.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
          <Line isAnimationActive={false} yAxisId="r" type="monotone" dataKey={right.key} name={right.name} stroke={right.color} strokeWidth={2} strokeDasharray="6 3" dot={false} activeDot={{ r: 4 }} connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Cột (trục trái) + đường (trục phải) */
export function BarLineChart({ data, bar, line }: { data: Record<string, number | string | null>[]; bar: SeriesDef; line: SeriesDef }) {
  return (
    <div style={{ height: H }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
          <YAxis yAxisId="l" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(bar.format)} width={48} />
          <YAxis yAxisId="r" orientation="right" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={axisTick(line.format)} width={56} />
          <Tooltip cursor={{ fill: "rgba(11,11,11,0.04)" }} content={<ChartTooltip series={[bar, line]} />} />
          <Legend wrapperStyle={legendStyle} formatter={(v, e) => `${v} (trục ${e.dataKey === bar.key ? "trái" : "phải"})`} />
          <Bar isAnimationActive={false} yAxisId="l" dataKey={bar.key} name={bar.name} fill={bar.color} radius={[4, 4, 0, 0]} maxBarSize={32} />
          <Line isAnimationActive={false} yAxisId="r" type="monotone" dataKey={line.key} name={line.name} stroke={line.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} connectNulls />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Biểu đồ tròn (donut) tỉ trọng, kèm chú thích có % và giá trị */
export function DonutChart({
  data,
  format,
  centerLabel,
}: {
  data: { name: string; value: number; color: string }[];
  format: ValueFormat;
  centerLabel: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const shown = data.filter((d) => d.value > 0);
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-52 w-52 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={shown}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="100%"
              paddingAngle={shown.length > 1 ? 2 : 0}
              stroke="#fcfcfb"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {shown.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div className="tabular rounded-lg border border-line bg-white px-3 py-2 text-xs shadow-md">
                    <div className="font-medium text-ink">{payload[0].name}</div>
                    <div className="text-ink-2">
                      {formatValue(Number(payload[0].value), format)} · {formatValue(total ? Number(payload[0].value) / total : null, "pct")}
                    </div>
                  </div>
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-xs text-ink-3">{centerLabel}</div>
            <div className="tabular text-sm font-semibold">{formatCompact(total)}</div>
          </div>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {data.map((d) => (
          <li key={d.name} className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="text-ink-2">{d.name}</span>
            <span className="tabular ml-auto text-xs text-ink-3">{formatValue(d.value, format)}</span>
            <span className="tabular w-16 text-right font-semibold">{formatValue(total ? d.value / total : null, "pct")}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
