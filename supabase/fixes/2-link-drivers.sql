-- Run AFTER adding the drivers on the Team page (Shef, Ali, Sunny, Deepak,
-- Arif, …). Bookings imported before a driver was on the Team came in as
-- Driver TBC with "Driver: Shef" in their notes; this gives each one its
-- driver (matched on the first name) and takes that line out of the notes.
-- Safe to run again after adding more drivers.

update public.jobs j
set driver_id = p.user_id,
    notes = nullif(btrim(regexp_replace(j.notes, '\s*Driver: [^.]*\.?', '', 'gi'), ' .'), '')
from public.profiles p
where j.driver_id is null
  and j.operator is null
  and p.is_active
  and lower(split_part(btrim(p.display_name), ' ', 1)) = substring(lower(j.notes) from 'driver: (?:recommend(?:ed)? )?([a-z]+)');

-- Check: names still waiting for a driver on the Team page, busiest first.
select substring(lower(notes) from 'driver: (?:recommend(?:ed)? )?([a-z]+)') as driver_in_notes, count(*) as bookings
from public.jobs
where driver_id is null and notes ~* 'driver: '
group by 1 order by 2 desc;
