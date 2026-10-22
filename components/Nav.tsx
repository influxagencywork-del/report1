"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/", label: "Tổng quan" },
  { href: "/awareness", label: "Awareness" },
  { href: "/traffic", label: "Traffic" },
  { href: "/lead", label: "Lead" },
  { href: "/campaigns", label: "Chi tiết campaign" },
];

/** Menu giữ nguyên bộ lọc (query string) khi chuyển trang */
export function Nav() {
  const pathname = usePathname();
  const qs = useSearchParams().toString();
  return (
    <nav aria-label="Trang báo cáo" className="-mb-px flex gap-1 overflow-x-auto">
      {LINKS.map((l) => {
        const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={qs ? `${l.href}?${qs}` : l.href}
            aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${active ? "border-brand font-semibold text-ink" : "border-transparent text-ink-2 hover:text-ink"}`}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
