import type { Metadata } from "next";
import Link from "next/link";
import { DriverDoneForm } from "@/app/(app)/jobs/job-controls";
import { StatusChip } from "@/components/chips";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireViewer } from "@/lib/auth";
import { SERVICE_LABEL } from "@/lib/constants";
import { addDays, fmtDay, fmtDuration, fmtTime, minutesOf, startOfWeek, timeFromMinutes, todayIn } from "@/lib/dates";
import { bookingRef, mapsLink, money } from "@/lib/format";
import type { Job, Vehicle } from "@/lib/types";

export const metadata: Metadata = { title: "My jobs" };

// A driver's day on their phone: what's next, where to go, who to call, and
// a button to say it's done.
export default async function MyJobsPage() {
  const { viewer, store } = await requireViewer();
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const [jobs, vehicles, timeOff] = await Promise.all([
    store.jobs({ from: addDays(today, -7), to: addDays(today, 21), driverId: viewer.user_id }),
    store.vehicles(),
    store.timeOff(today, addDays(today, 21)),
  ]);
  const vehicle = new Map(vehicles.map((v) => [v.id, v]));
  const mine = jobs.filter((j) => j.status !== "cancelled");

  const todays = mine.filter((j) => j.pickup_date === today);
  const upcoming = mine.filter((j) => j.pickup_date > today);
  // Past jobs still not marked done: the driver's to-do.
  const toFinish = mine.filter((j) => j.pickup_date < today && j.status === "confirmed");
  const recent = mine.filter((j) => j.pickup_date < today && j.status !== "confirmed").reverse();

  const weekStart = startOfWeek(today);
  const thisWeek = mine.filter((j) => j.pickup_date >= weekStart && j.pickup_date <= addDays(weekStart, 6));
  const myOff = timeOff.filter((t) => t.user_id === viewer.user_id);

  const byDay = new Map<string, Job[]>();
  for (const j of upcoming) byDay.set(j.pickup_date, [...(byDay.get(j.pickup_date) ?? []), j]);

  return (
    <>
      <PageHeader
        title={`Hi ${viewer.display_name.split(" ")[0]}`}
        intro={<>This week: {thisWeek.length} job{thisWeek.length === 1 ? "" : "s"}, about {fmtDuration(thisWeek.reduce((s, j) => s + j.duration_min, 0))} of driving.</>}
        actions={<Link href="/calendar" className="btn btn-quiet">My calendar</Link>}
      />

      {myOff.length ? (
        <p className="mb-4 rounded-lg bg-surface-2 px-3 py-2 text-sm">
          Time off booked: {myOff.map((t) => (t.starts_on === t.ends_on ? fmtDay(t.starts_on) : `${fmtDay(t.starts_on)} – ${fmtDay(t.ends_on)}`)).join(", ")}.{" "}
          <Link href="/time-off" className="link">Manage</Link>
        </p>
      ) : null}

      {toFinish.length ? (
        <section className="mb-6">
          <h2 className="mb-2 text-lg font-bold text-warn">Still to mark as done ({toFinish.length})</h2>
          <div className="flex flex-col gap-3">
            {toFinish.map((j) => <JobCard key={j.id} job={j} vehicle={j.vehicle_id ? vehicle.get(j.vehicle_id) : undefined} today={today} currency={settings.currency} finish />)}
          </div>
        </section>
      ) : null}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Today, {fmtDay(today)}</h2>
        {todays.length === 0 ? (
          <EmptyState title="No jobs today." />
        ) : (
          <div className="flex flex-col gap-3">
            {todays.map((j) => <JobCard key={j.id} job={j} vehicle={j.vehicle_id ? vehicle.get(j.vehicle_id) : undefined} today={today} currency={settings.currency} finish />)}
          </div>
        )}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-bold">Coming up</h2>
        {byDay.size === 0 ? (
          <EmptyState title="Nothing booked in the next three weeks yet." />
        ) : (
          <div className="flex flex-col gap-5">
            {[...byDay.entries()].map(([d, list]) => (
              <div key={d}>
                <h3 className="mb-2 text-sm font-bold text-muted uppercase">{d === addDays(today, 1) ? "Tomorrow" : fmtDay(d)}</h3>
                <div className="flex flex-col gap-3">
                  {list.map((j) => <JobCard key={j.id} job={j} vehicle={j.vehicle_id ? vehicle.get(j.vehicle_id) : undefined} today={today} currency={settings.currency} />)}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {recent.length ? (
        <section>
          <h2 className="mb-2 text-lg font-bold">Last 7 days</h2>
          <ul className="card divide-y divide-line">
            {recent.map((j) => (
              <li key={j.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="w-24 shrink-0 font-semibold">{fmtDay(j.pickup_date)}</span>
                <Link href={`/jobs/${j.id}`} className="min-w-0 flex-1 truncate hover:underline">{fmtTime(j.pickup_time)} · {j.customer_name}</Link>
                <StatusChip status={j.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function JobCard({ job: j, vehicle, today, currency, finish }: { job: Job; vehicle?: Vehicle; today: string; currency: string; finish?: boolean }) {
  const toCollect = j.collect_amount > 0 && !j.collected_via;
  const ends = timeFromMinutes(minutesOf(j.pickup_time) + j.duration_min);
  return (
    <article className="card overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2.5">
        <span className="text-xl font-bold tabular">{fmtTime(j.pickup_time)}</span>
        <span className="text-sm text-muted">until about {fmtTime(ends)}</span>
        {j.pickup_date !== today ? <span className="text-sm font-semibold">{fmtDay(j.pickup_date)}</span> : null}
        <span className="ml-auto flex items-center gap-2">
          <Link href={`/jobs/${j.id}`} className="text-sm text-muted hover:underline">{bookingRef(j)}</Link>
          {j.status !== "confirmed" ? <StatusChip status={j.status} /> : null}
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold text-muted uppercase">Pick up</p>
          <p className="text-[17px] font-semibold">{j.pickup_address}</p>
          <p className="mt-2 text-xs font-semibold text-muted uppercase">Drop off</p>
          <p className="text-[17px] font-semibold">{j.dropoff_address}</p>
          <a href={mapsLink(j.pickup_address, j.dropoff_address)} target="_blank" rel="noreferrer" className="btn btn-quiet btn-sm mt-3">Directions</a>
        </div>
        <div className="text-sm">
          <p className="text-[17px] font-semibold">{j.customer_name}</p>
          {j.customer_phone ? (
            <a href={`tel:${j.customer_phone.replace(/\s/g, "")}`} className="btn btn-quiet btn-sm mt-1">Call {j.customer_phone}</a>
          ) : null}
          <p className="mt-3 text-muted">
            {j.passengers} passenger{j.passengers === 1 ? "" : "s"}
            {j.luggage ? `, ${j.luggage} bag${j.luggage === 1 ? "" : "s"}` : ""}
            {j.flight_no ? ` · flight ${j.flight_no}` : ""} · {SERVICE_LABEL[j.service_type]}
          </p>
          {vehicle ? <p className="text-muted">Vehicle: {vehicle.name}{vehicle.registration ? ` (${vehicle.registration})` : ""}</p> : null}
          {j.is_shared ? <p className="text-muted">Shared ride with other bookings</p> : null}
          <p className="mt-2 flex flex-wrap gap-2">
            {toCollect ? (
              <span className="chip bg-info-bg px-3 py-1 text-sm text-info">Collect {money(j.collect_amount, currency)}</span>
            ) : j.collected_via ? (
              <span className="chip bg-ok-bg px-3 py-1 text-sm text-ok">Collected ({j.collected_via})</span>
            ) : (
              <span className="chip bg-surface-2 px-3 py-1 text-sm text-muted">Nothing to collect</span>
            )}
            {j.driver_pay ? <span className="chip bg-surface-2 px-3 py-1 text-sm text-text">Your pay {money(j.driver_pay, currency)}</span> : null}
          </p>
          {j.notes ? <p className="mt-2 rounded-lg bg-warn-bg px-3 py-2 text-warn"><b>Note:</b> {j.notes}</p> : null}
        </div>
      </div>
      {finish ? (
        <div className="border-t border-line p-4">
          <DriverDoneForm
            jobId={j.id}
            status={j.status}
            distanceKm={j.distance_km}
            driverNotes={j.driver_notes}
            collect={toCollect ? money(j.collect_amount, currency) : null}
            canFinish={j.pickup_date <= today}
          />
        </div>
      ) : null}
    </article>
  );
}
