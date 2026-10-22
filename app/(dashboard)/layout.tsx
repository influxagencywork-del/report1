import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FilterBar } from "@/components/FilterBar";
import { Logo } from "@/components/Logo";
import { Nav } from "@/components/Nav";
import { SyncBanner, SyncFooter } from "@/components/SyncStatus";
import { getCampaigns, getSyncStatus, getUser, isAllowed } from "@/lib/data";
import { campaignKey } from "@/lib/filters";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!(await isAllowed())) redirect("/no-access");

  const [campaigns, sync] = await Promise.all([getCampaigns(), getSyncStatus()]);
  const options = campaigns.map((c) => ({
    key: campaignKey(c.platform, c.campaign_id),
    name: c.campaign_name,
    platform: c.platform,
    group: c.objective_group,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <SyncBanner status={sync} />
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 pt-3">
          <Logo />
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-ink-3 sm:inline">{user.email}</span>
            <form action="/auth/signout" method="post">
              <button className="rounded-md px-2 py-1 text-ink-2 hover:bg-page hover:text-ink">Đăng xuất</button>
            </form>
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4">
          <Suspense>
            <Nav />
          </Suspense>
        </div>
      </header>
      <div className="z-20 border-b border-line bg-page/95 backdrop-blur lg:sticky lg:top-0">
        <div className="mx-auto max-w-7xl px-4 py-3">
          <Suspense>
            <FilterBar campaigns={options} />
          </Suspense>
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">{children}</main>
      <SyncFooter status={sync} />
    </div>
  );
}
