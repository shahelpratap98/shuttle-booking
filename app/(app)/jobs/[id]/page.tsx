import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { deleteJob } from "@/app/(app)/jobs/actions";
import { AssignForm, DriverDoneForm, StatusButtons } from "@/app/(app)/jobs/job-controls";
import { PaymentChip, PersonDot, StatusChip, Unassigned } from "@/components/chips";
import { ActionSubmit } from "@/components/pending-buttons";
import { driverOptions, vehicleOptions } from "@/lib/assign-options";
import { isOffice, requireViewer } from "@/lib/auth";
import { jobWarnings } from "@/lib/clashes";
import { SERVICE_LABEL, SOURCE_LABEL } from "@/lib/constants";
import { fmtDuration, fmtLong, fmtTime, minutesOf, timeFromMinutes } from "@/lib/dates";
import { jobRef, mapsLink, money, profit, totalCost } from "@/lib/format";

export const metadata: Metadata = { title: "Job" };

const SAVED: Record<string, string> = { created: "Job created.", updated: "Changes saved." };

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
  const [settings, people, vehicles, sameDay, timeOff] = await Promise.all([
    store.settings(),
    store.people(),
    store.vehicles(),
    store.jobs({ from: job.pickup_date, to: job.pickup_date }),
    store.timeOff(job.pickup_date, job.pickup_date),
  ]);
  const cur = settings.currency;
  const driver = people.find((p) => p.user_id === job.driver_id);
  const vehicle = vehicles.find((v) => v.id === job.vehicle_id);
  const warnings = office ? jobWarnings(job, sameDay, timeOff, people, vehicles) : [];
  const ends = timeFromMinutes(minutesOf(job.pickup_time) + job.duration_min);
  const saved = typeof q.saved === "string" ? SAVED[q.saved] : undefined;
  const error = typeof q.error === "string" ? q.error : undefined;
  const m = job.money;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-muted">
            <Link href={office ? "/jobs" : "/my-jobs"} className="hover:underline">{office ? "Jobs" : "My jobs"}</Link> / {jobRef(job.job_no)}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-[28px]">
            {fmtLong(job.pickup_date)}, {fmtTime(job.pickup_time)}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-[15px] text-muted">
            <StatusChip status={job.status} />
            {SERVICE_LABEL[job.service_type]} · until about {fmtTime(ends)} ({fmtDuration(job.duration_min)})
          </p>
        </div>
        {office ? (
          <div className="flex flex-wrap gap-2 print:hidden">
            <Link href={`/jobs/${job.id}/edit`} className="btn btn-primary">Edit</Link>
            <Link href={`/jobs/new?from=${job.id}&return=1`} className="btn btn-quiet">Add return trip</Link>
            <Link href={`/jobs/new?from=${job.id}`} className="btn btn-quiet">Copy</Link>
          </div>
        ) : null}
      </div>

      {saved ? <p role="status" className="rounded-lg bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">{saved}</p> : null}
      {error ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{error}</p> : null}
      {warnings.length ? (
        <div role="alert" className="rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm text-warn">
          <p className="font-bold">Check this before the day</p>
          <ul className="mt-1 list-disc pl-5">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </div>
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
            <a href={mapsLink(job.pickup_address, job.dropoff_address)} target="_blank" rel="noreferrer" className="link mt-3 inline-block text-sm print:hidden">
              Open directions in Google Maps
            </a>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Fact label="Passengers" value={job.passengers} />
              <Fact label="Bags" value={job.luggage} />
              <Fact label="Flight" value={job.flight_no ?? "–"} />
              <Fact label="Distance" value={job.distance_km == null ? "–" : `${job.distance_km} km`} />
            </dl>
            {job.notes ? <p className="mt-4 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn"><b>Notes:</b> {job.notes}</p> : null}
            {job.driver_notes ? <p className="mt-2 rounded-lg bg-surface-2 px-3 py-2 text-sm"><b>From the driver:</b> {job.driver_notes}</p> : null}
          </Card>

          <Card title="Customer">
            <p className="text-[17px] font-semibold">{job.customer_name}</p>
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {job.customer_phone ? <a href={`tel:${job.customer_phone.replace(/\s/g, "")}`} className="link">{job.customer_phone}</a> : null}
              {job.customer_email ? <a href={`mailto:${job.customer_email}`} className="link">{job.customer_email}</a> : null}
              {!job.customer_phone && !job.customer_email ? <span className="text-muted">No contact details</span> : null}
            </div>
            {office ? <p className="mt-2 text-sm text-muted">Booked by {SOURCE_LABEL[job.booking_source].toLowerCase()} on {fmtLong(job.created_at.slice(0, 10))}.</p> : null}
          </Card>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <Card title="Driver and vehicle">
            <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
              {driver ? (
                <span className="inline-flex items-center gap-2 font-semibold"><PersonDot colour={driver.colour} /> {driver.display_name}</span>
              ) : (
                <Unassigned />
              )}
              {vehicle ? <span className="text-muted">in {vehicle.name}{vehicle.registration ? ` (${vehicle.registration})` : ""}</span> : null}
            </p>
            {office ? (
              <AssignForm
                jobId={job.id}
                driverId={job.driver_id}
                vehicleId={job.vehicle_id}
                drivers={driverOptions(job, people, sameDay, timeOff)}
                vehicles={vehicleOptions(job, vehicles, sameDay)}
              />
            ) : null}
          </Card>

          {office ? (
            <Card title="Status">
              <StatusButtons jobId={job.id} status={job.status} />
            </Card>
          ) : job.driver_id === viewer.user_id && ["confirmed", "completed", "no_show"].includes(job.status) ? (
            <Card title="Finish the job">
              <DriverDoneForm jobId={job.id} status={job.status} distanceKm={job.distance_km} driverNotes={job.driver_notes} />
            </Card>
          ) : null}

          {office && m ? (
            <Card title="Money">
              <dl className="flex flex-col gap-1.5 text-sm tabular">
                <Row label="Price charged" value={money(m.price, cur)} strong />
                <Row label="Driver pay" value={`− ${money(m.driver_cost, cur)}`} />
                <Row label="Fuel and running" value={`− ${money(m.fuel_cost, cur)}`} />
                <Row label="Tolls and parking" value={`− ${money(m.tolls_parking, cur)}`} />
                <Row label="Other costs" value={`− ${money(m.other_cost, cur)}`} />
                <div className="my-1 border-t border-line" />
                <Row label="Total costs" value={money(totalCost(m), cur)} />
                <Row
                  label="Profit"
                  value={`${money(profit(m), cur)}${m.price > 0 ? ` (${Math.round((profit(m) / m.price) * 100)}%)` : ""}`}
                  strong
                  tone={profit(m) < 0 ? "text-bad" : "text-ok"}
                />
              </dl>
              <p className="mt-3 flex items-center gap-2 text-sm">Payment: <PaymentChip status={m.payment_status} /></p>
            </Card>
          ) : null}

          {office ? (
            <form action={deleteJob} className="print:hidden">
              <input type="hidden" name="job_id" value={job.id} />
              <ActionSubmit
                pendingLabel="Deleting…"
                className="btn btn-sm btn-danger"
                confirm={`Delete ${jobRef(job.job_no)} for good? If it was just called off, mark it cancelled instead so it still counts in your cancellation rate.`}
              >
                Delete job
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
