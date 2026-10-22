-- Row Level Security: chỉ user đã đăng nhập VÀ có email trong allowed_users mới đọc được.
-- Không có policy INSERT/UPDATE/DELETE → chỉ service role (job sync, script seed) ghi được.

create or replace function public.is_allowed_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.allowed_users
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

revoke all on function public.is_allowed_user() from public, anon;
grant execute on function public.is_allowed_user() to authenticated;

alter table public.campaigns         enable row level security;
alter table public.daily_performance enable row level security;
alter table public.period_reach      enable row level security;
alter table public.targets           enable row level security;
alter table public.sync_log          enable row level security;
alter table public.allowed_users     enable row level security;

-- anon không có quyền gì; authenticated chỉ SELECT (RLS lọc tiếp)
revoke all on public.campaigns, public.daily_performance, public.period_reach,
              public.targets, public.sync_log, public.allowed_users from anon;
revoke insert, update, delete, truncate on public.campaigns, public.daily_performance,
              public.period_reach, public.targets, public.sync_log, public.allowed_users from authenticated;
grant select on public.campaigns, public.daily_performance, public.period_reach,
              public.targets, public.sync_log, public.allowed_users to authenticated;

create policy "allowed users read" on public.campaigns
  for select to authenticated using (public.is_allowed_user());
create policy "allowed users read" on public.daily_performance
  for select to authenticated using (public.is_allowed_user());
create policy "allowed users read" on public.period_reach
  for select to authenticated using (public.is_allowed_user());
create policy "allowed users read" on public.targets
  for select to authenticated using (public.is_allowed_user());
create policy "allowed users read" on public.sync_log
  for select to authenticated using (public.is_allowed_user());
-- Mỗi user chỉ thấy dòng của chính mình (dùng để kiểm tra quyền khi đăng nhập)
create policy "read own row" on public.allowed_users
  for select to authenticated using (email = lower(coalesce(auth.jwt() ->> 'email', '')));
