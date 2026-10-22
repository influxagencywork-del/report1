"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState(params.get("error") === "link" ? "Link đăng nhập không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại." : "");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setState("sending");
    setMessage("");
    const next = params.get("next") ?? "/";
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        // Không tự tạo user: chỉ người đã được thêm (npm run add-user) mới nhận được link
        shouldCreateUser: false,
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setState("error");
      setMessage(
        /signups not allowed|not found|not allowed/i.test(error.message)
          ? "Email này chưa được cấp quyền xem báo cáo. Vui lòng liên hệ quản trị viên."
          : /rate limit|security purposes/i.test(error.message)
            ? "Bạn vừa yêu cầu link. Vui lòng đợi một chút rồi thử lại."
            : `Không gửi được link: ${error.message}`,
      );
      return;
    }
    setState("sent");
  }

  if (state === "sent") {
    return (
      <div role="status" className="mt-5 rounded-lg bg-page p-4 text-sm">
        Đã gửi link đăng nhập tới <strong>{email}</strong>. Mở email và bấm vào link để vào dashboard.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-5 space-y-3">
      <label className="block text-sm font-medium" htmlFor="email">
        Email
      </label>
      <input
        id="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        placeholder="ten@congty.vn"
      />
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-fg hover:opacity-90 disabled:opacity-60"
      >
        {state === "sending" ? "Đang gửi…" : "Gửi link đăng nhập"}
      </button>
      {message && (
        <p role="alert" className="text-sm text-bad">
          {message}
        </p>
      )}
    </form>
  );
}
