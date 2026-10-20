-- Fixes the Oct-26 import (20 Oct 2026). The file's header said "Pick-up
-- Time", which the importer didn't recognise (fixed in commit e49561a), so
-- every booking came in at 12:00 am. This puts each booking's real time back,
-- matched one by one to its row in Oct-26.xlsx by job number, and fixes
-- J-1158 (Amanda, 26 Oct, Paeroa): the sheet says "Collect Cash Difference
-- paid on Shared shuttle", so the driver collects; it isn't paid.
--
-- Safe: it checks it finds exactly the 159 bookings it expects, still at
-- 12:00 am, and changes nothing if not. Run it once, then re-import
-- Oct-26.xlsx to add the 3 bookings the first import skipped.

begin;

create temp table oct_times (job_no bigint primary key, t time not null) on commit drop;
insert into oct_times (job_no, t) values
  (1008, '03:45'),
  (1009, '11:00'),
  (1010, '02:30'),
  (1011, '18:00'),
  (1012, '07:30'),
  (1013, '17:00'),
  (1014, '03:00'),
  (1015, '10:00'),
  (1016, '11:00'),
  (1017, '03:00'),
  (1018, '22:30'),
  (1019, '11:00'),
  (1020, '15:00'),
  (1021, '06:00'),
  (1022, '15:30'),
  (1023, '11:30'),
  (1024, '10:00'),
  (1025, '12:00'),
  (1026, '16:30'),
  (1027, '00:20'),
  (1028, '01:00'),
  (1029, '23:55'),
  (1030, '06:00'),
  (1031, '04:00'),
  (1032, '10:00'),
  (1033, '11:50'),
  (1034, '07:00'),
  (1035, '23:55'),
  (1036, '10:30'),
  (1037, '15:30'),
  (1038, '11:00'),
  (1039, '11:00'),
  (1040, '17:45'),
  (1041, '18:30'),
  (1042, '06:00'),
  (1043, '12:00'),
  (1044, '11:25'),
  (1045, '00:01'),
  (1046, '07:00'),
  (1047, '14:10'),
  (1048, '01:05'),
  (1049, '13:30'),
  (1050, '00:15'),
  (1051, '12:30'),
  (1052, '17:30'),
  (1053, '13:30'),
  (1054, '17:15'),
  (1055, '13:00'),
  (1056, '00:30'),
  (1057, '11:15'),
  (1058, '06:00'),
  (1059, '08:00'),
  (1060, '13:45'),
  (1061, '11:30'),
  (1062, '13:30'),
  (1063, '00:30'),
  (1064, '11:00'),
  (1065, '07:30'),
  (1066, '17:30'),
  (1067, '07:00'),
  (1068, '06:00'),
  (1069, '05:00'),
  (1070, '14:30'),
  (1071, '14:30'),
  (1072, '01:00'),
  (1073, '02:00'),
  (1074, '01:00'),
  (1075, '17:00'),
  (1076, '16:00'),
  (1077, '17:30'),
  (1078, '23:15'),
  (1079, '11:00'),
  (1080, '10:55'),
  (1081, '03:30'),
  (1082, '09:00'),
  (1083, '17:45'),
  (1084, '06:00'),
  (1085, '03:00'),
  (1086, '03:30'),
  (1087, '09:00'),
  (1088, '13:30'),
  (1089, '09:00'),
  (1090, '07:00'),
  (1091, '02:15'),
  (1092, '09:00'),
  (1093, '08:30'),
  (1094, '10:30'),
  (1095, '05:00'),
  (1096, '10:55'),
  (1097, '16:00'),
  (1098, '06:00'),
  (1099, '18:45'),
  (1100, '23:30'),
  (1101, '13:00'),
  (1102, '02:00'),
  (1103, '17:00'),
  (1104, '17:30'),
  (1105, '23:15'),
  (1106, '16:30'),
  (1107, '11:30'),
  (1108, '08:30'),
  (1109, '14:10'),
  (1110, '11:40'),
  (1111, '10:00'),
  (1112, '06:00'),
  (1113, '07:00'),
  (1114, '23:15'),
  (1115, '06:00'),
  (1116, '06:00'),
  (1117, '04:00'),
  (1118, '08:10'),
  (1119, '06:40'),
  (1120, '11:15'),
  (1121, '16:00'),
  (1122, '08:00'),
  (1123, '14:00'),
  (1124, '15:30'),
  (1125, '09:00'),
  (1126, '03:15'),
  (1127, '17:15'),
  (1128, '11:40'),
  (1129, '16:00'),
  (1130, '11:00'),
  (1131, '15:00'),
  (1132, '14:00'),
  (1133, '15:00'),
  (1134, '06:00'),
  (1135, '18:00'),
  (1136, '11:30'),
  (1137, '12:15'),
  (1138, '06:00'),
  (1139, '17:30'),
  (1140, '09:30'),
  (1141, '13:30'),
  (1142, '19:00'),
  (1143, '19:50'),
  (1144, '11:00'),
  (1145, '12:25'),
  (1146, '07:30'),
  (1147, '13:00'),
  (1148, '06:30'),
  (1149, '17:00'),
  (1150, '14:00'),
  (1151, '08:30'),
  (1152, '19:30'),
  (1153, '00:05'),
  (1154, '19:10'),
  (1155, '10:00'),
  (1156, '09:30'),
  (1157, '17:15'),
  (1159, '23:30'),
  (1160, '14:00'),
  (1161, '00:30'),
  (1162, '09:00'),
  (1163, '16:00'),
  (1164, '04:00'),
  (1165, '13:00'),
  (1166, '18:20'),
  (1167, '15:10');

do $$
declare n int;
begin
  if (select count(*) from oct_times) <> 159 then
    raise exception 'The list should have 159 bookings. Nothing changed.';
  end if;
  select count(*) into n
  from public.jobs j join oct_times o using (job_no)
  where j.pickup_time = '00:00' and j.pickup_date between '2026-10-01' and '2026-10-31';
  if n <> 159 then
    raise exception 'Expected 159 October bookings at 12:00 am, found %. Nothing changed.', n;
  end if;
  if not exists (select 1 from public.jobs where job_no = 1158 and customer_name = 'Amanda' and pickup_date = '2026-10-26' and dropoff_address = '5 Falcon Lane Paeroa') then
    raise exception 'J-1158 is not the Amanda / Paeroa booking. Nothing changed.';
  end if;
end $$;

update public.jobs j
set pickup_time = o.t
from oct_times o
where j.job_no = o.job_no and j.pickup_time = '00:00';

-- J-1158: the driver collects the charge on the day.
update public.job_money m
set payment_status = 'pay_on_day', payment_method = null, paid_on = null
from public.jobs j
where j.id = m.job_id and j.job_no = 1158;

update public.jobs j
set collect_amount = greatest(m.price - m.amount_paid, 0),
    collected_via = null,
    notes = concat_ws('. ', nullif(j.notes, ''), 'Time: Shared Shuttle')
from public.job_money m
where j.id = m.job_id and j.job_no = 1158;

commit;

-- Check: 0 bookings still at 12:00 am except J-1158 (its sheet time was
-- "Shared Shuttle"), and J-1158 is pay on the day.
select
  (select count(*) from public.jobs where pickup_date between '2026-10-01' and '2026-10-31' and pickup_time = '00:00' and job_no <> 1158) as still_midnight,
  (select payment_status from public.job_money m join public.jobs j on j.id = m.job_id where j.job_no = 1158) as j1158_payment,
  (select collect_amount from public.jobs where job_no = 1158) as j1158_collect;
