import type { Metadata } from "next";
import Link from "next/link";
import { AssignForm } from "@/app/(app)/jobs/job-controls";
import { PaymentChip, PersonDot, StatusChip, Unassigned } from "@/components/chips";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterSubmit } from "@/components/pending-buttons";
import { driverOptions, vehicleOptions } from "@/lib/assign-options";
import { requireOffice } from "@/lib/auth";
import { NO_DRIVER, SERVICE_LABEL, SERVICES, STATUS_LABEL, STATUSES } from "@/lib/constants";
import { addDays, fmtDay, fmtTime, isIsoDate, todayIn } from "@/lib/dates";
import { bookingRef, businessPay, charge, money, shareLabel } from "@/lib/format";
import type { Job, JobQuery, JobStatus, ServiceType } from "@/lib/types";

export const metadata: Metadata = { title: "Bookings" };

const VIEWS = {
  available: NO_DRIVER,
  upcoming: "Upcoming",
  today: "Today",
  collect: "Pay on the day",
  unpaid: "Waiting for payment",
  past: "Past",
  all: "All",
} as const;
type View = keyof typeof VIEWS;

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string).trim() : "");
  const settings = await store.settings();
  const today = todayIn(settings.timezone);

  const view: View = s("view") in VIEWS ? (s("view") as View) : s("from") || s("to") || s("driver") || s("q") ? "all" : "available";
  const from = isIsoDate(s("from")) ? s("from") : "";
  const to = isIsoDate(s("to")) ? s("to") : "";
  const driver = s("driver");
  const status = STATUSES.includes(s("status") as JobStatus) ? (s("status") as JobStatus) : "";
  const service = SERVICES.includes(s("service") as ServiceType) ? (s("service") as ServiceType) : "";
  const search = s("q").slice(0, 80);

  const query: JobQuery = { search: search || undefined };
  switch (view) {
    case "available":
      Object.assign(query, { from: today, unassigned: true, statuses: ["confirmed", "enquiry"] });
      break;
    case "upcoming":
      Object.assign(query, { from: today, statuses: ["confirmed", "enquiry"] });
      break;
    case "today":
      Object.assign(query, { from: today, to: today });
      break;
    case "past":
      Object.assign(query, { to: addDays(today, -1), order: "desc", limit: 300 });
      break;
    case "collect":
      Object.assign(query, { from: today, statuses: ["confirmed"] });
      break;
    case "unpaid":
      Object.assign(query, { to: today, statuses: ["completed", "no_show"], order: "desc" });
      break;
    default:
      Object.assign(query, { order: "desc", limit: from || to || driver || search ? 2000 : 300 });
  }
  if (from) query.from = from;
  if (to) query.to = to;
  if (driver === "none") query.unassigned = true;
  else if (driver) query.driverId = driver;
  if (status) query.statuses = [status];

  const [found, people, vehicles] = await Promise.all([store.jobs(query), store.people(), store.vehicles()]);
  let jobs = service ? found.filter((j) => j.service_type === service) : found;
  if (view === "unpaid") jobs = jobs.filter((j) => j.money && j.money.payment_status !== "paid");
  if (view === "collect") jobs = jobs.filter((j) => j.collect_amount > 0 && !j.collected_via);
  const share = shareLabel(settings.business_name);

  const person = new Map(people.map((p) => [p.user_id, p]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const cur = settings.currency;

  // For the Available view: who is free when, so the pick-list can say so.
  let context: { sameDay: Job[]; timeOff: Awaited<ReturnType<typeof store.timeOff>> } | null = null;
  if (view === "available" && jobs.length) {
    const first = jobs[0].pickup_date;
    const last = jobs[jobs.length - 1].pickup_date;
    const [sameDay, timeOff] = await Promise.all([store.jobs({ from: first, to: last }), store.timeOff(first, last)]);
    context = { sameDay, timeOff };
  }

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: search, driver, status, service, from, to, ...extra })) if (v) p.set(k, v);
    return `/jobs?${p}`;
  };
  const deleted = s("deleted") === "1";
  const unpaidTotal =
    view === "unpaid" ? jobs.reduce((sum, j) => sum + charge(j), 0) : view === "collect" ? jobs.reduce((sum, j) => sum + j.collect_amount, 0) : 0;

  return (
    <>
      <PageHeader
        title="Bookings"
        intro={
          view === "available" ? "Upcoming bookings with the driver still TBC. Pick a driver and vehicle, then Assign."
          : view === "collect" ? "Upcoming bookings where the driver collects the money on the day."
          : undefined
        }
        actions={
          <>
            <a href={`/jobs/export?${new URLSearchParams({ from: query.from ?? "", to: query.to ?? "" })}`} className="btn btn-quiet">Download for Excel</a>
            <Link href="/import" className="btn btn-quiet">Import</Link>
            <Link href="/jobs/new" className="btn btn-accent">New booking</Link>
          </>
        }
      />
      {deleted ? <p role="status" className="mb-4 rounded-lg bg-ok-bg px-3 py-2 text-sm font-semibold text-ok">Job deleted.</p> : null}

      <nav aria-label="Job views" className="mb-4 flex gap-1 overflow-x-auto border-b border-line [scrollbar-width:none]">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Link
            key={v}
            href={`/jobs?view=${v}`}
            aria-current={v === view ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold whitespace-nowrap ${v === view ? "border-ink text-text" : "border-transparent text-muted hover:text-text"}`}
          >
            {VIEWS[v]}
          </Link>
        ))}
      </nav>

      <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end print:hidden" role="search">
        <input type="hidden" name="view" value={view} />
        <div className="col-span-2 sm:w-64">
          <label htmlFor="q" className="field-label">Search</label>
          <input id="q" name="q" defaultValue={search} placeholder="Name, phone, address, TW-…" className="field" />
        </div>
        <div>
          <label htmlFor="driver" className="field-label">Driver</label>
          <select id="driver" name="driver" defaultValue={driver} className="field">
            <option value="">Anyone</option>
            <option value="none">TBC</option>
            {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="status" className="field-label">Status</label>
          <select id="status" name="status" defaultValue={status} className="field">
            <option value="">Any</option>
            {STATUSES.map((x) => <option key={x} value={x}>{STATUS_LABEL[x]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="service" className="field-label">Service</label>
          <select id="service" name="service" defaultValue={service} className="field">
            <option value="">Any</option>
            {SERVICES.map((x) => <option key={x} value={x}>{SERVICE_LABEL[x]}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="from" className="field-label">From</label>
          <input id="from" name="from" type="date" defaultValue={from} className="field" />
        </div>
        <div>
          <label htmlFor="to" className="field-label">To</label>
          <input id="to" name="to" type="date" defaultValue={to} className="field" />
        </div>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <FilterSubmit className="btn btn-primary flex-1">Filter</FilterSubmit>
          {search || driver || status || service || from || to ? <Link href={`/jobs?view=${view}`} className="btn btn-quiet">Clear</Link> : null}
        </div>
      </form>

      <p className="mb-2 text-sm text-muted">
        {jobs.length} booking{jobs.length === 1 ? "" : "s"}
        {view === "unpaid" || view === "collect" ? <>, <b className="text-text">{money(unpaidTotal, cur)}</b> to collect</> : null}
        {(view === "past" || view === "all") && jobs.length >= (query.limit ?? 5000) ? <> (latest {query.limit}; narrow the dates to see more)</> : null}
      </p>

      {jobs.length === 0 ? (
        <EmptyState title={view === "available" ? "Every upcoming booking has a driver." : "No bookings match."}>
          {view === "available" ? "New bookings with the driver TBC will show up here." : <Link href={keep({ view })} className="link">Try different filters</Link>}
        </EmptyState>
      ) : view === "available" && context ? (
        <ul className="flex flex-col gap-2">
          {jobs.map((j) => (
            <li key={j.id} className="card flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                <div className="w-24 shrink-0">
                  <p className="text-sm font-bold">{j.pickup_date === today ? "Today" : fmtDay(j.pickup_date)}</p>
                  <p className="text-sm tabular text-muted">{fmtTime(j.pickup_time)}</p>
                </div>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    <Link href={`/jobs/${j.id}`} className="link">{bookingRef(j)}</Link>
                    {j.customer_name} · {j.passengers} pax{j.money ? ` · ${money(charge(j), cur)}` : ""}
                    {j.is_shared ? <span className="chip bg-info-bg text-info">Shared</span> : null}
                    {j.status === "enquiry" ? <StatusChip status="enquiry" /> : null}
                  </p>
                  <p className="truncate text-sm text-muted">{j.pickup_address} → {j.dropoff_address}</p>
                </div>
              </div>
              <AssignForm
                compact
                jobId={j.id}
                driverId={j.driver_id}
                vehicleId={j.vehicle_id}
                drivers={driverOptions(j, people, context.sameDay.filter((o) => o.pickup_date === j.pickup_date), context.timeOff)}
                vehicles={vehicleOptions(j, vehicles, context.sameDay.filter((o) => o.pickup_date === j.pickup_date))}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="border-b border-line bg-surface-2">
              <tr>
                <th className="th">Date</th>
                <th className="th">Pick up → Drop off</th>
                <th className="th">Name</th>
                <th className="th">Driver</th>
                <th className="th">Status</th>
                <th className="th text-right">Charges</th>
                <th className="th text-right">{share}</th>
                <th className="th text-right">Driver pay</th>
                <th className="th">Payment</th>
                <th className="th">Reference</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {jobs.map((j) => {
                const d = j.driver_id ? person.get(j.driver_id) : null;
                return (
                  <tr key={j.id} className="hover:bg-surface-2">
                    <td className="td whitespace-nowrap tabular">{j.pickup_date === today ? "Today" : fmtDay(j.pickup_date)} <span className="text-muted">{fmtTime(j.pickup_time)}</span></td>
                    <td className="td max-w-72">
                      <Link href={`/jobs/${j.id}`} className="block truncate hover:underline">{j.pickup_address} → {j.dropoff_address}</Link>
                      <p className="text-xs text-muted">
                        {SERVICE_LABEL[j.service_type]} · {j.passengers} pax{j.vehicle_id ? ` · ${vehicleName.get(j.vehicle_id) ?? ""}` : ""}
                        {j.is_shared ? " · shared" : ""}
                        {j.linked_job_id ? " · return booked" : ""}
                      </p>
                    </td>
                    <td className="td max-w-48 truncate">{j.customer_name}</td>
                    <td className="td whitespace-nowrap">
                      {d ? <span className="inline-flex items-center gap-2"><PersonDot colour={d.colour} />{d.display_name}</span> : <Unassigned />}
                    </td>
                    <td className="td"><StatusChip status={j.status} /></td>
                    <td className="td text-right tabular">{j.money ? money(charge(j), cur) : "–"}</td>
                    <td className={`td text-right font-semibold tabular ${businessPay(j) < 0 ? "text-bad" : ""}`}>{j.money ? money(businessPay(j), cur) : "–"}</td>
                    <td className="td text-right tabular">{money(j.driver_pay, cur)}</td>
                    <td className="td">
                      {j.collected_via ? (
                        <span className="chip bg-ok-bg text-ok">Collected {j.collected_via}</span>
                      ) : j.money ? (
                        <PaymentChip status={j.money.payment_status} />
                      ) : null}
                    </td>
                    <td className="td whitespace-nowrap"><Link href={`/jobs/${j.id}`} className="link">{bookingRef(j)}</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
