import { Suspense } from "react";
import { Logo } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-lg font-semibold">Đăng nhập</h1>
        <p className="mt-1 text-sm text-ink-2">Nhập email được cấp quyền, chúng tôi sẽ gửi link đăng nhập.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
