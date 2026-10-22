-- 1) daily_performance xuống cấp Ad (mẫu quảng cáo)
--    Meta: 1 dòng / ngày / ad. Google: 1 dòng / ngày / ad group (ad_id = '').
--    Tổng theo ad set / campaign vẫn = cộng các dòng, không đổi cách tính.
alter table public.daily_performance
  add column ad_id   text not null default '',
  add column ad_name text;
alter table public.daily_performance drop constraint daily_performance_uniq;
alter table public.daily_performance
  add constraint daily_performance_uniq unique (date, platform, adset_id, ad_id);

-- 2) Breakdown theo đối tượng (tuổi × giới tính) và khu vực (region) — cấp campaign / ngày
--    breakdown_type = 'age_gender': value1 = nhóm tuổi (18-24…), value2 = female | male | unknown
--    breakdown_type = 'region'    : value1 = tên region (tỉnh/thành), value2 = ''
--    Lưu ý: Meta có thể bỏ bớt data khi breakdown → tổng breakdown có thể lệch nhẹ so với tổng campaign.
create table public.daily_breakdown (
  date            date not null,
  platform        public.platform not null,
  campaign_id     text not null,
  breakdown_type  text not null check (breakdown_type in ('age_gender', 'region')),
  value1          text not null,
  value2          text not null default '',
  spend           numeric(16, 2) not null default 0,
  impressions     bigint not null default 0,
  link_clicks     bigint not null default 0,
  mess            bigint not null default 0,
  constraint daily_breakdown_uniq unique (date, platform, campaign_id, breakdown_type, value1, value2),
  constraint daily_breakdown_campaign_fk
    foreign key (platform, campaign_id) references public.campaigns (platform, campaign_id)
);
create index daily_breakdown_lookup_idx on public.daily_breakdown (platform, breakdown_type, date);

-- 3) Hiệu quả từ khóa Google Search — 1 dòng / ngày / từ khóa
create table public.keyword_performance (
  date           date not null,
  platform       public.platform not null default 'google' check (platform = 'google'),
  campaign_id    text not null,
  ad_group_id    text not null,
  keyword_id     text not null,
  keyword_text   text not null,
  match_type     text not null check (match_type in ('EXACT', 'PHRASE', 'BROAD')),
  status         text,
  spend          numeric(16, 2) not null default 0,
  impressions    bigint not null default 0,
  clicks         bigint not null default 0,
  conversions    numeric(12, 2) not null default 0,
  quality_score  smallint check (quality_score between 1 and 10),
  constraint keyword_performance_uniq unique (date, ad_group_id, keyword_id),
  constraint keyword_performance_campaign_fk
    foreign key (platform, campaign_id) references public.campaigns (platform, campaign_id)
);
create index keyword_performance_date_idx on public.keyword_performance (date, campaign_id);

-- RLS: giống các bảng khác — chỉ user trong allowed_users đọc được, không ai ghi qua API
alter table public.daily_breakdown     enable row level security;
alter table public.keyword_performance enable row level security;
revoke all on public.daily_breakdown, public.keyword_performance from anon;
revoke insert, update, delete, truncate on public.daily_breakdown, public.keyword_performance from authenticated;
grant select on public.daily_breakdown, public.keyword_performance to authenticated;
create policy "allowed users read" on public.daily_breakdown
  for select to authenticated using (public.is_allowed_user());
create policy "allowed users read" on public.keyword_performance
  for select to authenticated using (public.is_allowed_user());

-- Hàm gộp phía DB (security invoker → RLS vẫn áp dụng) để app không phải tải hàng chục nghìn dòng.
-- Chỉ trả TỔNG; mọi tỉ lệ (CTR, CPC…) app tự tính từ tổng.
create or replace function public.breakdown_summary(
  p_platform public.platform,
  p_type text,
  p_from date,
  p_to date,
  p_campaign_ids text[]
)
returns table (campaign_id text, value1 text, value2 text, spend numeric, impressions bigint, link_clicks bigint, mess bigint)
language sql
stable
security invoker
set search_path = public
as $$
  -- giữ campaign_id để app áp đúng quy tắc Cost per mess (chỉ spend của campaign có mess)
  select b.campaign_id, b.value1, b.value2, sum(b.spend), sum(b.impressions)::bigint, sum(b.link_clicks)::bigint, sum(b.mess)::bigint
  from public.daily_breakdown b
  where b.platform = p_platform
    and b.breakdown_type = p_type
    and b.date between p_from and p_to
    and b.campaign_id = any (p_campaign_ids)
  group by b.campaign_id, b.value1, b.value2;
$$;

create or replace function public.keyword_summary(
  p_from date,
  p_to date,
  p_campaign_ids text[]
)
returns table (
  campaign_id text, ad_group_id text, keyword_id text, keyword_text text, match_type text, status text,
  spend numeric, impressions bigint, clicks bigint, conversions numeric, quality_score smallint
)
language sql
stable
security invoker
set search_path = public
as $$
  select k.campaign_id, k.ad_group_id, k.keyword_id,
         -- tên / trạng thái / điểm chất lượng: lấy giá trị của ngày gần nhất trong kỳ
         (array_agg(k.keyword_text  order by k.date desc))[1],
         (array_agg(k.match_type    order by k.date desc))[1],
         (array_agg(k.status        order by k.date desc))[1],
         sum(k.spend), sum(k.impressions)::bigint, sum(k.clicks)::bigint, sum(k.conversions),
         (array_agg(k.quality_score order by k.date desc) filter (where k.quality_score is not null))[1]
  from public.keyword_performance k
  where k.date between p_from and p_to
    and k.campaign_id = any (p_campaign_ids)
  group by k.campaign_id, k.ad_group_id, k.keyword_id;
$$;

revoke all on function public.breakdown_summary(public.platform, text, date, date, text[]) from public, anon;
revoke all on function public.keyword_summary(date, date, text[]) from public, anon;
grant execute on function public.breakdown_summary(public.platform, text, date, date, text[]) to authenticated;
grant execute on function public.keyword_summary(date, date, text[]) to authenticated;
