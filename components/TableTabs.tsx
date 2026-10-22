"use client";

import { useState } from "react";
import { DataTable, type Column, type Row } from "./DataTable";

export interface TableTab {
  id: string;
  label: string;
  columns: Column[];
  rows: Row[];
  totals?: Row | Row[];
  searchKeys?: string[];
}

/** Nhiều bảng chung 1 khung, chuyển bằng tab (vd theo campaign / theo ad set) */
export function TableTabs({ tabs, initialSort }: { tabs: TableTab[]; initialSort?: { key: string; dir: "asc" | "desc" } }) {
  const [active, setActive] = useState(tabs[0].id);
  const tab = tabs.find((t) => t.id === active) ?? tabs[0];
  return (
    <div>
      <div role="tablist" className="mb-3 inline-flex rounded-lg border border-line bg-white p-0.5 text-sm">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            className={`rounded-md px-3 py-1.5 ${t.id === active ? "bg-ink font-medium text-white" : "text-ink-2 hover:text-ink"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        <DataTable key={tab.id} columns={tab.columns} rows={tab.rows} totals={tab.totals} initialSort={initialSort} searchKeys={tab.searchKeys} />
      </div>
    </div>
  );
}
