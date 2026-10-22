# Dashboard báo cáo quảng cáo (Meta + Google)

Dashboard **chỉ đọc** cho 1 client: Next.js (App Router) + TypeScript + Tailwind + Recharts, dữ liệu trong Supabase (Postgres + Auth magic link), deploy lên Vercel.

App **không gọi API Meta / Google Ads**. Một job sync bên ngoài ghi data vào Supabase; app chỉ đọc (xem [Hợp đồng dữ liệu cho job sync](#hợp-đồng-dữ-liệu-cho-job-sync)).

---

## Mục lục

1. [Cấu trúc thư mục](#cấu-trúc-thư-mục)
2. [Chạy local](#chạy-local)
3. [Tạo project Supabase thật & chạy migration](#tạo-project-supabase-thật--chạy-migration)
4. [Seed data giả lập](#seed-data-giả-lập)
5. [Thêm / xóa người xem](#thêm--xóa-người-xem)
6. [Deploy lên Vercel](#deploy-lên-vercel)
7. [Nhân bản cho client mới](#nhân-bản-cho-client-mới)
8. [Quy tắc tính metric](#quy-tắc-tính-metric)
9. [Hợp đồng dữ liệu cho job sync](#hợp-đồng-dữ-liệu-cho-job-sync)

---

## Cấu trúc thư mục

```
config/client.ts            ← MỌI cấu hình riêng của client (tên, logo, màu, VND, múi giờ, ngưỡng KPI)
public/logo.svg             ← logo client
supabase/
  config.toml               ← cấu hình Supabase local (supabase start)
  migrations/               ← schema + Row Level Security
  seed/seed.ts              ← 90 ngày data giả lập
scripts/add-user.ts         ← cấp / thu hồi quyền xem
lib/
  metrics.ts (+ .test.ts)   ← toàn bộ công thức metric, có unit test
  filters.ts (+ .test.ts)   ← bộ lọc ↔ URL, kỳ so sánh
  reach.ts                  ← Reach / Frequency (không cộng dồn)
  data.ts                   ← đọc Supabase (có phân trang)
  report.ts                 ← dựng bảng / chuỗi biểu đồ
  format.ts, dates.ts       ← định dạng VND, ngày theo múi giờ
middleware.ts               ← chặn trang khi chưa đăng nhập
app/
  login/, auth/callback/, auth/signout/, no-access/
  (dashboard)/              ← layout chung: menu, bộ lọc, banner sync, chân trang
    page.tsx                ← 1. Tổng quan
    awareness/  traffic/  lead/  campaigns/
components/                 ← KpiCard, DataTable (sort/lọc/CSV), FilterBar, biểu đồ, phễu…
```

## Chạy local

Yêu cầu: Node 20+, Docker (cho Supabase local).

```bash
npm install
npx supabase start            # chạy Postgres + Auth + Mailpit local, tự áp dụng migrations/
npx supabase status -o env    # lấy API_URL, ANON_KEY, SERVICE_ROLE_KEY
cp .env.example .env.local    # điền 3 giá trị trên
npm run seed                  # data giả lập
npm run add-user -- ban@congty.vn admin
npm run dev                   # http://localhost:3000
```

Email magic link ở môi trường local **không gửi thật**. Bạn mở Mailpit tại <http://127.0.0.1:54324> để bấm link.

Kiểm tra:

```bash
npm test          # unit test metric + bộ lọc
npm run lint
npm run build
```

> Supabase local đã tắt Realtime / Storage / Studio vì app không dùng. Nếu Docker báo lỗi rate limit khi kéo image, thử `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io npx supabase start`.

## Tạo project Supabase thật & chạy migration

1. Tạo project tại <https://supabase.com/dashboard> (region gần VN: Singapore).
2. **Chạy migration.** Có 2 cách:
   - **CLI (khuyên dùng):**
     ```bash
     npx supabase login
     npx supabase link --project-ref <project-ref>
     npx supabase db push        # áp dụng supabase/migrations/*.sql
     ```
   - **Thủ công:** vào SQL Editor, chạy lần lượt `supabase/migrations/20261022000001_schema.sql`, rồi `…02_rls.sql`.
3. **Cấu hình Auth** (Authentication → Sign In / Providers → Email, và URL Configuration):
   - **Tắt** "Allow new users to sign up". Như vậy chỉ người được thêm bằng `add-user` mới nhận được link.
   - **Giữ bật** provider Email.
   - Site URL: `https://<domain-vercel-của-bạn>`.
   - Redirect URLs: thêm `https://<domain>/**` và `http://localhost:3000/**`.
   - Nên cấu hình **Custom SMTP** (Resend, SendGrid…). Email mặc định của Supabase chỉ gửi được vài email mỗi giờ.
   - Tùy chọn: sửa template "Magic Link" sang tiếng Việt, giữ nguyên biến `{{ .ConfirmationURL }}`.
4. Lấy key ở Project Settings → API: `Project URL`, `anon public`, `service_role`.

## Seed data giả lập

```bash
# .env.local trỏ tới project cần seed (local hoặc cloud) + SUPABASE_SERVICE_ROLE_KEY
npm run seed
SEED_TODAY=2026-10-22 npm run seed   # cố định mốc "hôm nay"

# Không muốn dùng service role key? Xuất ra file SQL rồi dán vào Supabase → SQL Editor
npm run seed -- --sql seed.sql
```

Data được tạo ra gồm:

- 90 ngày, kết thúc hôm qua.
- 6 campaign Meta (2 Awareness, 2 Traffic, 2 Lead tin nhắn) và 4 campaign Google (2 Awareness, 2 Traffic). Mỗi campaign có 2 ad set.
- Mess chỉ có ở Meta.
- Targets cho 3 tháng gần nhất, cố ý tạo đủ 3 trạng thái xanh / vàng / đỏ.
- `period_reach` cho 4 kỳ chuẩn và kỳ so sánh của từng kỳ.
- `sync_log`: Google lỗi 2 lần gần nhất, để thấy banner cảnh báo.

> ⚠️ Script **xóa toàn bộ** campaigns / daily_performance / period_reach / targets / sync_log trước khi ghi. Bảng `allowed_users` giữ nguyên. Đừng chạy trên project đang có data thật.
>
> Reach của các kỳ "7 ngày / 30 ngày" gắn với ngày chạy seed. Sang ngày hôm sau, kỳ đó đổi ngày nên thẻ Reach sẽ hiện "Chưa có dữ liệu" cho tới khi seed lại hoặc job sync ghi kỳ mới.

## Thêm / xóa người xem

```bash
npm run add-user -- nguoi.xem@client.vn            # role viewer
npm run add-user -- quan.ly@agency.vn admin        # role admin
npm run add-user -- nguoi.cu@client.vn --remove    # thu hồi quyền
```

Script tạo user trong Supabase Auth (đã xác nhận email) và thêm email vào `allowed_users`. Người xem vào trang web, nhập email, rồi bấm link trong email là đăng nhập được.

**Cách thủ công, không cần Node:**

1. Vào Supabase → Authentication → Users → **Add user → Create new user**. Nhập email, tick **Auto Confirm User**, để trống mật khẩu.
2. Vào SQL Editor, chạy:
   ```sql
   insert into public.allowed_users (email, role) values ('nguoi.xem@client.vn', 'viewer');
   -- thu hồi: delete from public.allowed_users where email = 'nguoi.xem@client.vn';
   ```
   Email phải viết **chữ thường**.

Cơ chế bảo vệ có 3 lớp:

1. `middleware.ts` chặn mọi trang khi chưa đăng nhập.
2. Layout chuyển người không có trong `allowed_users` sang trang `/no-access`.
3. **RLS trên mọi bảng.** Kể cả khi gọi thẳng API Supabase bằng anon key, user không có trong `allowed_users` vẫn đọc được 0 dòng và không ai ghi được. Chỉ `service_role` (job sync, script) mới ghi được.

## Deploy lên Vercel

1. Push repo lên GitHub, rồi trên Vercel chọn **Add New → Project → Import** repo đó (framework tự nhận Next.js).
2. Environment Variables (Production + Preview):
   | Biến | Giá trị |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key |

   **Không** thêm `SUPABASE_SERVICE_ROLE_KEY` vào Vercel. App không cần key này.
3. Deploy. Sau đó quay lại Supabase → Auth → URL Configuration để cập nhật Site URL và Redirect URLs theo domain Vercel. Nếu dùng domain riêng thì thêm cả domain riêng.
4. Đăng nhập thử bằng email đã `add-user`.

## Nhân bản cho client mới

Mỗi client nên có **1 project Supabase riêng và 1 project Vercel riêng** để data tách biệt hoàn toàn.

1. Copy repo: dùng GitHub "Use this template" hoặc `git clone` sang repo mới.
2. Sửa **`config/client.ts`**. Đây là file duy nhất chứa thông tin riêng của client:
   - `name`, `tagline`: tên hiển thị trên header, tab trình duyệt.
   - `logo.src`: đặt file logo vào `public/` (SVG/PNG, nên dùng ảnh vuông) rồi trỏ đường dẫn. Để `src: ""` thì app hiện chữ viết tắt của tên.
   - `brand.primary`: màu thương hiệu (nút, tab đang chọn, thanh pacing).
   - `platformColors`, `chartColors`: màu biểu đồ. Nếu đổi, nên giữ 2 màu khác tông rõ rệt (xanh / cam) để người mù màu vẫn phân biệt được.
   - `currency`, `locale`, `timezone`, `kpiThresholds`, `syncStaleHours`, `defaultRange`.
3. Tạo project Supabase mới, chạy migration và cấu hình Auth như [mục trên](#tạo-project-supabase-thật--chạy-migration).
4. Nhập targets của client (SQL Editor hoặc job sync) và trỏ job sync sang project mới.
5. `npm run add-user` cho người xem của client.
6. Tạo project Vercel mới với 2 biến môi trường của project Supabase mới.

## Quy tắc tính metric

Toàn bộ nằm trong `lib/metrics.ts` và có unit test.

| Metric | Công thức (trên **tổng** của kỳ / của mỗi điểm biểu đồ) |
|---|---|
| CPM | Σ spend ÷ Σ impressions × 1000 |
| CTR | Σ link clicks ÷ Σ impressions |
| CPC | Σ spend ÷ Σ link clicks |
| Cost per mess | Σ spend của **các campaign có phát sinh mess** trong kỳ (xét cả kỳ này lẫn kỳ so sánh) ÷ Σ mess. Không tính spend Awareness / Traffic / Google không tạo mess |
| Pacing | Σ spend ÷ ngân sách kỳ. Ngân sách kỳ = Σ ngân sách tháng × (số ngày của kỳ nằm trong tháng ÷ số ngày của tháng) |
| % đạt KPI | Metric khối lượng: thực tế ÷ mục tiêu (mục tiêu chia theo ngày như ngân sách). Metric chi phí: mục tiêu ÷ thực tế. Từ 100% trở lên xanh, từ 80% vàng, dưới 80% đỏ (`kpiThresholds`) |
| % thay đổi | (kỳ này − kỳ trước) ÷ kỳ trước. Kỳ trước = khoảng liền trước, cùng số ngày. Metric chi phí tăng thì tô đỏ |

- **Không bao giờ** lấy trung bình các tỉ lệ theo ngày.
- **Reach / Frequency** đọc reach **theo campaign** từ `period_reach`, khớp chính xác `date_from` / `date_to` của kỳ chuẩn (7 ngày, 30 ngày, tháng này, tháng trước). Kỳ tùy chọn hiển thị "Chỉ có cho kỳ chuẩn".
  - Theo yêu cầu của client, reach của nhiều campaign = **cộng reach các campaign đang lọc** (không khử trùng người xem). Con số này có thể cao hơn reach thật của tài khoản.
  - Reach luôn **tách theo nền tảng**, không cộng Meta với Google: thẻ Reach hiện 2 số riêng; bảng campaign có dòng "Tổng Meta" và "Tổng Google", còn dòng "Tổng" chung để trống reach / frequency.
  - Frequency = Σ(reach × frequency) ÷ Σ reach = tổng impressions ÷ tổng reach.
  - Reach không bao giờ cộng theo ngày. Dòng toàn tài khoản (`campaign_id = null`) vẫn được lưu nhưng hiện app không dùng.
- **Video views:** Meta = `video_play_actions` (mọi lượt phát). Meta và Google luôn hiển thị riêng.
- Kỳ chuẩn tính **đến hết hôm qua** (giờ `Asia/Ho_Chi_Minh`) vì data hôm nay chưa đầy đủ. Tuần theo chuẩn ISO, bắt đầu từ thứ Hai.

## Hợp đồng dữ liệu cho job sync

Job sync (ngoài app) dùng `service_role` và cần ghi những dữ liệu sau:

| Bảng | Ghi gì | Khóa upsert |
|---|---|---|
| `campaigns` | platform, campaign_id, tên, objective_native, **objective_group** (Awareness / Traffic / Lead / Chưa phân loại), status | `(platform, campaign_id)` |
| `daily_performance` | 1 dòng / ngày / ad set (ad group). `date` theo múi giờ tài khoản quảng cáo. Meta `video_views` = `video_play_actions`. Google `mess` = 0 | `(date, platform, adset_id)` |
| `period_reach` | Mỗi ngày ghi lại reach/frequency cho **4 kỳ chuẩn và kỳ so sánh** của từng kỳ: toàn tài khoản (`campaign_id = null`) **cho từng nền tảng** và từng campaign. Lấy trực tiếp từ API (Meta insights với `time_range`), **không tự cộng**. `period_type` dùng: `last_7d`, `last_30d`, `this_month`, `last_month`, `compare` | `(platform, date_from, date_to, coalesce(campaign_id,''))` |
| `targets` | month (ngày 01), objective_group, budget, kpi_metric (`impressions`, `link_clicks`, `mess`, `video_views`, `cpm`, `cpc`, `ctr`, `cost_per_mess`), kpi_target (giá trị cả tháng) | `(month, objective_group)` |
| `sync_log` | Mỗi lần chạy, ghi 1 dòng cho mỗi nền tảng: `status` = success / error / partial, rows_written, error | – |

Cách tính các kỳ: xem `resolveRange()` và `previousPeriod()` trong `lib/filters.ts`. Job sync nên import lại 2 hàm này để ngày khớp tuyệt đối với app.
