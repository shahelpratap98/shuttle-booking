// Runs the migrations in an in-process Postgres (PGlite) with a stand-in for
// Supabase's auth schema, then checks the security rules as each role.
//   npm run test:sql
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const dir = join(import.meta.dirname, "..", "supabase", "migrations");

// Just enough of Supabase for the migrations to run.
await db.exec(`
  create role anon nologin;
  create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.uid() to authenticated;
  grant usage on schema public to authenticated;
`);

for (const f of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
  try {
    await db.exec(readFileSync(join(dir, f), "utf8"));
  } catch (e) {
    console.error(`${f}: ${e.message}${e.where ? ` (${e.where})` : ""}`);
    process.exit(1);
  }
  console.log("applied", f);
}

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? "  pass" : "  FAIL"}  ${label}`);
  if (!cond) failures++;
};

const OWNER = "00000000-0000-0000-0000-000000000001";
const DISP = "00000000-0000-0000-0000-000000000002";
const DRV_A = "00000000-0000-0000-0000-000000000003";
const DRV_B = "00000000-0000-0000-0000-000000000004";

for (const [id, email, name] of [[OWNER, "owner@x.nz", "Olive"], [DISP, "desk@x.nz", "Dee"], [DRV_A, "a@x.nz", "Ari"], [DRV_B, "b@x.nz", "Ben"]]) {
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, jsonb_build_object('display_name', $3::text))`, [id, email, name]);
}

const roles = (await db.query(`select display_name, role from public.profiles order by email`)).rows;
ok(roles.find((r) => r.display_name === "Olive")?.role === "owner", "first user becomes owner");
ok(roles.filter((r) => r.role === "driver").length === 3, "everyone after that starts as a driver");
await db.query(`update public.profiles set role = 'dispatcher' where user_id = $1`, [DISP]);

// Run a function as a signed-in user, inside a transaction that is rolled back
// only if `rollback` is set.
async function as(userId, fn) {
  return db.transaction(async (tx) => {
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.query(`set local role authenticated`);
    return fn(tx);
  });
}
async function fails(userId, sql, params = []) {
  try {
    await as(userId, (tx) => tx.query(sql, params));
    return false;
  } catch {
    return true;
  }
}

// office creates a vehicle and two jobs (one for each driver) with money
const vehicleId = await as(DISP, async (tx) => (await tx.query(`insert into public.vehicles (name, seats, cost_per_km) values ('Van 1', 11, 0.35) returning id`)).rows[0].id);
const jobFor = (driver) => ({
  pickup_date: "2026-10-01", pickup_time: "05:30", duration_min: 75, pickup_address: "12 Queen St", dropoff_address: "Airport",
  passengers: 3, customer_name: "Pat", service_type: "airport", booking_source: "phone", driver_id: driver, vehicle_id: vehicleId, status: "confirmed",
});
const money = { price: 120, driver_cost: 35, fuel_cost: 12.5, tolls_parking: 0, other_cost: 0, payment_status: "unpaid" };
const jobA = await as(DISP, async (tx) => (await tx.query(`select public.save_job(null, $1, $2) as id`, [jobFor(DRV_A), money])).rows[0].id);
const jobB = await as(OWNER, async (tx) => (await tx.query(`select public.save_job(null, $1, $2) as id`, [jobFor(DRV_B), money])).rows[0].id);
ok(Boolean(jobA && jobB), "office and owner can create jobs with money through save_job");

const jobRow = (await db.query(`select job_no, pickup_time::text as t from public.jobs where id = $1`, [jobA])).rows[0];
ok(Number(jobRow.job_no) >= 1001 && jobRow.t === "05:30:00", "job numbers start at 1001; wall-clock time kept");

// editing keeps one money row
await as(DISP, (tx) => tx.query(`select public.save_job($1, $2, $3)`, [jobA, { ...jobFor(DRV_A), passengers: 4 }, { ...money, price: 140 }]));
const m = (await db.query(`select count(*)::int as n, max(price)::float as p from public.job_money where job_id = $1`, [jobA])).rows[0];
ok(m.n === 1 && m.p === 140, "save_job updates the job and upserts its money");

