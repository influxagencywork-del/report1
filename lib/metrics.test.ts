import { describe, expect, it } from "vitest";
import {
  bucketOf,
  buckets,
  changeIsGood,
  computeMetrics,
  costPerMess,
  funnel,
  kpiAttainment,
  kpiStatus,
  messCampaignKeys,
  monthShare,
  pctChange,
  periodKpiTarget,
  proratedBudget,
  timeSeries,
  type PerfRow,
  withMessFlag,
  type TargetRow,
} from "./metrics";

function row(p: Partial<PerfRow>): PerfRow {
  return {
    date: "2026-10-01",
    platform: "meta",
    campaign_id: "c1",
    adset_id: "a1",
    spend: 0,
    impressions: 0,
    link_clicks: 0,
    video_views: 0,
    mess: 0,
    ...p,
  };
}

describe("tỉ lệ tính từ tổng, không lấy trung bình tỉ lệ theo ngày", () => {
  // Ngày 1: chi nhiều, CPM thấp. Ngày 2: chi ít, CPM rất cao.
  const rows = [
    row({ date: "2026-10-01", spend: 1_000_000, impressions: 100_000, link_clicks: 1_000, mess: 10 }),
    row({ date: "2026-10-02", spend: 100_000, impressions: 1_000, link_clicks: 100, mess: 1 }),
  ];
  const m = computeMetrics(rows);

  it("CPM = tổng spend / tổng impressions × 1000", () => {
    // Đúng: 1.100.000 / 101.000 × 1000 ≈ 10.891
    expect(m.cpm).toBeCloseTo((1_100_000 / 101_000) * 1000, 6);
    // Sai (trung bình CPM ngày) = (10.000 + 100.000) / 2 = 55.000
    expect(m.cpm).not.toBeCloseTo(55_000, 0);
  });

  it("CTR = tổng link clicks / tổng impressions", () => {
    expect(m.ctr).toBeCloseTo(1_100 / 101_000, 10);
    // Trung bình CTR ngày = (1% + 10%) / 2 = 5,5% → phải khác
    expect(m.ctr).not.toBeCloseTo(0.055, 3);
  });

  it("CPC = tổng spend / tổng link clicks", () => {
    expect(m.cpc).toBeCloseTo(1_100_000 / 1_100, 6);
  });

  it("Cost per mess = tổng spend Meta / tổng mess", () => {
    expect(m.cost_per_mess).toBeCloseTo(1_100_000 / 11, 6);
  });

  it("chuỗi theo tuần: tỉ lệ của mỗi bucket cũng tính từ tổng bucket", () => {
    const s = timeSeries(rows, "2026-10-01", "2026-10-02", "week");
    expect(s).toHaveLength(1);
    expect(s[0].cpm).toBeCloseTo(m.cpm!, 6);
  });
});

describe("Cost per mess: tử số = spend của campaign có phát sinh mess", () => {
  it("bỏ spend của Google và của campaign Meta không có mess", () => {
    const m = computeMetrics([
      row({ campaign_id: "lead", adset_id: "l1", platform: "meta", spend: 500_000, mess: 5 }),
      row({ campaign_id: "aw", adset_id: "a1", platform: "meta", spend: 3_000_000, mess: 0 }),
      row({ campaign_id: "g", adset_id: "g1", platform: "google", spend: 2_000_000, mess: 0 }),
    ]);
    expect(m.spend).toBe(5_500_000);
    expect(m.spend_mess).toBe(500_000);
    expect(m.cost_per_mess).toBe(100_000);
  });

  it("giữ spend của campaign có mess vào cả những ngày campaign đó 0 mess", () => {
    const rows = [
      row({ date: "2026-10-01", campaign_id: "lead", spend: 400_000, mess: 0 }),
      row({ date: "2026-10-02", campaign_id: "lead", spend: 600_000, mess: 10 }),
    ];
    expect(computeMetrics(rows).cost_per_mess).toBe(100_000);
    // Chuỗi theo ngày: ngày 1 có spend nhưng 0 mess → không chia được, không bị "mất" spend
    const s = timeSeries(rows, "2026-10-01", "2026-10-02", "day");
    expect(s[0].spend_mess).toBe(400_000);
    expect(s[0].cost_per_mess).toBeNull();
    expect(s[1].cost_per_mess).toBe(60_000);
  });

  it("2 kỳ dùng chung tập campaign có mess", () => {
    const cur = [row({ campaign_id: "lead", spend: 100, mess: 0 })];
    const prev = [row({ campaign_id: "lead", spend: 100, mess: 2 })];
    const keys = messCampaignKeys(cur, prev);
    expect(computeMetrics(withMessFlag(cur, keys)).spend_mess).toBe(100);
  });

  it("không có mess → null", () => {
    expect(costPerMess({ spend_mess: 100, mess: 0 })).toBeNull();
  });
});

describe("video views tách theo nền tảng", () => {
  it("không cộng Meta với Google", () => {
    const m = computeMetrics([
      row({ platform: "meta", video_views: 300 }),
      row({ platform: "google", adset_id: "g1", video_views: 50 }),
    ]);
    expect(m.video_views_meta).toBe(300);
    expect(m.video_views_google).toBe(50);
  });
});

