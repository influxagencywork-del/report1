import Image from "next/image";
import { clientConfig } from "@/config/client";

/** Logo + tên client lấy từ config. Không có logo → hiện chữ viết tắt. */
export function Logo({ showName = true }: { showName?: boolean }) {
  const { logo, name, tagline } = clientConfig;
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(-3)
    .toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-3">
      {logo.src ? (
        <Image src={logo.src} alt={logo.alt} width={logo.width} height={logo.height} className="shrink-0" priority />
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand text-sm font-semibold text-brand-fg">
          {initials}
        </span>
      )}
      {showName && (
        <div className="min-w-0 leading-tight">
          <div className="truncate font-semibold">{name}</div>
          {tagline && <div className="truncate text-xs text-ink-3">{tagline}</div>}
        </div>
      )}
    </div>
  );
}
