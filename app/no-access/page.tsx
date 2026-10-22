import { Logo } from "@/components/Logo";
import { getUser } from "@/lib/data";

export default async function NoAccessPage() {
  const user = await getUser();
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-surface p-6 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-lg font-semibold">Chưa có quyền truy cập</h1>
        <p className="mt-2 text-sm text-ink-2">
          Tài khoản <strong>{user?.email ?? "này"}</strong> chưa được cấp quyền xem báo cáo. Vui lòng liên hệ quản trị viên.
        </p>
        <form action="/auth/signout" method="post" className="mt-5">
          <button className="w-full rounded-lg border border-line px-3 py-2 text-sm hover:bg-page">Đăng xuất</button>
        </form>
      </div>
    </main>
  );
}
