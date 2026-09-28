-- Writes that must happen in one go, or that drivers are allowed to make.

-- The office saves a job and its money together, in one transaction.
-- SECURITY INVOKER: the caller's row-level security still applies, so a
-- driver calling this gets nowhere. p_id null = new job.
create or replace function public.save_job(p_id uuid, p_job jsonb, p_money jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  j public.jobs := jsonb_populate_record(null::public.jobs, p_job);
  m public.job_money := jsonb_populate_record(null::public.job_money, coalesce(p_money, '{}'::jsonb));
  v_id uuid;
begin
  if not app.is_office() then
    raise exception 'Only the owner or office staff can create or edit jobs.' using errcode = 'insufficient_privilege';
  end if;

  if p_id is null then
    insert into public.jobs (
      status, service_type, pickup_date, pickup_time, duration_min, pickup_address, dropoff_address,
      passengers, luggage, flight_no, customer_name, customer_phone, customer_email, booking_source,
      driver_id, vehicle_id, notes, distance_km
    ) values (
      coalesce(j.status, 'confirmed'), coalesce(j.service_type, 'airport'), j.pickup_date, j.pickup_time,
      coalesce(j.duration_min, 60), j.pickup_address, j.dropoff_address, coalesce(j.passengers, 1),
      coalesce(j.luggage, 0), j.flight_no, j.customer_name, j.customer_phone, j.customer_email,
      coalesce(j.booking_source, 'phone'), j.driver_id, j.vehicle_id, j.notes, j.distance_km
    )
    returning id into v_id;
  else
    update public.jobs set
      status = coalesce(j.status, status), service_type = coalesce(j.service_type, service_type),
      pickup_date = j.pickup_date, pickup_time = j.pickup_time, duration_min = coalesce(j.duration_min, duration_min),
      pickup_address = j.pickup_address, dropoff_address = j.dropoff_address,
      passengers = coalesce(j.passengers, passengers), luggage = coalesce(j.luggage, luggage), flight_no = j.flight_no,
      customer_name = j.customer_name, customer_phone = j.customer_phone, customer_email = j.customer_email,
      booking_source = coalesce(j.booking_source, booking_source), driver_id = j.driver_id, vehicle_id = j.vehicle_id,
      notes = j.notes, distance_km = j.distance_km
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'That job no longer exists.' using errcode = 'no_data_found';
    end if;
  end if;

  if p_money is not null then
    insert into public.job_money (job_id, price, driver_cost, fuel_cost, tolls_parking, other_cost, payment_status)
    values (
      v_id, coalesce(m.price, 0), coalesce(m.driver_cost, 0), coalesce(m.fuel_cost, 0),
      coalesce(m.tolls_parking, 0), coalesce(m.other_cost, 0), coalesce(m.payment_status, 'unpaid')
    )
    on conflict (job_id) do update set
      price = excluded.price, driver_cost = excluded.driver_cost, fuel_cost = excluded.fuel_cost,
      tolls_parking = excluded.tolls_parking, other_cost = excluded.other_cost,
      payment_status = excluded.payment_status;
  end if;

  return v_id;
end $$;

-- A driver marks one of their own jobs done (or no-show, or back to
-- confirmed if they tapped the wrong button), with notes and the distance
-- driven. Nothing else about the job can be changed this way.
create or replace function public.driver_update_job(
  p_job_id uuid,
  p_status public.job_status,
  p_driver_notes text,
  p_distance_km numeric
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

  update public.jobs set
    status = p_status,
    driver_notes = nullif(btrim(coalesce(p_driver_notes, '')), ''),
    distance_km = coalesce(p_distance_km, distance_km)
  where id = p_job_id;
end $$;

revoke all on function public.save_job(uuid, jsonb, jsonb) from public, anon;
revoke all on function public.driver_update_job(uuid, public.job_status, text, numeric) from public, anon;
grant execute on function public.save_job(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.driver_update_job(uuid, public.job_status, text, numeric) to authenticated;
