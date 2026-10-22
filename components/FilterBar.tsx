"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clientConfig } from "@/config/client";
import { todayInTz } from "@/lib/dates";
import { filtersToQuery, GRAN_LABEL, parseFilters, RANGE_LABEL, RANGE_PRESETS, type Filters, type RangePreset } from "@/lib/filters";
import { OBJECTIVE_GROUPS, PLATFORM_LABEL, PLATFORMS, type Granularity, type ObjectiveGroup, type Platform } from "@/lib/metrics";
import { formatDate } from "@/lib/format";
import { MultiSelect } from "./MultiSelect";

export interface CampaignOption {
  key: string;
  name: string;
  platform: Platform;
  group: ObjectiveGroup;
}

const GRANS: Granularity[] = ["day", "week", "month"];

export function FilterBar({ campaigns }: { campaigns: CampaignOption[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const today = todayInTz(clientConfig.timezone);
  const f = useMemo(() => parseFilters(Object.fromEntries(sp.entries()), today, clientConfig.defaultRange), [sp, today]);

  // Ngày tùy chọn: sửa xong mới áp dụng
  const [customFrom, setCustomFrom] = useState(f.from);
  const [customTo, setCustomTo] = useState(f.to);
  const [showCustom, setShowCustom] = useState(f.range === "custom");
  useEffect(() => {
    setCustomFrom(f.from);
    setCustomTo(f.to);
    setShowCustom(f.range === "custom");
  }, [f.from, f.to, f.range]);

  function update(patch: Partial<Filters>) {
    const next = { ...f, ...patch };
    // Bỏ campaign không còn khớp nền tảng / nhóm đã chọn
    next.campaigns = next.campaigns.filter((k) => {
      const c = campaigns.find((x) => x.key === k);
      return c && (!next.platforms.length || next.platforms.includes(c.platform)) && (!next.groups.length || next.groups.includes(c.group));
    });
    // Đổi khoảng thời gian → để độ chi tiết tự chọn lại theo độ dài kỳ
    const query = filtersToQuery({ ...next, gran: "range" in patch && !("gran" in patch) ? undefined : next.gran });
    startTransition(() => router.replace(`${pathname}?${query}`, { scroll: false }));
  }

  function setRange(range: RangePreset) {
    if (range === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    update({ range });
  }

  const campaignOptions = campaigns
    .filter((c) => (!f.platforms.length || f.platforms.includes(c.platform)) && (!f.groups.length || f.groups.includes(c.group)))
    .map((c) => ({ value: c.key, label: c.name, hint: `${PLATFORM_LABEL[c.platform]} · ${c.group}` }));

  const isDefault = !sp.toString() || sp.toString() === `range=${clientConfig.defaultRange}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Khoảng thời gian" className="flex h-9 max-w-full overflow-x-auto rounded-lg border border-line bg-white text-sm">
          {RANGE_PRESETS.map((r) => {
            const active = r === "custom" ? showCustom : !showCustom && f.range === r;
            return (
              <button
                key={r}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(r)}
                className={`shrink-0 whitespace-nowrap border-r border-line px-3 last:border-r-0 ${active ? "bg-brand font-medium text-brand-fg" : "hover:bg-page"}`}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>

        {showCustom && (
          <form
            className="flex items-center gap-1.5 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              update({ range: "custom", from: customFrom, to: customTo });
            }}
          >
            <input type="date" aria-label="Từ ngày" value={customFrom} max={today} onChange={(e) => setCustomFrom(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2" />
            <span className="text-ink-3">→</span>
            <input type="date" aria-label="Đến ngày" value={customTo} max={today} onChange={(e) => setCustomTo(e.target.value)} className="h-9 rounded-lg border border-line bg-white px-2" />
            <button type="submit" className="h-9 rounded-lg bg-brand px-3 font-medium text-brand-fg hover:opacity-90">
              Áp dụng
            </button>
          </form>
        )}

        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 text-sm">
          <input type="checkbox" className="accent-brand" checked={f.compare} onChange={(e) => update({ compare: e.target.checked })} />
          So sánh kỳ trước
        </label>

        <div role="group" aria-label="Độ chi tiết" className="flex h-9 max-w-full overflow-x-auto rounded-lg border border-line bg-white text-sm">
          {GRANS.map((g) => (
            <button
              key={g}
              type="button"
              aria-pressed={f.gran === g}
              onClick={() => update({ gran: g })}
              className={`shrink-0 whitespace-nowrap border-r border-line px-3 last:border-r-0 ${f.gran === g ? "bg-ink font-medium text-white" : "hover:bg-page"}`}
            >
              {GRAN_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <MultiSelect
          label="Nền tảng"
          width="w-48"
          options={PLATFORMS.map((p) => ({ value: p, label: PLATFORM_LABEL[p] }))}
          value={f.platforms}
          onChange={(v) => update({ platforms: v.length === PLATFORMS.length ? [] : (v as Platform[]) })}
        />
        <MultiSelect
          label="Nhóm mục tiêu"
          width="w-56"
          options={OBJECTIVE_GROUPS.map((g) => ({ value: g, label: g }))}
          value={f.groups}
          onChange={(v) => update({ groups: v.length === OBJECTIVE_GROUPS.length ? [] : (v as ObjectiveGroup[]) })}
        />
        <MultiSelect label="Campaign" width="w-80" searchable options={campaignOptions} value={f.campaigns} onChange={(v) => update({ campaigns: v })} />

        <span className="tabular ml-auto text-xs text-ink-3" aria-live="polite">
          {pending ? (
            "Đang tải…"
          ) : (
            <>
              {formatDate(f.from)} – {formatDate(f.to)}
              {f.compare && (
                <>
                  {" "}· so với {formatDate(f.prevFrom)} – {formatDate(f.prevTo)}
                </>
              )}
            </>
          )}
        </span>
        {!isDefault && (
          <button type="button" onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))} className="text-xs text-brand hover:underline">
            Đặt lại
          </button>
        )}
      </div>
    </div>
  );
}
