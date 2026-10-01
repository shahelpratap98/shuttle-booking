-- Weekly booking target, and spotting repeat customers.
-- Run once on a database that already has the first three migrations.

-- ---------------------------------------------------------------- repeat customers
-- Who the customer is, for "have they booked before?": their phone number
-- (digits only, without +64 or the leading 0, so 021 620 533 and
-- +64 21 620533 match), or their name when there's no usable phone.
-- lib/customers.ts customerKey() is the same rule for the demo store.
alter table public.jobs add column customer_key text generated always as (
  case
    when length(ltrim(regexp_replace(regexp_replace(coalesce(customer_phone, ''), '[^0-9]', '', 'g'), '^(00)?64', ''), '0')) >= 6
      then 'p:' || ltrim(regexp_replace(regexp_replace(customer_phone, '[^0-9]', '', 'g'), '^(00)?64', ''), '0')
    else 'n:' || lower(regexp_replace(btrim(customer_name), '\s+', ' ', 'g'))
  end
) stored;

create index jobs_customer_idx on public.jobs (customer_key, pickup_date);

-- For each job the caller may see, how many earlier bookings the same
-- customer has made. A there-and-back trip counts as one booking, and
-- enquiries and cancellations don't count. SECURITY DEFINER so a driver can
-- be told "repeat customer" without reading anyone else's jobs; they only
-- get numbers for jobs assigned to them.
create or replace function public.repeat_counts(p_job_ids uuid[])
returns table (job_id uuid, earlier integer)
language sql stable security definer set search_path = ''
as $$
  select j.id, (
    select count(distinct case when o.linked_job_id is null then o.id else least(o.id, o.linked_job_id) end)::int
    from public.jobs o
    where o.customer_key = j.customer_key
      and o.id <> j.id
      and o.id is distinct from j.linked_job_id
      and o.status not in ('cancelled', 'enquiry')
      and (o.pickup_date, o.pickup_time, o.job_no) < (j.pickup_date, j.pickup_time, j.job_no)
  )
  from public.jobs j
  where j.id = any(p_job_ids)
    and app.is_active()
    and (app.is_office() or j.driver_id = auth.uid())
$$;

revoke all on function public.repeat_counts(uuid[]) from public, anon;
grant execute on function public.repeat_counts(uuid[]) to authenticated;

-- ---------------------------------------------------------------- targets
-- The usual weekly target for total booking $. Office reads, owner sets.
-- Kept out of settings, which drivers can read.
create table public.targets (
  id                    smallint primary key default 1 check (id = 1),
  weekly_booking_target numeric(10,2) check (weekly_booking_target is null or weekly_booking_target between 0 and 10000000),
  updated_at            timestamptz not null default now()
);
insert into public.targets (id) values (1);

create trigger touch before update on public.targets for each row execute function app.touch_updated_at();

revoke all on public.targets from anon;
grant select, update on public.targets to authenticated;
alter table public.targets enable row level security;
create policy targets_read  on public.targets for select to authenticated using (app.is_office());
create policy targets_owner on public.targets for update to authenticated using (app.is_owner()) with check (app.is_owner());
