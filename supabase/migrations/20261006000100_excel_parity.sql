-- What the 2025 booking workbook tracks that the app didn't yet: driver pay
-- runs, invoices and part payments, jobs given to other operators, flags,
-- repeating runs, when a booking was taken, children/infants, vehicle due
-- dates, daily leads, monthly overheads and GST.
-- Additive only: run once on a database that has the earlier migrations.

-- ---------------------------------------------------------------- jobs
alter table public.jobs
  -- given to another operator (e.g. Quick Shuttle) instead of one of ours
  add column operator text check (length(btrim(operator)) between 1 and 80),
  -- of the passengers, how many are children / infants
  add column children smallint not null default 0 check (children between 0 and 99),
  add column infants  smallint not null default 0 check (infants between 0 and 99),
  -- the office's "look at this" marker (the sheet's yellow / red rows)
  add column flag_note text check (length(flag_note) between 1 and 300),
  -- trips created together by "Repeat this booking"
  add column series_id uuid,
  -- the day the booking was taken (null = not known, e.g. old imports)
  add column booked_on date,
  -- the day the driver was paid for this job and any cash they collected was settled
  add column driver_settled_on date;

alter table public.jobs add constraint jobs_pax_split check (children + infants <= passengers);
create index jobs_booked_idx on public.jobs (booked_on);
create index jobs_series_idx on public.jobs (series_id) where series_id is not null;

-- ---------------------------------------------------------------- money
alter table public.job_money
  -- paid so far, for deposits and part payments ("Paid 3000" of a $9,000 tour)
  add column amount_paid numeric(10, 2) not null default 0 check (amount_paid >= 0),
  add column invoice_no text check (length(btrim(invoice_no)) between 1 and 40),
  -- who the invoice goes to when it isn't the passenger (a hotel, school, company)
  add column bill_to text check (length(btrim(bill_to)) between 1 and 120);

-- ---------------------------------------------------------------- vehicles
alter table public.vehicles
  add column cof_due date,
  add column rego_due date,
  add column service_due date;

-- ---------------------------------------------------------------- settings
alter table public.settings add column gst_registered boolean not null default false;

-- ---------------------------------------------------------------- leads
-- How many enquiries came in each day (the "Lead Record" tab).
create table public.lead_days (
  day        date primary key,
  leads      integer not null default 0 check (leads between 0 and 10000),
  local      integer check (local between 0 and 10000),
  note       text check (length(note) <= 300),
  updated_at timestamptz not null default now()
);
create trigger touch before update on public.lead_days for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------- overheads
-- Running costs that aren't tied to one job: ads, staff, fuel cards, phone…
create table public.overheads (
  id         uuid primary key default gen_random_uuid(),
  month      date not null check (extract(day from month) = 1),
  category   text not null check (length(btrim(category)) between 1 and 60),
  amount     numeric(10, 2) not null check (amount >= 0),
  note       text check (length(note) <= 300),
  created_at timestamptz not null default now()
);
create index overheads_month_idx on public.overheads (month);

revoke all on public.lead_days, public.overheads from anon;
grant select, insert, update, delete on public.lead_days, public.overheads to authenticated;
alter table public.lead_days enable row level security;
alter table public.overheads enable row level security;
create policy lead_days_office on public.lead_days for all to authenticated using (app.is_office()) with check (app.is_office());
create policy overheads_office on public.overheads for all to authenticated using (app.is_office()) with check (app.is_office());

