-- One-off fix after the first import of "2025 Booking.xlsx" (run once, now).
-- Before the "Car" vehicle existed, the importer took "Car" in the Vehicle
-- column for another operator's name. This puts those bookings back in the
-- Car (or Van, …) vehicle, and folds the "2 Trips Van" vehicle into Van.

-- 1. Bookings "given to" an operator that's really a vehicle name.
update public.jobs j
set operator = null,
    vehicle_id = coalesce(j.vehicle_id, (select v.id from public.vehicles v where lower(v.name) = lower(btrim(j.operator)) limit 1))
where j.operator ~* '^\s*(car|van|wagon|hiace|bus|suv|sedan|prius|camry)s?\s*$';

-- 2. "2 Trips Van" isn't a vehicle: its bookings go to Van, then it's removed.
update public.jobs
set vehicle_id = (select id from public.vehicles where name = 'Van')
where vehicle_id = (select id from public.vehicles where name = '2 Trips Van')
  and exists (select 1 from public.vehicles where name = 'Van');
delete from public.vehicles
where name = '2 Trips Van'
  and not exists (select 1 from public.jobs j join public.vehicles v on v.id = j.vehicle_id where v.name = '2 Trips Van');

-- Check: should be 0 rows.
select operator, count(*) from public.jobs
where operator ~* '^\s*(car|van|wagon|hiace|bus|suv|sedan|prius|camry)s?\s*$'
group by operator;
