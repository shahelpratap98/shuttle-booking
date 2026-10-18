-- Undo 4-clear-for-fresh-import.sql: puts back every booking, leads, costs
-- and time off from the "backup" schema. Run it BEFORE importing again
-- (otherwise booking numbers would clash). Columns the database works out
-- for itself (like the customer matching key) are recalculated.

do $$
declare t text; cols text;
begin
  if exists (select 1 from public.jobs) then
    raise exception 'There are bookings in the dashboard already. Undo only works on an empty dashboard.';
  end if;
  foreach t in array array['jobs', 'job_money', 'lead_days', 'overheads', 'time_off'] loop
    select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
    where table_schema = 'public' and table_name = t and is_generated = 'NEVER';
    execute format('insert into public.%I (%s) overriding system value select %s from backup.%I', t, cols, cols, t || '_20261018');
  end loop;
  perform setval(pg_get_serial_sequence('public.jobs', 'job_no'), (select max(job_no) from public.jobs));
end $$;

-- Check: should match the numbers the clear script reported.
select (select count(*) from public.jobs) as bookings, (select count(*) from public.job_money) as money_rows;
