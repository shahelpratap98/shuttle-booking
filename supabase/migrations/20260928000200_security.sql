-- Roles and row-level security.
--
-- owner      : everything, including team, vehicles and settings.
-- dispatcher : office staff. All jobs, money, calendar, dashboard, vehicles.
-- driver     : their own jobs and their own time off. Never sees money.
--
-- All of it is enforced here; the app only decides what to show.

-- ---------------------------------------------------------------- helpers
-- SECURITY DEFINER so policies can read profiles without recursing into the
-- profiles policies. A deactivated person resolves to no role at all.

create or replace function app.current_role()
returns public.app_role
language sql stable security definer set search_path = ''
as $$
  select p.role from public.profiles p
  where p.user_id = auth.uid() and p.is_active
$$;

create or replace function app.is_active()
returns boolean language sql stable security definer set search_path = ''
as $$ select app.current_role() is not null $$;

create or replace function app.is_office()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.current_role() in ('owner', 'dispatcher'), false) $$;

create or replace function app.is_owner()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce(app.current_role() = 'owner', false) $$;

grant usage on schema app to authenticated;
revoke all on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated;

-- ---------------------------------------------------------------- triggers

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger touch before update on public.settings  for each row execute function app.touch_updated_at();
create trigger touch before update on public.profiles  for each row execute function app.touch_updated_at();
create trigger touch before update on public.vehicles  for each row execute function app.touch_updated_at();
create trigger touch before update on public.jobs      for each row execute function app.touch_updated_at();
create trigger touch before update on public.job_money for each row execute function app.touch_updated_at();

-- completed_at follows the status.
create or replace function app.stamp_completed()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status = 'completed' then
    if tg_op = 'INSERT' or old.status is distinct from 'completed' then
      new.completed_at := now();
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger stamp_completed before insert or update of status on public.jobs
  for each row execute function app.stamp_completed();

-- Every new auth user gets a profile. The very first one is the owner (the
-- person setting the system up); everyone after that starts as a driver and
-- the owner changes their role. Public sign-ups stay off in Supabase, so the
-- only way in is an invite from the owner.
create or replace function app.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  palette text[] := array['#1d4ed8', '#15803d', '#be185d', '#c2410c', '#6d28d9', '#0e7490', '#a16207', '#b91c1c', '#4338ca', '#047857'];
  n integer;
begin
  select count(*) into n from public.profiles;
  insert into public.profiles (user_id, display_name, email, role, colour)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles where role = 'owner') then 'driver' else 'owner' end::public.app_role,
    palette[1 + n % array_length(palette, 1)]
  )
  on conflict (user_id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- There must always be at least one active owner, or nobody could manage the team.
create or replace function app.keep_an_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where role = 'owner' and is_active) then
    raise exception 'There must always be at least one active owner.' using errcode = 'check_violation';
  end if;
  return null;
end $$;

create constraint trigger keep_an_owner after update or delete on public.profiles
  deferrable initially deferred
  for each row execute function app.keep_an_owner();

-- ---------------------------------------------------------------- grants
-- Nothing is reachable without a login.

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- ---------------------------------------------------------------- RLS

alter table public.settings  enable row level security;
alter table public.profiles  enable row level security;
alter table public.vehicles  enable row level security;
alter table public.jobs      enable row level security;
alter table public.job_money enable row level security;
alter table public.time_off  enable row level security;

-- settings: everyone signed in reads (business name, time zone); owner edits.
create policy settings_read  on public.settings for select to authenticated using (app.is_active());
create policy settings_owner on public.settings for update to authenticated using (app.is_owner()) with check (app.is_owner());

-- profiles: you see yourself; the office sees the team; only the owner changes anyone.
-- Profiles are created by the auth trigger, never inserted directly.
create policy profiles_read  on public.profiles for select to authenticated
  using (user_id = auth.uid() or app.is_office());
create policy profiles_owner on public.profiles for update to authenticated
  using (app.is_owner()) with check (app.is_owner());

-- vehicles: everyone signed in reads (drivers see which vehicle they're in); the office manages.
create policy vehicles_read   on public.vehicles for select to authenticated using (app.is_active());
create policy vehicles_office on public.vehicles for all    to authenticated using (app.is_office()) with check (app.is_office());

-- jobs: the office does everything; a driver reads only the jobs assigned to
-- them. Drivers change their jobs only through public.driver_update_job.
create policy jobs_office      on public.jobs for all    to authenticated using (app.is_office()) with check (app.is_office());
create policy jobs_driver_read on public.jobs for select to authenticated
  using (driver_id = auth.uid() and app.is_active());

-- money: office only.
create policy money_office on public.job_money for all to authenticated using (app.is_office()) with check (app.is_office());

-- time off: your own, or anyone's if you're in the office.
create policy time_off_read on public.time_off for select to authenticated
  using ((user_id = auth.uid() and app.is_active()) or app.is_office());
create policy time_off_write on public.time_off for all to authenticated
  using ((user_id = auth.uid() and app.is_active()) or app.is_office())
  with check ((user_id = auth.uid() and app.is_active()) or app.is_office());