describe("chia cho 0", () => {
  it("trả về null thay vì Infinity/NaN", () => {
    const m = computeMetrics([]);
    expect(m.cpm).toBeNull();
    expect(m.ctr).toBeNull();
    expect(m.cpc).toBeNull();
    expect(m.cost_per_mess).toBeNull();
  });
});

describe("pctChange / changeIsGood", () => {
  it("tính % thay đổi", () => {
    expect(pctChange(120, 100)).toBeCloseTo(0.2);
    expect(pctChange(80, 100)).toBeCloseTo(-0.2);
  });
  it("kỳ trước = 0 hoặc null → null", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(null, 10)).toBeNull();
  });
  it("chi phí tăng là xấu, khối lượng tăng là tốt", () => {
    expect(changeIsGood("cpm", 0.1)).toBe(false);
    expect(changeIsGood("cost_per_mess", -0.1)).toBe(true);
    expect(changeIsGood("impressions", 0.1)).toBe(true);
    expect(changeIsGood("impressions", 0)).toBeNull();
  });
});

describe("bucket theo ngày / tuần / tháng", () => {
  it("tuần ISO bắt đầu thứ Hai", () => {
    expect(bucketOf("2026-10-22", "week")).toBe("2026-10-19"); // thứ Năm → thứ Hai
    expect(bucketOf("2026-10-25", "week")).toBe("2026-10-19"); // Chủ nhật → thứ Hai trước đó
    expect(bucketOf("2026-10-22", "month")).toBe("2026-10-01");
  });
  it("điền bucket trống", () => {
    expect(buckets("2026-09-29", "2026-10-02", "month")).toEqual(["2026-09-01", "2026-10-01"]);
    const s = timeSeries([row({ date: "2026-10-02", spend: 5 })], "2026-10-01", "2026-10-03", "day");
    expect(s.map((p) => p.spend)).toEqual([0, 5, 0]);
  });
});

describe("ngân sách & pacing", () => {
  const targets: TargetRow[] = [
    { month: "2026-09-01", objective_group: "Lead", budget: 30_000_000, kpi_metric: "mess", kpi_target: 300 },
    { month: "2026-10-01", objective_group: "Lead", budget: 31_000_000, kpi_metric: "mess", kpi_target: 310 },
    { month: "2026-10-01", objective_group: "Traffic", budget: 62_000_000, kpi_metric: "cpc", kpi_target: 3000 },
  ];

  it("monthShare", () => {
    expect(monthShare("2026-10-01", "2026-10-01", "2026-10-10")).toBeCloseTo(10 / 31);
    expect(monthShare("2026-08-01", "2026-10-01", "2026-10-10")).toBe(0);
  });

  it("ngân sách chia theo số ngày, cộng qua 2 tháng", () => {
    // 21/09–10/10: 10 ngày tháng 9 (10/30) + 10 ngày tháng 10 (10/31)
    const b = proratedBudget(targets, "2026-09-21", "2026-10-10", ["Lead"]);
    expect(b.budget).toBeCloseTo(10_000_000 + 10_000_000, 4);
    expect(b.missingMonths).toEqual([]);
  });

  it("báo tháng thiếu target", () => {
    const b = proratedBudget(targets, "2026-08-31", "2026-09-01", ["Lead"]);
    expect(b.missingMonths).toEqual(["2026-08-01"]);
  });

  it("KPI khối lượng chia theo ngày, KPI chi phí giữ nguyên", () => {
    expect(periodKpiTarget(targets, "Lead", "2026-10-01", "2026-10-10")).toEqual({ metric: "mess", target: 100 });
    expect(periodKpiTarget(targets, "Traffic", "2026-10-01", "2026-10-10")).toEqual({ metric: "cpc", target: 3000 });
  });

  it("% đạt: chi phí thấp hơn mục tiêu là vượt", () => {
    expect(kpiAttainment("mess", 90, 100)).toBeCloseTo(0.9);
    expect(kpiAttainment("cpc", 2500, 3000)).toBeCloseTo(1.2);
    expect(kpiAttainment("cpc", null, 3000)).toBeNull();
  });

  it("tô màu theo ngưỡng", () => {
    const th = { green: 1, yellow: 0.8 };
    expect(kpiStatus(1.05, th)).toBe("green");
    expect(kpiStatus(0.85, th)).toBe("yellow");
    expect(kpiStatus(0.5, th)).toBe("red");
    expect(kpiStatus(null, th)).toBe("none");
  });
});

describe("phễu", () => {
  it("tính tỉ lệ chuyển và rơi rụng giữa các bước", () => {
    const f = funnel({ impressions: 10_000, link_clicks: 200, mess: 10 });
    expect(f[0].rateFromPrev).toBeNull();
    expect(f[1].rateFromPrev).toBeCloseTo(0.02);
    expect(f[1].dropFromPrev).toBeCloseTo(0.98);
    expect(f[2].rateFromPrev).toBeCloseTo(0.05);
  });
});
