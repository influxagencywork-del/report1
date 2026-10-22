"use client";

import { useMemo, useState } from "react";
import { formatValue, type ValueFormat } from "@/lib/format";
import { ChangeBadge } from "./KpiCard";

export type Cell = string | number | null;
export type Row = Record<string, Cell>;

export interface Column {
  key: string;
  label: string;
  /** "change" = % thay đổi (tô xanh/đỏ theo `metric`) */
  format: ValueFormat | "change";
  metric?: string;
  /** Ẩn mặc định, bật qua nút "Cột" */
  hidden?: boolean;
  /** Không xuất ra CSV */
  noCsv?: boolean;
}

export interface TableFilter {
  key: string;
  label: string;
}

function compare(a: Cell, b: Cell): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1; // null luôn ở cuối
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "vi");
}

function csvEscape(v: Cell): string {
  if (v === null) return "";
  const s = typeof v === "number" ? String(Math.round(v * 10000) / 10000) : v;
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function DataTable({
  columns,
  rows,
  totals,
  initialSort,
  searchKeys,
  filters = [],
  csvFileName,
  columnToggle = false,
  emptyText = "Không có dữ liệu trong kỳ này",
}: {
  columns: Column[];
  rows: Row[];
  /** 1 hoặc nhiều dòng tổng (vd Tổng Meta, Tổng Google, Tổng) — không bị sắp xếp */
  totals?: Row | Row[];
  initialSort?: { key: string; dir: "asc" | "desc" };
  /** Cột dùng cho ô tìm kiếm */
  searchKeys?: string[];
  /** Cột có dropdown lọc theo giá trị */
  filters?: TableFilter[];
  csvFileName?: string;
  columnToggle?: boolean;
  emptyText?: string;
}) {
  const [sort, setSort] = useState(initialSort ?? { key: columns[0].key, dir: "asc" as const });
  const [q, setQ] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState(() => new Set(columns.filter((c) => !c.hidden).map((c) => c.key)));
  const [showCols, setShowCols] = useState(false);

  const shownCols = columns.filter((c) => visible.has(c.key));
  const totalRows = totals ? (Array.isArray(totals) ? totals : [totals]) : [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      for (const [k, v] of Object.entries(filterValues)) if (v && String(r[k]) !== v) return false;
      if (needle && searchKeys) return searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle));
      return true;
    });
  }, [rows, q, filterValues, searchKeys]);

  const sorted = useMemo(() => {
    const s = [...filtered].sort((a, b) => compare(a[sort.key], b[sort.key]));
    if (sort.dir === "desc") {
      // Giữ null ở cuối khi đảo chiều
      const nonNull = s.filter((r) => r[sort.key] !== null).reverse();
      return [...nonNull, ...s.filter((r) => r[sort.key] === null)];
    }
    return s;
  }, [filtered, sort]);

  function toggleSort(key: string) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));
  }

  function exportCsv() {
    const cols = shownCols.filter((c) => !c.noCsv);
    const lines = [cols.map((c) => csvEscape(c.label)).join(",")];
    for (const r of sorted) lines.push(cols.map((c) => csvEscape(r[c.key])).join(","));
    // BOM để Excel đọc đúng tiếng Việt
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${csvFileName ?? "export"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const hasToolbar = !!searchKeys || filters.length > 0 || !!csvFileName || columnToggle;

  return (
    <div className="min-w-0">
      {hasToolbar && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {searchKeys && (
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Tìm theo tên…"
              aria-label="Tìm trong bảng"
              className="h-9 w-56 rounded-lg border border-line bg-white px-3 text-sm outline-none focus:border-brand"
            />
          )}
          {filters.map((f) => {
            const opts = [...new Set(rows.map((r) => r[f.key]).filter((v): v is string | number => v !== null && v !== ""))].map(String).sort();
            return (
              <select
                key={f.key}
                aria-label={f.label}
                value={filterValues[f.key] ?? ""}
                onChange={(e) => setFilterValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="h-9 rounded-lg border border-line bg-white px-2 text-sm"
              >
                <option value="">{f.label}: Tất cả</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            );
          })}
          <span className="text-xs text-ink-3">{sorted.length} dòng</span>
          <div className="ml-auto flex items-center gap-2">
            {columnToggle && (
              <div className="relative">
                <button type="button" onClick={() => setShowCols((s) => !s)} aria-expanded={showCols} className="h-9 rounded-lg border border-line bg-white px-3 text-sm hover:bg-page">
                  Cột
                </button>
                {showCols && (
                  <div className="absolute right-0 z-30 mt-1 w-56 rounded-lg border border-line bg-white p-2 shadow-lg">
                    {columns.map((c, i) => (
                      <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-page">
                        <input
                          type="checkbox"
                          className="accent-brand"
                          disabled={i === 0}
                          checked={visible.has(c.key)}
                          onChange={() =>
                            setVisible((v) => {
                              const n = new Set(v);
                              if (n.has(c.key)) n.delete(c.key);
                              else n.add(c.key);
                              return n;
                            })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}
            {csvFileName && (
              <button type="button" onClick={exportCsv} className="h-9 rounded-lg bg-brand px-3 text-sm font-medium text-brand-fg hover:opacity-90">
                Xuất CSV
              </button>
            )}
          </div>
        </div>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-line">
        <table className="tabular w-full min-w-max border-collapse text-sm">
          <thead className="bg-page text-xs text-ink-2">
            <tr>
              {shownCols.map((c, i) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                    className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${i === 0 ? "sticky left-0 bg-page text-left" : c.format === "text" ? "text-left" : "text-right"}`}
                  >
                    <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-ink">
                      {c.label}
                      <span aria-hidden className={active ? "text-ink" : "text-transparent"}>
                        {sort.dir === "asc" ? "↑" : "↓"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, ri) => (
              <tr key={ri} className="border-b border-line last:border-b-0 hover:bg-page/60">
                {shownCols.map((c, i) => (
                  <td key={c.key} className={`whitespace-nowrap px-3 py-2 ${i === 0 ? "sticky left-0 max-w-80 truncate bg-surface text-left font-medium" : c.format === "text" ? "text-left" : "text-right"}`}>
                    {c.format === "change" ? (
                      <ChangeBadge metric={c.metric ?? ""} change={r[c.key] as number | null} />
                    ) : (
                      formatValue(r[c.key], c.format)
                    )}
                  </td>
                ))}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={shownCols.length} className="px-3 py-8 text-center text-ink-3">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
          {totalRows.length > 0 && sorted.length > 0 && (
            <tfoot className="bg-page font-semibold">
              {totalRows.map((t, ti) => (
                <tr key={ti} className={ti === totalRows.length - 1 ? "" : "font-medium text-ink-2"}>
                  {shownCols.map((c, i) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap border-t border-line px-3 py-2 ${i === 0 ? "sticky left-0 bg-page text-left" : c.format === "text" ? "text-left" : "text-right"}`}
                    >
                      {c.format === "change" ? (
                        <ChangeBadge metric={c.metric ?? ""} change={(t[c.key] ?? null) as number | null} />
                      ) : t[c.key] === undefined ? (
                        ""
                      ) : (
                        formatValue(t[c.key], c.format)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
