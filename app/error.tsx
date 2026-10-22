"use client";

import { useEffect } from "react";

/** Trang lỗi chung (vd mất kết nối Supabase). Không lộ chi tiết lỗi cho người xem. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 text-center shadow-sm">
        <h1 className="text-lg font-semibold">Không tải được dữ liệu</h1>
        <p className="mt-2 text-sm text-ink-2">Kết nối tới máy chủ dữ liệu đang gặp sự cố. Vui lòng thử lại sau ít phút.</p>
        {error.digest && <p className="mt-2 text-xs text-ink-3">Mã lỗi: {error.digest}</p>}
        <button type="button" onClick={reset} className="mt-5 w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90">
          Thử lại
        </button>
      </div>
    </main>
  );
}