-- ---------------------------------------------------------------- save_job
-- Same as before, plus the new columns. When the payment is "pay on the day"
-- the driver collects what's left after any deposit. booked_on is set to
-- today for a new booking unless the caller passes one (the importer passes
-- the date in the booking reference, or null when it can't tell).
create or replace function public.save_job(p_id uuid, p_job jsonb, p_money jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  j public.jobs := jsonb_populate_record(null::public.jobs, p_job);
  m public.job_money := jsonb_populate_record(null::public.job_money, coalesce(p_money, '{}'::jsonb));
  v_id uuid;
  v_collected text;
  v_collect numeric;
begin
  if not app.is_office() then
    raise exception 'Only the owner or office staff can create or edit jobs.' using errcode = 'insufficient_privilege';
  end if;

  if p_id is not null then
    select collected_via, collect_amount into v_collected, v_collect from public.jobs where id = p_id;
  end if;
  v_collect := case
    when m.payment_status = 'pay_on_day' then greatest(coalesce(m.price, 0) - coalesce(m.amount_paid, 0), 0)
    when v_collected is not null then v_collect
    else 0
  end;

  if p_id is null then
    insert into public.jobs (
      booking_ref, status, service_type, pickup_date, pickup_time, duration_min, pickup_address, dropoff_address,
      passengers, luggage, flight_no, customer_name, customer_phone, customer_email, booking_source,
      driver_id, vehicle_id, linked_job_id, is_shared, driver_pay, collect_amount, notes, distance_km,
      operator, children, infants, flag_note, series_id, booked_on
    ) values (
      j.booking_ref, coalesce(j.status, 'confirmed'), coalesce(j.service_type, 'airport'), j.pickup_date, j.pickup_time,
      coalesce(j.duration_min, 240), j.pickup_address, j.dropoff_address, coalesce(j.passengers, 1),
      coalesce(j.luggage, 0), j.flight_no, j.customer_name, j.customer_phone, j.customer_email,
      coalesce(j.booking_source, 'phone'), j.driver_id, j.vehicle_id, j.linked_job_id, coalesce(j.is_shared, false),
      coalesce(j.driver_pay, 0), v_collect, j.notes, j.distance_km,
      j.operator, coalesce(j.children, 0), coalesce(j.infants, 0), j.flag_note, j.series_id,
      case when p_job ? 'booked_on' then j.booked_on else app.today() end
    )
    returning id into v_id;
  else
    update public.jobs set
      booking_ref = j.booking_ref,
      status = coalesce(j.status, status), service_type = coalesce(j.service_type, service_type),
      pickup_date = j.pickup_date, pickup_time = j.pickup_time, duration_min = coalesce(j.duration_min, duration_min),
      pickup_address = j.pickup_address, dropoff_address = j.dropoff_address,
      passengers = coalesce(j.passengers, passengers), luggage = coalesce(j.luggage, luggage), flight_no = j.flight_no,
      customer_name = j.customer_name, customer_phone = j.customer_phone, customer_email = j.customer_email,
      booking_source = coalesce(j.booking_source, booking_source), driver_id = j.driver_id, vehicle_id = j.vehicle_id,
      linked_job_id = j.linked_job_id, is_shared = coalesce(j.is_shared, is_shared),
      driver_pay = coalesce(j.driver_pay, driver_pay), collect_amount = v_collect,
      notes = j.notes, distance_km = j.distance_km,
      operator = case when p_job ? 'operator' then j.operator else operator end,
      children = coalesce(j.children, children), infants = coalesce(j.infants, infants),
      flag_note = case when p_job ? 'flag_note' then j.flag_note else flag_note end,
      series_id = case when p_job ? 'series_id' then j.series_id else series_id end,
      booked_on = case when p_job ? 'booked_on' then j.booked_on else booked_on end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That job no longer exists.' using errcode = 'no_data_found';
    end if;
  end if;

  -- A return leg points back at its outbound job, and the outbound job at it.
  if j.linked_job_id is not null then
    update public.jobs set linked_job_id = v_id
    where id = j.linked_job_id and linked_job_id is null;
  end if;

  if p_money is not null then
    insert into public.job_money (job_id, price, fuel_cost, tolls_parking, other_cost, payment_status, payment_method, paid_on, amount_paid, invoice_no, bill_to)
    values (
      v_id, coalesce(m.price, 0), coalesce(m.fuel_cost, 0), coalesce(m.tolls_parking, 0), coalesce(m.other_cost, 0),
      coalesce(m.payment_status, 'unpaid'), m.payment_method, m.paid_on, coalesce(m.amount_paid, 0), m.invoice_no, m.bill_to
    )
    on conflict (job_id) do update set
      price = excluded.price, fuel_cost = excluded.fuel_cost, tolls_parking = excluded.tolls_parking,
      other_cost = excluded.other_cost, payment_status = excluded.payment_status,
      payment_method = excluded.payment_method, paid_on = excluded.paid_on,
      amount_paid = excluded.amount_paid, invoice_no = excluded.invoice_no, bill_to = excluded.bill_to;
  end if;

  return v_id;
end $$;