// drivers
const seenByA = await as(DRV_A, async (tx) => (await tx.query(`select id from public.jobs`)).rows.map((r) => r.id));
ok(seenByA.length === 1 && seenByA[0] === jobA, "a driver sees only their own jobs");
const moneyByA = await as(DRV_A, async (tx) => (await tx.query(`select * from public.job_money`)).rows);
ok(moneyByA.length === 0, "a driver can't read any prices or costs");
ok(await fails(DRV_A, `select public.save_job(null, $1, $2)`, [jobFor(DRV_A), money]), "a driver can't create jobs");
const updated = await as(DRV_A, async (tx) => (await tx.query(`update public.jobs set driver_id = $1 where id = $2 returning id`, [DRV_A, jobB])).rows);
ok(updated.length === 0, "a driver can't grab someone else's job");
const selfEdit = await as(DRV_A, async (tx) => (await tx.query(`update public.jobs set pickup_address = 'x' where id = $1 returning id`, [jobA])).rows);
ok(selfEdit.length === 0, "a driver can't edit their job directly");
ok(await fails(DRV_A, `select public.driver_update_job($1, 'completed', 'done', 40)`, [jobB]), "a driver can't complete someone else's job");
ok(await fails(DRV_A, `select public.driver_update_job($1, 'cancelled', null, null)`, [jobA]), "a driver can't cancel a job");
await as(DRV_A, (tx) => tx.query(`select public.driver_update_job($1, 'completed', '  Flight late 20 min ', 41.5)`, [jobA]));
const done = (await db.query(`select status, driver_notes, distance_km::float as km, completed_at from public.jobs where id = $1`, [jobA])).rows[0];
ok(done.status === "completed" && done.driver_notes === "Flight late 20 min" && done.km === 41.5 && done.completed_at, "a driver completes their own job; completed_at stamped");
await as(DRV_A, (tx) => tx.query(`select public.driver_update_job($1, 'confirmed', null, null)`, [jobA]));
ok((await db.query(`select completed_at from public.jobs where id = $1`, [jobA])).rows[0].completed_at === null, "undoing completion clears completed_at");

// people
const teamSeenByA = await as(DRV_A, async (tx) => (await tx.query(`select user_id from public.profiles`)).rows);
ok(teamSeenByA.length === 1, "a driver sees only their own profile (no pay rates of others)");
const promoted = await as(DRV_A, async (tx) => (await tx.query(`update public.profiles set role = 'owner' where user_id = $1 returning 1`, [DRV_A])).rows);
ok(promoted.length === 0, "a driver can't promote themselves");
const dispEdit = await as(DISP, async (tx) => (await tx.query(`update public.profiles set pay_rate = 99 where user_id = $1 returning 1`, [DRV_A])).rows);
ok(dispEdit.length === 0, "the dispatcher can't change the team (owner only)");
ok(await fails(OWNER, `update public.profiles set role = 'driver' where user_id = $1`, [OWNER]), "the last owner can't demote themselves");

// time off
await as(DRV_A, (tx) => tx.query(`insert into public.time_off (user_id, starts_on, ends_on, note) values ($1, '2026-10-05', '2026-10-06', 'Dentist')`, [DRV_A]));
ok(await fails(DRV_A, `insert into public.time_off (user_id, starts_on, ends_on) values ($1, '2026-10-05', '2026-10-06')`, [DRV_B]), "a driver can't book time off for someone else");
const offSeenByB = await as(DRV_B, async (tx) => (await tx.query(`select * from public.time_off`)).rows);
ok(offSeenByB.length === 0, "drivers don't see each other's time off");
const offSeenByDisp = await as(DISP, async (tx) => (await tx.query(`select * from public.time_off`)).rows);
ok(offSeenByDisp.length === 1, "the office sees everyone's time off");

// deactivated people lose everything
await as(OWNER, (tx) => tx.query(`update public.profiles set is_active = false where user_id = $1`, [DRV_B]));
const seenByInactive = await as(DRV_B, async (tx) => (await tx.query(`select id from public.jobs`)).rows);
ok(seenByInactive.length === 0, "a deactivated driver sees nothing");

// signed-out
let anonError = "";
try {
  await db.transaction(async (tx) => {
    await tx.query(`set local role anon`);
    await tx.query(`select * from public.jobs`);
  });
} catch (e) {
  anonError = e.message;
}
ok(/permission denied/.test(anonError), "anonymous visitors can't read jobs");

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
