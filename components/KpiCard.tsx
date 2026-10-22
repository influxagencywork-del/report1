import type { ReactNode } from "react";
import { changeIsGood } from "@/lib/metrics";
import { formatChange, formatValue, type ValueFormat } from "@/lib/format";

export function ChangeBadge({ metric, change }: { metric: string; change: number | null }) {
  const good = changeIsGood(metric, change);
  const color = good === null ? "text-ink-3" : good ? "text-good" : "text-bad";
  const arrow = change === null || change === 0 ? "" : change > 0 ? "▲" : "▼";
  return (
    <span className={`tabular inline-flex items-center gap-0.5 text-xs font-medium ${color}`} title="So với kỳ trước">
      {arrow && <span aria-hidden className="text-[10px]">{arrow}</span>}
      {formatChange(change)}
      <span className="sr-only">{good === null ? "" : good ? " (tốt hơn)" : " (kém hơn)"}</span>
    </span>
  );
}

export function KpiCard({
  label,
  value,
  format,
  metric,
  change,
  compare,
  sub,
  display,
}: {
  label: string;
  value: number | null;
  format: ValueFormat;
  /** Khóa metric để biết tăng là tốt hay xấu */
  metric: string;
  /** % thay đổi so với kỳ trước */
  change?: number | null;
  compare: boolean;
  sub?: ReactNode;
  /** Thay giá trị số bằng nội dung khác (vd "Chỉ có cho kỳ chuẩn") */
  display?: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line bg-surface p-4">
      <div className="text-sm text-ink-2">{label}</div>
      <div className="mt-1 truncate text-2xl font-semibold tracking-tight">{display ?? formatValue(value, format)}</div>
      <div className="mt-1 flex min-h-5 flex-wrap items-center gap-x-2 text-xs text-ink-3">
        {compare && display === undefined && (
          <>
            <ChangeBadge metric={metric} change={change ?? null} />
            <span>so với kỳ trước</span>
          </>
        )}
      </div>
      {sub && <div className="mt-2 border-t border-line pt-2 text-xs text-ink-2">{sub}</div>}
    </div>
  );
}

export function Panel({ title, subtitle, children, actions }: { title: string; subtitle?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-ink-2">{children}</div>;
}
