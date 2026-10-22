"use client";

import { useEffect, useId, useRef, useState } from "react";

export interface Option {
  value: string;
  label: string;
  hint?: string;
}

/** Dropdown chọn nhiều. Rỗng = "Tất cả". */
export function MultiSelect({
  label,
  options,
  value,
  onChange,
  searchable = false,
  width = "w-72",
}: {
  label: string;
  options: Option[];
  value: string[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = new Set(value);
  const summary =
    value.length === 0
      ? "Tất cả"
      : value.length === 1
        ? (options.find((o) => o.value === value[0])?.label ?? "1 đã chọn")
        : `${value.length} đã chọn`;
  const shown = q ? options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())) : options;

  const toggle = (v: string) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    onChange(options.map((o) => o.value).filter((x) => next.has(x)));
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 max-w-56 items-center gap-1.5 rounded-lg border px-3 text-sm hover:bg-page ${value.length ? "border-brand/60 bg-brand/5" : "border-line bg-white"}`}
      >
        <span className="text-ink-3">{label}:</span>
        <span className="truncate font-medium">{summary}</span>
        <svg aria-hidden viewBox="0 0 16 16" className="size-3.5 shrink-0 text-ink-3">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>
      {open && (
        <div id={id} className={`absolute left-0 z-30 mt-1 ${width} max-w-[calc(100vw-2rem)] rounded-lg border border-line bg-white p-2 shadow-lg`}>
          {searchable && (
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm…"
              className="mb-2 w-full rounded-md border border-line px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
          )}
          <ul role="listbox" aria-multiselectable className="max-h-72 overflow-auto">
            {shown.map((o) => (
              <li key={o.value}>
                <label className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-page">
                  <input type="checkbox" className="mt-0.5 accent-brand" checked={selected.has(o.value)} onChange={() => toggle(o.value)} />
                  <span className="min-w-0">
                    <span className="block">{o.label}</span>
                    {o.hint && <span className="block text-xs text-ink-3">{o.hint}</span>}
                  </span>
                </label>
              </li>
            ))}
            {shown.length === 0 && <li className="px-2 py-1.5 text-sm text-ink-3">Không có lựa chọn</li>}
          </ul>
          {value.length > 0 && (
            <button type="button" onClick={() => onChange([])} className="mt-1 w-full rounded-md px-2 py-1.5 text-left text-sm text-brand hover:bg-page">
              Bỏ chọn tất cả
            </button>
          )}
        </div>
      )}
    </div>
  );
}
