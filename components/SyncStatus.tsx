import { clientConfig } from "@/config/client";
import type { SyncStatus } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { PLATFORM_LABEL } from "@/lib/metrics";

/** Banner cảnh báo khi lần sync thành công gần nhất của 1 nền tảng cũ hơn ngưỡng */
export function SyncBanner({ status }: { status: SyncStatus }) {
  const stale = status.perPlatform.filter((p) => p.stale);
  if (!stale.length) return null;
  return (
    <div role="alert" className="border-b border-[#f3d48a] bg-[#fff6e0] text-sm text-[#5c4100]">
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-2">
        <svg aria-hidden viewBox="0 0 20 20" className="mt-0.5 size-4 shrink-0 text-[#b07a00]">
          <path fill="currentColor" d="M10 2 1 18h18L10 2Zm-1 6h2v5H9V8Zm0 6h2v2H9v-2Z" />
        </svg>
        <div>
          <strong>Data có thể chưa cập nhật.</strong>{" "}
          {stale.map((p, i) => (
            <span key={p.platform}>
              {i > 0 && "; "}
              {PLATFORM_LABEL[p.platform]}: lần sync thành công gần nhất{" "}
              {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "chưa có"} (quá {clientConfig.syncStaleHours} giờ)
              {p.lastError && <> — lỗi gần nhất: <code className="text-xs">{p.lastError}</code></>}
            </span>
          ))}
          .
        </div>
      </div>
    </div>
  );
}

export function SyncFooter({ status }: { status: SyncStatus }) {
  return (
    <footer className="border-t border-line bg-surface text-xs text-ink-3">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
        <span>
          Data cập nhật lần cuối: <strong className="text-ink-2">{status.lastSuccessAt ? formatDateTime(status.lastSuccessAt) : "chưa có"}</strong>
        </span>
        {status.perPlatform.map((p) => (
          <span key={p.platform}>
            {PLATFORM_LABEL[p.platform]}: {p.lastSuccessAt ? formatDateTime(p.lastSuccessAt) : "chưa có"}
            {p.stale && <span className="text-bad"> (quá hạn)</span>}
          </span>
        ))}
        <span className="ml-auto">Múi giờ {clientConfig.timezone} · Tiền tệ {clientConfig.currency}</span>
      </div>
    </footer>
  );
}
