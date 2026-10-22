/**
 * Toàn bộ cấu hình riêng của 1 client.
 * Nhân bản cho client mới: copy repo, sửa file này + thay logo trong /public.
 */
export const clientConfig = {
  /** Tên hiển thị trên header, tab trình duyệt, email đăng nhập */
  name: "Công ty Demo ABC",
  /** Dòng phụ dưới tên (để "" nếu không cần) */
  tagline: "Báo cáo quảng cáo Meta & Google",

  /** Logo: đặt file vào /public rồi trỏ đường dẫn ở đây. Để src = "" sẽ hiện chữ viết tắt. */
  logo: {
    src: "/logo.svg",
    alt: "Logo Công ty Demo ABC",
    width: 36,
    height: 36,
  },

  locale: "vi-VN",
  currency: "VND",
  timezone: "Asia/Ho_Chi_Minh",

  /** Màu thương hiệu (header, nút, focus). Màu biểu đồ để riêng bên dưới. */
  brand: {
    primary: "#1c5cab",
    primaryForeground: "#ffffff",
  },

  /**
   * Màu theo nền tảng — dùng nhất quán ở mọi biểu đồ.
   * Đã kiểm tra tách biệt cho người mù màu; nếu đổi hãy giữ 2 màu khác tông rõ rệt.
   */
  platformColors: {
    meta: "#2a78d6",
    google: "#eb6834",
  },
  /** Màu cho biểu đồ 1 chuỗi / chuỗi thứ 2 trong biểu đồ kết hợp */
  chartColors: {
    primary: "#2a78d6",
    secondary: "#eb6834",
  },

  /** Ngưỡng tô màu % đạt KPI: >= green → xanh; >= yellow → vàng; còn lại đỏ */
  kpiThresholds: {
    green: 1.0,
    yellow: 0.8,
  },

  /** Cảnh báo nếu lần sync thành công gần nhất của 1 nền tảng cũ hơn N giờ */
  syncStaleHours: 24,

  /** Khoảng thời gian mặc định khi mở dashboard */
  defaultRange: "30d" as const,
} as const;

export type ClientConfig = typeof clientConfig;
