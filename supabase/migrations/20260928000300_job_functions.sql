-- Writes that must happen in one go, or that drivers are allowed to make.

-- The business's "today", from settings.timezone.
create or replace function app.today()
returns date language sql stable security definer set search_path = ''
as $$ select (now() at time zone coalesce((select timezone from public.settings where id = 1), 'Pacific/Auckland'))::date $$;

-- The office saves a job and its money together, in one transaction.
-- SECURITY INVOKER: the caller's row-level security still applies, so a
-- driver calling this gets nowhere. p_id null = new job.
--
-- collect_amount (what the driver collects on the day) follows the payment
-- choice: the full charge when it's "pay on the day", otherwise nothing,
-- unless the driver has already recorded collecting it.
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
    when m.payment_status = 'pay_on_day' then coalesce(m.price, 0)
    when v_collected is not null then v_collect
    else 0
  end;

  if p_id is null then
    insert into public.jobs (
      booking_ref, status, service_type, pickup_date, pickup_time, duration_min, pickup_address, dropoff_address,
      passengers, luggage, flight_no, customer_name, customer_phone, customer_email, booking_source,
      driver_id, vehicle_id, linked_job_id, is_shared, driver_pay, collect_amount, notes, distance_km
    ) values (
      j.booking_ref, coalesce(j.status, 'confirmed'), coalesce(j.service_type, 'airport'), j.pickup_date, j.pickup_time,
      coalesce(j.duration_min, 240), j.pickup_address, j.dropoff_address, coalesce(j.passengers, 1),
      coalesce(j.luggage, 0), j.flight_no, j.customer_name, j.customer_phone, j.customer_email,
      coalesce(j.booking_source, 'phone'), j.driver_id, j.vehicle_id, j.linked_job_id, coalesce(j.is_shared, false),
      coalesce(j.driver_pay, 0), v_collect, j.notes, j.distance_km
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
      notes = j.notes, distance_km = j.distance_km
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
    insert into public.job_money (job_id, price, fuel_cost, tolls_parking, other_cost, payment_status, payment_method, paid_on)
    values (
      v_id, coalesce(m.price, 0), coalesce(m.fuel_cost, 0), coalesce(m.tolls_parking, 0), coalesce(m.other_cost, 0),
      coalesce(m.payment_status, 'unpaid'), m.payment_method, m.paid_on
    )
    on conflict (job_id) do update set
      price = excluded.price, fuel_cost = excluded.fuel_cost, tolls_parking = excluded.tolls_parking,
      other_cost = excluded.other_cost, payment_status = excluded.payment_status,
      payment_method = excluded.payment_method, paid_on = excluded.paid_on;
  end if;

  return v_id;
end $$;

-- A driver finishes one of their own jobs: done or no-show (or back to
-- confirmed if they tapped the wrong button), notes, distance, and, for a
-- pay-on-the-day job, how they collected the money. Nothing else about the
-- job can be changed this way.
create or replace function public.driver_update_job(
  p_job_id uuid,
  p_status public.job_status,
  p_driver_notes text,
  p_distance_km numeric,
  p_collected_via text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  j public.jobs;
begin
  select * into j from public.jobs where id = p_job_id for update;
  if j.id is null or j.driver_id is distinct from auth.uid() or not app.is_active() then
    raise exception 'That job isn''t assigned to you.' using errcode = 'insufficient_privilege';
  end if;
  if p_status not in ('confirmed', 'completed', 'no_show') then
    raise exception 'Drivers can mark a job done or no-show, nothing else.' using errcode = 'check_violation';
  end if;
  if j.status not in ('confirmed', 'completed', 'no_show') then
    raise exception 'This job is %, so only the office can change it.', j.status using errcode = 'check_violation';
  end if;
  if p_distance_km is not null and (p_distance_km < 0 or p_distance_km > 5000) then
    raise exception 'Distance must be between 0 and 5000 km.' using errcode = 'check_violation';
  end if;
  if p_collected_via is not null and p_collected_via not in ('cash', 'card', 'online', 'bank') then
    raise exception 'Say how it was paid: cash, card, online or bank.' using errcode = 'check_violation';
  end if;
  if p_collected_via is not null and j.collect_amount <= 0 then
    raise exception 'There''s nothing to collect on this job.' using errcode = 'check_violation';
  end if;

  update public.jobs set
    status = p_status,
    driver_notes = nullif(btrim(coalesce(p_driver_notes, '')), ''),
    distance_km = coalesce(p_distance_km, distance_km),
    collected_via = coalesce(p_collected_via, collected_via)
  where id = p_job_id;

  if p_collected_via is not null then
    update public.job_money
    set payment_status = 'paid', payment_method = p_collected_via, paid_on = app.today()
    where job_id = p_job_id;
  end if;
end $$;

revoke all on function public.save_job(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.driver_update_job(uuid, public.job_status, text, numeric, text) from public, anon;
grant execute on function public.save_job(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.driver_update_job(uuid, public.job_status, text, numeric, text) to authenticated;
revoke all on function app.today() from public, anon;
grant execute on function app.today() to authenticated;
