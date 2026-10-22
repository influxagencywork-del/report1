import { clientConfig } from "@/config/client";
import { formatInt, formatPct } from "@/lib/format";
import type { FunnelStep } from "@/lib/metrics";

/**
 * Phễu dạng thanh ngang. Độ dài thanh theo thang log vì các bước chênh nhau hàng trăm lần
 * (thang tuyến tính sẽ khiến bước cuối gần như vô hình). Số thật luôn hiển thị bên cạnh.
 */
export function Funnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);
  const width = (v: number) => (v <= 0 ? 0 : Math.max(4, (Math.log10(v + 1) / Math.log10(max + 1)) * 100));
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <li key={s.key}>
          {i > 0 && (
            <div className="tabular flex items-center gap-2 py-1.5 pl-2 text-xs text-ink-2">
              <span aria-hidden>↓</span>
              <span>
                Chuyển đổi <strong className="text-ink">{formatPct(s.rateFromPrev)}</strong>
              </span>
              <span className="text-ink-3">· rơi rụng {formatPct(s.dropFromPrev)}</span>
            </div>
          )}
          <div className="flex items-center gap-3">
            <div className="w-24 shrink-0 text-sm text-ink-2">{s.label}</div>
            <div className="h-8 flex-1">
              <div className="h-full rounded-r-md" style={{ width: `${width(s.value)}%`, background: clientConfig.chartColors.primary, opacity: 1 - i * 0.2 }} />
            </div>
            <div className="tabular w-24 shrink-0 text-right font-semibold">{formatInt(s.value)}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
