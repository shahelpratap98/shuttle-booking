-- Run after 2-link-drivers.sql. A few older rows had the driver's name in
-- the "More info" column instead of Driver (e.g. "Sunny", "Afroz"), so they
-- came in as Driver TBC with notes starting "Sunny. ...". This gives each one
-- that driver (first name on the Team page, whole word only) and takes the
-- name off the front of the notes. Safe to run again.

update public.jobs j
set driver_id = p.user_id,
    notes = nullif(btrim(regexp_replace(j.notes, '^\s*[A-Za-z]+\.\s*', '')), '')
from public.profiles p
where j.driver_id is null
  and j.operator is null
  and p.is_active
  and lower(split_part(btrim(p.display_name), ' ', 1)) = lower(substring(j.notes from '^\s*([A-Za-z]+)\.(?:\s|$)'));

-- Check: TBC bookings whose notes still start with a single word, most common first
-- (anyone listed here isn't on the Team page, e.g. Naita).
select substring(notes from '^\s*([A-Za-z]+)\.(?:\s|$)') as name_in_notes, count(*) as bookings
from public.jobs
where driver_id is null and notes ~ '^\s*[A-Za-z]+\.(\s|$)'
group by 1 order by 2 desc;
