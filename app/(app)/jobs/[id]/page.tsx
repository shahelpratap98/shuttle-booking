import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { deleteJob } from "@/app/(app)/jobs/actions";
import { JobCard } from "@/app/(app)/jobs/job-card";
import { AssignForm, DriverDoneForm, StatusButtons } from "@/app/(app)/jobs/job-controls";
import { PaymentChip, PersonDot, RepeatChip, StatusChip, Unassigned } from "@/components/chips";
import { ActionSubmit } from "@/components/pending-buttons";
import { TripActions } from "@/components/trip-actions";
import { driverOptions, vehicleOptions } from "@/lib/assign-options";
import { isOffice, requireViewer } from "@/lib/auth";
import { jobWarnings } from "@/lib/clashes";
import { BILLABLE, METHOD_LABEL, SERVICE_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { customerKey } from "@/lib/customers";
import { endOfMonth, fmtDate, fmtDay, fmtDuration, fmtLong, fmtMonth, fmtTime, minutesOf, startOfMonth, timeFromMinutes, todayIn } from "@/lib/dates";
import { bookingRef, businessPay, charge, expenses, jobRef, money, profit, shareLabel, whatsappNumber } from "@/lib/format";
import { jobCardText } from "@/lib/job-card";

export const metadata: Metadata = { title: "Booking" };

const SAVED: Record<string, string> = { created: "Booking saved.", updated: "Changes saved." };

export default async function JobPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { viewer, store } = await requireViewer();
  const { id } = await params;
  const q = await searchParams;
  const job = await store.job(id);
  if (!job) notFound();

  const office = isOffice(viewer.role);
  const saved = typeof q.saved === "string" ? SAVED[q.saved] : undefined;
  const [settings, people, vehicles, sameDay, timeOff, linked, repeats, monthJobs] = await Promise.all([
    store.settings(),
    store.people(),
    store.vehicles(),
    store.jobs({ from: job.pickup_date, to: job.pickup_date }),
    store.timeOff(job.pickup_date, job.pickup_date),
    job.linked_job_id ? store.job(job.linked_job_id) : Promise.resolve(null),
    store.repeatCounts([job.id]),
    // After a save: the month's new total, for the banner.
    saved && office ? store.jobs({ from: startOfMonth(job.pickup_date), to: endOfMonth(job.pickup_date), statuses: BILLABLE }) : Promise.resolve([]),
  ]);
  const earlier = repeats[job.id] ?? 0;
  // The office sees the customer's other bookings.
  const history =
    office && earlier
      ? (await store.jobs({ customerKey: customerKey(job.customer_name, job.customer_phone), order: "desc", limit: 50 })).filter((o) => o.id !== job.id)
      : [];
  const cur = settings.currency;
  const share = shareLabel(settings.business_name);
  const driver = people.find((p) => p.user_id === job.driver_id);
  const vehicle = vehicles.find((v) => v.id === job.vehicle_id);
  const warnings = office ? jobWarnings(job, sameDay, timeOff, people, vehicles) : [];
  const sharedWith = job.is_shared ? sameDay.filter((o) => o.id !== job.id && o.is_shared && o.driver_id === job.driver_id && o.status !== "cancelled") : [];
  const ends = timeFromMinutes(minutesOf(job.pickup_time) + job.duration_min);
  const error = typeof q.error === "string" ? q.error : undefined;
  const m = job.money;
  const mine = job.driver_id === viewer.user_id;
  const toCollect = job.collect_amount > 0 && !job.collected_via;
  const today = todayIn(settings.timezone);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">
            <Link href={office ? "/jobs" : "/my-jobs"} className="hover:underline">{office ? "Bookings" : "My jobs"}</Link> / {bookingRef(job)}
            {job.booking_ref ? <span className="font-normal"> ({jobRef(job.job_no)})</span> : null}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-[28px]">
            {fmtLong(job.pickup_date)}, {fmtTime(job.pickup_time)}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted">
            <StatusChip status={job.status} />
            {job.is_shared ? <span className="chip bg-info-bg text-info">Shared ride</span> : null}
            {SERVICE_LABEL[job.service_type]} · driver busy until about {fmtTime(ends)} ({fmtDuration(job.duration_min)})
          </p>
        </div>
        {office ? (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href={`/jobs/${job.id}/edit`} className="btn btn-primary">Edit</Link>
            {!job.linked_job_id ? <Link href={`/jobs/new?from=${job.id}&return=1`} className="btn btn-quiet">Add return trip</Link> : null}
            <Link href={`/jobs/new?from=${job.id}`} className="btn btn-quiet">Copy</Link>
          </div>
        ) : null}
      </div>

      {saved ? (
        <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">
          {saved}
          {monthJobs.length ? (
            <span className="font-normal">
              {" "}{fmtMonth(job.pickup_date)} is now {monthJobs.length} booking{monthJobs.length === 1 ? "" : "s"},{" "}
              {money(monthJobs.reduce((sum, o) => sum + charge(o), 0), cur, { cents: false })} booked. <Link href={`/totals?year=${job.pickup_date.slice(0, 4)}`} className="underline">Totals</Link>
            </span>
          ) : null}
        </p>
      ) : null}
      {error ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{error}</p> : null}
      {warnings.length ? (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
          <p className="font-bold">Check this before the day</p>
          <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
      ) : null}
      {toCollect ? (
        <p className="rounded-lg border border-info/30 bg-info-bg px-4 py-3 text-[15px] font-semibold text-info">
          {mine && !office ? "Collect" : "Driver collects"} {money(job.collect_amount, cur)} from the customer on the day.
        </p>
      ) : job.collected_via ? (
        <p className="rounded-lg bg-ok-bg px-4 py-2.5 text-sm font-semibold text-ok">
          {money(job.collect_amount, cur)} collected by the driver ({METHOD_LABEL[job.collected_via].toLowerCase()}).
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Trip">
            <ol className="relative flex flex-col gap-4 border-l-2 border-line-2 pl-5">
              <li>
                <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-surface bg-series-1" aria-hidden="true" />
                <p className="text-xs font-semibold text-muted uppercase">Pick up · {fmtTime(job.pickup_time)}</p>
                <p className="text-[17px] font-semibold">{job.pickup_address}</p>
              </li>
              <li>
                <span className="absolute -left-[7px] mt-1.5 size-3 rounded-full border-2 border-surface bg-series-2" aria-hidden="true" />
                <p className="text-xs font-semibold text-muted uppercase">Drop off</p>
                <p className="text-[17px] font-semibold">{job.dropoff_address}</p>
              </li>
            </ol>
            <div className="mt-4">
              <TripActions phone={job.customer_phone} pickup={job.pickup_address} dropoff={job.dropoff_address} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Fact label="# of people" value={job.passengers} />
              <Fact label="Bags" value={job.luggage} />
              <Fact label="Flight information" value={job.flight_no ?? "–"} />
              <Fact label="Km driven" value={job.distance_km == null ? "–" : `${job.distance_km} km`} />
            </dl>
            {job.notes ? <p className="mt-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn"><b>More info:</b> {job.notes}</p> : null}
            {job.driver_notes ? <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"><b>From the driver:</b> {job.driver_notes}</p> : null}
            {linked ? (
              <p className="mt-3 text-sm">
                {linked.pickup_date >= job.pickup_date ? "Return trip" : "Outbound trip"}:{" "}
                <Link href={`/jobs/${linked.id}`} className="link">{bookingRef(linked)}, {fmtDay(linked.pickup_date)} {fmtTime(linked.pickup_time)}</Link>
              </p>
            ) : null}
            {sharedWith.length ? (
              <p className="mt-2 text-sm">
                Shared with:{" "}
                {sharedWith.map((o, i) => (
                  <span key={o.id}>{i ? ", " : ""}<Link href={`/jobs/${o.id}`} className="link">{o.customer_name} ({fmtTime(o.pickup_time)})</Link></span>
                ))}
              </p>
            ) : null}
          </Card>

          <Card title="Customer">
            <p className="flex flex-wrap items-center gap-2 text-[17px] font-semibold">
              {job.customer_name}
              <RepeatChip earlier={earlier} long />
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {job.customer_phone ? <a href={`tel:${job.customer_phone.replace(/\s/g, "")}`} className="link">{job.customer_phone}</a> : null}
              {job.customer_email ? <a href={`mailto:${job.customer_email}`} className="link">{job.customer_email}</a> : null}
              {!job.customer_phone && !job.customer_email ? <span className="text-muted">No contact details</span> : null}
            </div>
            {office ? <p className="mt-2 text-sm text-muted">Booked through {SOURCE_LABEL[job.booking_source].toLowerCase()} on {fmtLong(job.created_at.slice(0, 10))}.</p> : null}
            {history.length ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-muted uppercase">Their other bookings</p>
                <ul className="mt-1 divide-y divide-line text-sm">
                  {history.slice(0, 5).map((o) => (
                    <li key={o.id} className="flex items-baseline gap-3 py-1.5">
                      <Link href={`/jobs/${o.id}`} className="w-24 shrink-0 font-semibold hover:underline">{fmtDay(o.pickup_date)}</Link>
                      <span className="min-w-0 flex-1 truncate text-muted">{o.pickup_address} → {o.dropoff_address}</span>
                      <span className="shrink-0 tabular">{o.status === "confirmed" || o.status === "completed" ? money(charge(o), cur, { cents: false }) : STATUS_LABEL[o.status]}</span>
                    </li>
                  ))}
                </ul>
                <Link href={`/jobs?view=all&customer=${encodeURIComponent(customerKey(job.customer_name, job.customer_phone))}`} className="link mt-1 inline-block text-sm">
                  All {history.length + 1} bookings
                </Link>
              </div>
            ) : null}
          </Card>

          {office ? (
            <Card title="Job card for the driver">
              <JobCard
                text={jobCardText(job, { businessName: settings.business_name, currency: cur, driver, vehicle, earlierBookings: earlier })}
                whatsappTo={whatsappNumber(driver?.phone)}
                driverName={driver?.display_name ?? null}
              />
            </Card>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Driver and vehicle">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {driver ? <span className="inline-flex items-center gap-2 font-semibold"><PersonDot colour={driver.colour} /> {driver.display_name}</span> : <Unassigned />}
              {vehicle ? <span className="text-muted">in the {vehicle.name}{vehicle.registration ? ` (${vehicle.registration})` : ""}</span> : null}
            </p>
            {office ? (
              <AssignForm
                jobId={job.id}
                driverId={job.driver_id}
                vehicleId={job.vehicle_id}
                drivers={driverOptions(job, people, sameDay, timeOff)}
                vehicles={vehicleOptions(job, vehicles, sameDay)}
              />
            ) : mine ? (
              <p className="text-sm">Your pay for this job: <b className="tabular">{money(job.driver_pay, cur)}</b></p>
            ) : null}
          </Card>

          {office ? (
            <Card title="Status">
              <StatusButtons jobId={job.id} status={job.status} />
            </Card>
          ) : mine && ["confirmed", "completed", "no_show"].includes(job.status) ? (
            <Card title="Finish the job">
              <DriverDoneForm
                jobId={job.id}
                status={job.status}
                distanceKm={job.distance_km}
                driverNotes={job.driver_notes}
                collect={toCollect ? money(job.collect_amount, cur) : null}
                canFinish={job.pickup_date <= today}
              />
            </Card>
          ) : null}

          {office && m ? (
            <Card title="Charges and pay">
              <dl className="flex flex-col gap-1.5 text-sm tabular">
                <Row label="Charge" value={money(charge(job), cur)} strong />
                <Row label="Driver pay" value={`− ${money(job.driver_pay, cur)}`} />
                <div className="my-1 border-t border-line" />
                <Row
                  label={share}
                  value={`${money(businessPay(job), cur)}${charge(job) > 0 ? ` (${Math.round((businessPay(job) / charge(job)) * 100)}%)` : ""}`}
                  strong
                  tone={businessPay(job) < 0 ? "text-bad" : "text-ok"}
                />
                {expenses(job) > 0 ? (
                  <>
                    <Row label="Fuel" value={`− ${money(m.fuel_cost, cur)}`} />
                    <Row label="Tolls and parking" value={`− ${money(m.tolls_parking, cur)}`} />
                    <Row label="Other" value={`− ${money(m.other_cost, cur)}`} />
                    <Row label="Profit after expenses" value={money(profit(job), cur)} strong />
                  </>
                ) : null}
              </dl>
              <p className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                Payment: <PaymentChip status={m.payment_status} />
                {m.payment_status === "paid" && (m.payment_method || m.paid_on) ? (
                  <span className="text-muted">
                    {m.payment_method ? METHOD_LABEL[m.payment_method].toLowerCase() : ""}
                    {m.paid_on ? ` on ${fmtDate(m.paid_on)}` : ""}
                  </span>
                ) : null}
              </p>
            </Card>
          ) : null}

          {office ? (
            <form action={deleteJob} className="print:hidden">
              <input type="hidden" name="job_id" value={job.id} />
              <ActionSubmit
                pendingLabel="Deleting…"
                className="btn btn-sm btn-danger"
                confirm={`Delete ${bookingRef(job)} for good? If it was just called off, mark it cancelled instead so it still counts in your cancellation rate.`}
              >
                Delete booking
              </ActionSubmit>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <h2 className="mb-3 text-[15px] font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted"}>{label}</dt>
      <dd className={`${strong ? "font-bold" : ""} ${tone ?? ""}`}>{value}</dd>
    </div>
  );
}
