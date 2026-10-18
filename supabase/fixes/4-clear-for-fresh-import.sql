-- Clears the dashboard for a fresh import of the booking spreadsheet.
--
-- REMOVES: every booking (and its charges / payments), leads, monthly costs,
--          time off. Booking numbers start again at J-1001.
-- KEEPS:   the team and their logins, vehicles, settings, the weekly target.
--
-- The free Supabase plan has no backups, so this first copies everything it
-- removes into a "backup" schema (not reachable from the app or the API).
-- If anything goes wrong it all happens or nothing does. The way back is
-- 4b-undo-clear.sql.

begin;

create schema if not exists backup;
revoke all on schema backup from public, anon, authenticated;

create table backup.jobs_20261018      as table public.jobs;
create table backup.job_money_20261018 as table public.job_money;
create table backup.lead_days_20261018 as table public.lead_days;
create table backup.overheads_20261018 as table public.overheads;
create table backup.time_off_20261018  as table public.time_off;

delete from public.job_money;
delete from public.jobs;
delete from public.lead_days;
delete from public.overheads;
delete from public.time_off;

alter table public.jobs alter column job_no restart with 1001;

commit;

-- Check: the first column should be 0, the second the number of bookings saved.
select
  (select count(*) from public.jobs)              as bookings_left,
  (select count(*) from backup.jobs_20261018)     as bookings_backed_up,
  (select count(*) from backup.job_money_20261018) as money_rows_backed_up;

-- To undo it, run 4b-undo-clear.sql (before importing again).
-- Once the new import looks right, the backup can be dropped:
--   drop schema backup cascade;
