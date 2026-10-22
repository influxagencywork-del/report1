-- Schema cho dashboard báo cáo quảng cáo.
-- App chỉ ĐỌC các bảng này. Việc ghi do job sync (service role) đảm nhiệm.

create type public.platform as enum ('meta', 'google');
create type public.objective_group as enum ('Awareness', 'Traffic', 'Lead', 'Chưa phân loại');

-- Campaign -----------------------------------------------------------------
create table public.campaigns (
  platform         public.platform not null,
  campaign_id      text not null,
  campaign_name    text not null,
  objective_native text,
  objective_group  public.objective_group not null default 'Chưa phân loại',
  status           text,
  updated_at       timestamptz not null default now(),
  primary key (platform, campaign_id)
);

-- Hiệu quả theo ngày, cấp ad set / ad group ---------------------------------
create table public.daily_performance (
  date         date not null,
  platform     public.platform not null,
  campaign_id  text not null,
  adset_id     text not null,
  adset_name   text,
  spend        numeric(16, 2) not null default 0,
  impressions  bigint not null default 0,
  link_clicks  bigint not null default 0,
  -- Meta: video_play_actions (mọi lượt phát). Google: video views. Không cộng 2 nền tảng.
  video_views  bigint not null default 0,
  -- Chỉ Meta có mess; Google luôn 0
  mess         bigint not null default 0,
  constraint daily_performance_uniq unique (date, platform, adset_id),
  constraint daily_performance_campaign_fk
    foreign key (platform, campaign_id) references public.campaigns (platform, campaign_id)
);
create index daily_performance_date_idx on public.daily_performance (date);
create index daily_performance_campaign_idx on public.daily_performance (platform, campaign_id, date);

-- Reach / Frequency theo kỳ (không cộng dồn được nên lưu sẵn từng kỳ) ---------
-- campaign_id null = toàn tài khoản của nền tảng đó.
-- period_type: last_7d | last_30d | this_month | last_month | compare (kỳ trước dùng để so sánh)
create table public.period_reach (
  id           bigint generated always as identity primary key,
  period_type  text not null,
  platform     public.platform not null,
  date_from    date not null,
  date_to      date not null,
  campaign_id  text,
  reach        bigint not null,
  frequency    numeric(10, 4) not null,
  updated_at   timestamptz not null default now()
);
-- 1 dòng cho mỗi (nền tảng, kỳ, campaign). Dùng coalesce để null cũng unique.
create unique index period_reach_uniq
  on public.period_reach (platform, date_from, date_to, coalesce(campaign_id, ''));

-- Mục tiêu theo tháng ----------------------------------------------------------
-- month: ngày đầu tháng (vd 2026-10-01)
-- kpi_metric: impressions | link_clicks | mess | video_views | cpm | cpc | ctr | cost_per_mess
create table public.targets (
  month           date not null check (extract(day from month) = 1),
  objective_group public.objective_group not null,
  budget          numeric(16, 2) not null default 0,
  kpi_metric      text not null,
  kpi_target      numeric(16, 4) not null,
  primary key (month, objective_group)
);

-- Nhật ký sync ---------------------------------------------------------------
create table public.sync_log (
  id            bigint generated always as identity primary key,
  run_at        timestamptz not null default now(),
  platform      public.platform not null,
  status        text not null check (status in ('success', 'error', 'partial')),
  rows_written  integer not null default 0,
  error         text
);
create index sync_log_run_at_idx on public.sync_log (platform, status, run_at desc);

-- Danh sách người được xem dashboard ---------------------------------------------
create table public.allowed_users (
  email       text primary key check (email = lower(email)),
  role        text not null default 'viewer' check (role in ('viewer', 'admin')),
  created_at  timestamptz not null default now()
);
