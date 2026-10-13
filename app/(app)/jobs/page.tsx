import type { Metadata } from "next";
import Link from "next/link";
import { Fragment } from "react";
import { AssignForm } from "@/app/(app)/jobs/job-controls";
import { PaymentChip, PersonDot, RepeatChip, StatusChip, Unassigned } from "@/components/chips";
import { MoreFilters } from "@/components/more-filters";
import { WeekBoard } from "@/components/week-board";
import { EmptyState, PageHeader } from "@/components/page-header";
import { FilterSubmit } from "@/components/pending-buttons";
import { driverOptions, vehicleOptions } from "@/lib/assign-options";
import { requireOffice } from "@/lib/auth";
import { BILLABLE, SERVICE_LABEL, SERVICES, STATUS_LABEL, STATUSES } from "@/lib/constants";
import { addDays, daysBetween, eachDay, fmtDay, fmtLong, fmtRange, fmtTime, isIsoDate, startOfWeek, todayIn } from "@/lib/dates";
import { bookingRef, businessPay, charge, money, shareLabel } from "@/lib/format";
import type { Job, JobQuery, JobStatus, ServiceType } from "@/lib/types";

export const metadata: Metadata = { title: "Bookings" };

const VIEWS = {
  available: "Assign bookings",
  booked: "Booked this week",
  day: "By day",
  upcoming: "Upcoming",
  all: "All",
  collect: "Pay on the day",
  unpaid: "Waiting for payment",
  flagged: "Flagged",
  past: "Past",
} as const;
type View = keyof typeof VIEWS;

// Bookings that count towards the totals (confirmed, done, no-show).
const counts = (j: Job) => BILLABLE.includes(j.status);

export default async function JobsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string).trim() : "");
  const settings = await store.settings();
  const today = todayIn(settings.timezone);

  const asked = s("view") === "today" ? "day" : s("view"); // old "Today" links
  const customer = /^[pn]:.{1,120}$/.test(s("customer")) ? s("customer") : ""; // one customer's bookings (lib/customers.ts key)
  const series = /^[0-9a-f-]{36}$/i.test(s("series")) ? s("series") : ""; // one repeating run
  const view: View = asked in VIEWS ? (asked as View) : s("from") || s("to") || s("driver") || s("q") || customer || series ? "all" : "available";
  const day = isIsoDate(s("date")) ? s("date") : today;
  const from = view !== "day" && isIsoDate(s("from")) ? s("from") : "";
  const to = view !== "day" && isIsoDate(s("to")) ? s("to") : "";
  const driver = s("driver");
  const status = STATUSES.includes(s("status") as JobStatus) ? (s("status") as JobStatus) : "";
  const service = SERVICES.includes(s("service") as ServiceType) ? (s("service") as ServiceType) : "";
  const search = s("q").slice(0, 80);
  // Assign bookings, one week at a time, as far ahead as you like: on Sunday
  // the office hands out next week's jobs, or the weeks after. "week" is the
  // Monday (or "this" / "next"); none means every upcoming booking.
  const thisMonday = startOfWeek(today);
  const askedWeek = s("week");
  const weekStart =
    view !== "available" ? null
    : askedWeek === "this" ? thisMonday
    : askedWeek === "next" ? addDays(thisMonday, 7)
    : isIsoDate(askedWeek) && startOfWeek(askedWeek) >= thisMonday ? startOfWeek(askedWeek)
    : null;
  const week = weekStart ?? "";
  const weekRange = weekStart ? { from: weekStart === thisMonday ? today : weekStart, to: addDays(weekStart, 6) } : null;
  const weeksAhead = (w: string) => Math.round(daysBetween(thisMonday, w) / 7);
  const weekName = (w: string) => (weeksAhead(w) === 0 ? "This week" : weeksAhead(w) === 1 ? "Next week" : `In ${weeksAhead(w)} weeks`);
  const QUICK_WEEKS = [0, 1, 2, 3].map((n) => addDays(thisMonday, 7 * n));
  // Booked this week: what was taken in a Mon - Sun week by the day it was
  // booked, whatever the trip date (the weekly sales).
  const salesWeek = view === "booked" && isIsoDate(s("wk")) ? startOfWeek(s("wk")) : startOfWeek(today);

  const query: JobQuery = { search: search || undefined };
  switch (view) {
    case "available":
      Object.assign(query, { from: today, unassigned: true, statuses: ["confirmed", "enquiry"], ...weekRange });
      break;
    case "day":
      Object.assign(query, { from: day, to: day });
      break;
    case "upcoming":
      Object.assign(query, { from: today, statuses: ["confirmed", "enquiry"] });
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
    case "flagged":
      Object.assign(query, { flagged: true });
      break;
    case "booked":
      Object.assign(query, { bookedFrom: salesWeek, bookedTo: addDays(salesWeek, 6) });
      break;
    default:
      Object.assign(query, { order: "desc", limit: from || to || driver || search ? 2000 : 300 });
  }
  if (from) query.from = from;
  if (to) query.to = to;
  if (driver === "none") query.unassigned = true;
  else if (driver) query.driverId = driver;
  if (status) query.statuses = [status];
  if (customer) query.customerKey = customer;
  if (series) Object.assign(query, { seriesId: series, order: "asc" });

  // Assign bookings: the week's calendar above the list, to see who's already
  // busy, and how many jobs still need a driver in each of the next weeks.
  const boardWeek = weekStart ?? thisMonday;
  const [found, people, vehicles, boardJobs, boardOff, openSoon] = await Promise.all([
    store.jobs(query),
    store.people(),
    store.vehicles(),
    view === "available" ? store.jobs({ from: boardWeek, to: addDays(boardWeek, 6) }) : Promise.resolve([]),
    view === "available" ? store.timeOff(boardWeek, addDays(boardWeek, 6)) : Promise.resolve([]),
    view === "available"
      ? store.jobs({ from: today, to: addDays(thisMonday, 7 * QUICK_WEEKS.length - 1), unassigned: true, statuses: ["confirmed", "enquiry"] })
      : Promise.resolve([]),
  ]);
  const openIn = (w: string) => openSoon.filter((j) => startOfWeek(j.pickup_date) === w).length;
  let jobs = service ? found.filter((j) => j.service_type === service) : found;
  if (view === "unpaid") jobs = jobs.filter((j) => j.money && j.money.payment_status !== "paid");
  if (view === "collect") jobs = jobs.filter((j) => j.collect_amount > 0 && !j.collected_via);
  const share = shareLabel(settings.business_name);
  const repeats = await store.repeatCounts(jobs.map((j) => j.id));

  const person = new Map(people.map((p) => [p.user_id, p]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const cur = settings.currency;
  const m = (n: number) => money(n, cur, { cents: false });

  // For the Available view: who is free when, so the pick-list can say so.
  let context: { sameDay: Job[]; timeOff: Awaited<ReturnType<typeof store.timeOff>> } | null = null;
  if (view === "available" && jobs.length) {
    const first = jobs[0].pickup_date;
    const last = jobs[jobs.length - 1].pickup_date;
    const [sameDay, timeOff] = await Promise.all([store.jobs({ from: first, to: last }), store.timeOff(first, last)]);
    context = { sameDay, timeOff };
  }

  // The list, a day at a time, with each day's number of bookings and $.
  const days: { date: string; jobs: Job[]; bookings: number; total: number }[] = [];
  for (const j of jobs) {
    let g = days[days.length - 1];
    if (!g || g.date !== j.pickup_date) days.push((g = { date: j.pickup_date, jobs: [], bookings: 0, total: 0 }));
    g.jobs.push(j);
    if (counts(j)) {
      g.bookings++;
      g.total += charge(j);
    }
  }
  const booked = jobs.filter(counts);
  const bookedTotal = booked.reduce((sum, j) => sum + charge(j), 0);
  const dayLabel = (d: string) => (d === today ? `Today, ${fmtDay(d)}` : d === addDays(today, 1) ? `Tomorrow, ${fmtDay(d)}` : fmtDay(d));
  const daySummary = (g: { bookings: number; total: number }) => `${g.bookings} booking${g.bookings === 1 ? "" : "s"} · ${m(g.total)}`;
  const grouped = view !== "day";

  const keep = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ q: search, driver, status, service, from, to, customer, series, ...extra })) if (v) p.set(k, v);
    return `/jobs?${p}`;
  };
  const dayHref = (d: string) => keep({ view: "day", date: d, from: "", to: "" });
  const deleted = s("deleted") === "1";
  const collectTotal =
    view === "unpaid" ? jobs.reduce((sum, j) => sum + charge(j), 0) : view === "collect" ? jobs.reduce((sum, j) => sum + j.collect_amount, 0) : 0;

  return (
    <>
      <PageHeader
        title="Bookings"
        intro={
          view === "available" ? "Upcoming bookings with the driver still TBC. Pick a week, then a driver and vehicle for each booking, and Assign. The calendar shows who already has what that week."
          : view === "booked" ? "Everything booked in the week, whatever the trip date: the week's sales."
          : view === "collect" ? "Upcoming bookings where the driver collects the money on the day."
          : view === "flagged" ? "Bookings someone flagged for attention. Open one to see why, or clear the flag."
          : undefined
        }
        actions={
          <>
            <a href={`/jobs/export?${new URLSearchParams({ from: query.from ?? "", to: query.to ?? "" })}`} className="btn btn-quiet">Download for Excel</a>
            <Link href="/import" className="btn btn-quiet">Import</Link>
            <Link href={view === "day" && day >= today ? `/jobs/new?date=${day}` : "/jobs/new"} className="btn btn-accent">New booking</Link>
          </>
        }
      />
      {series ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-info-bg px-3 py-2 text-sm text-info">
          <b>One repeating run</b> ({jobs.length} trip{jobs.length === 1 ? "" : "s"})
          <Link href={`/jobs?view=${view}`} className="ml-auto font-semibold underline">Show everything</Link>
        </p>
      ) : null}
      {customer ? (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-lg bg-tint-2 px-3 py-2 text-sm text-accent-text">
          <b>★ One customer&rsquo;s bookings</b>
          {jobs[0] ? <span>({jobs[0].customer_name}{jobs[0].customer_phone ? `, ${jobs[0].customer_phone}` : ""})</span> : null}
          <Link href={`/jobs?view=${view}`} className="ml-auto font-semibold underline">Show everyone</Link>
        </p>
      ) : null}
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

      {view === "available" ? (
        <div className="mb-4 flex flex-col gap-2 print:hidden">
          <nav aria-label="Which week" className="flex flex-wrap items-center gap-1.5">
            <Link href="/jobs?view=available" aria-current={!weekStart ? "page" : undefined} className={`btn btn-sm ${!weekStart ? "btn-primary" : "btn-quiet"}`}>
              All upcoming
            </Link>
            {QUICK_WEEKS.map((w) => (
              <Link
                key={w}
                href={`/jobs?view=available&week=${w}`}
                aria-current={w === weekStart ? "page" : undefined}
                className={`btn btn-sm ${w === weekStart ? "btn-primary" : "btn-quiet"}`}
              >
                {weekName(w)}
                <span className={`rounded-full px-1.5 text-xs ${openIn(w) ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"}`}>{openIn(w)}</span>
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-1.5">
            {boardWeek > thisMonday ? (
              <Link href={`/jobs?view=available&week=${addDays(boardWeek, -7)}`} className="btn btn-quiet btn-sm" aria-label="Previous week">‹</Link>
            ) : (
              <span className="btn btn-quiet btn-sm opacity-40" aria-hidden="true">‹</span>
            )}
            <h2 className="min-w-0 px-1 text-sm font-bold sm:text-base">
              {weekName(boardWeek)}: {fmtRange(boardWeek, addDays(boardWeek, 6))}
            </h2>
            <Link href={`/jobs?view=available&week=${addDays(boardWeek, 7)}`} className="btn btn-quiet btn-sm" aria-label="Next week">›</Link>
            <Link href={`/calendar?view=week&date=${boardWeek}`} className="link ml-2 hidden text-sm sm:inline">Open in Calendar</Link>
          </div>
        </div>
      ) : null}

      {view === "available" ? (
        <section aria-label={`Calendar, ${fmtRange(boardWeek, addDays(boardWeek, 6))}`} className="mb-5 hidden sm:block print:hidden">
          <WeekBoard
            days={eachDay(boardWeek, addDays(boardWeek, 6))}
            lanes={people
              .filter((p) => (p.role === "driver" && p.is_active) || boardJobs.some((j) => j.driver_id === p.user_id))
              .sort((a, b) => Number(a.role !== "driver") - Number(b.role !== "driver") || a.display_name.localeCompare(b.display_name))}
            showUnassigned
            jobs={boardJobs.filter((j) => j.status !== "cancelled" && j.status !== "no_show")}
            off={boardOff}
            office
            today={today}
            dayHref={(d) => `/calendar?view=day&date=${d}`}
          />
        </section>
      ) : null}

      {view === "booked" ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <Link href={`/jobs?view=booked&wk=${addDays(salesWeek, -7)}`} className="btn btn-quiet btn-sm" aria-label="Previous week">‹</Link>
          <h2 className="text-lg font-bold">Booked {fmtRange(salesWeek, addDays(salesWeek, 6))}</h2>
          <Link href={`/jobs?view=booked&wk=${addDays(salesWeek, 7)}`} className="btn btn-quiet btn-sm" aria-label="Next week">›</Link>
          {salesWeek !== startOfWeek(today) ? <Link href="/jobs?view=booked" className="btn btn-quiet btn-sm">This week</Link> : null}
        </div>
      ) : null}

      {view === "day" ? (
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4 print:hidden">
          <div className="flex items-center gap-1.5">
            <Link href={dayHref(addDays(day, -1))} className="btn btn-quiet btn-sm shrink-0" aria-label="Previous day">‹</Link>
            <form className="flex min-w-0 flex-1 items-center gap-1.5 sm:flex-none">
              <input type="hidden" name="view" value="day" />
              <label htmlFor="date" className="sr-only">Day</label>
              <input id="date" name="date" type="date" defaultValue={day} className="field min-w-0 flex-1 sm:w-44 sm:flex-none" />
              <FilterSubmit className="btn btn-quiet btn-sm shrink-0">Go</FilterSubmit>
            </form>
            <Link href={dayHref(addDays(day, 1))} className="btn btn-quiet btn-sm shrink-0" aria-label="Next day">›</Link>
          </div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-bold">{fmtLong(day)}</h2>
            {day !== today ? <Link href={dayHref(today)} className="btn btn-quiet btn-sm">Today</Link> : null}
          </div>
        </div>
      ) : null}

      <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end print:hidden" role="search">
        <input type="hidden" name="view" value={view} />
        {view === "booked" && salesWeek !== startOfWeek(today) ? <input type="hidden" name="wk" value={salesWeek} /> : null}
        {week ? <input type="hidden" name="week" value={week} /> : null}
        {customer ? <input type="hidden" name="customer" value={customer} /> : null}
        {view === "day" ? <input type="hidden" name="date" value={day} /> : null}
        <div className="col-span-2 sm:w-64">
          <label htmlFor="q" className="field-label">Search</label>
          <input id="q" name="q" type="search" defaultValue={search} placeholder="Name, phone, address, TW-…" className="field" />
        </div>
        <MoreFilters active={Boolean(driver || status || service || from || to)}>
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
          {view !== "day" ? (
            <>
              <div>
                <label htmlFor="from" className="field-label">From</label>
                <input id="from" name="from" type="date" defaultValue={from} className="field" />
              </div>
              <div>
                <label htmlFor="to" className="field-label">To</label>
                <input id="to" name="to" type="date" defaultValue={to} className="field" />
              </div>
            </>
          ) : null}
        </MoreFilters>
        <div className="col-span-2 flex gap-2 sm:col-span-1">
          <FilterSubmit className="btn btn-primary flex-1">Filter</FilterSubmit>
          {search || driver || status || service || from || to ? (
            <Link href={view === "day" ? `/jobs?view=day&date=${day}` : `/jobs?view=${view}`} className="btn btn-quiet">Clear</Link>
          ) : null}
        </div>
      </form>

      <p className="mb-2 text-sm text-muted">
        {view === "unpaid" || view === "collect" ? (
          <>
            {jobs.length} booking{jobs.length === 1 ? "" : "s"}, <b className="text-text">{money(collectTotal, cur)}</b> to collect
          </>
        ) : (
          <>
            {booked.length} booking{booked.length === 1 ? "" : "s"}, <b className="text-text">{m(bookedTotal)}</b> total
            {jobs.length > booked.length ? ` (plus ${jobs.length - booked.length} enquir${jobs.length - booked.length === 1 ? "y" : "ies"} or cancelled, not counted)` : ""}
          </>
        )}
        {(view === "past" || view === "all") && found.length >= (query.limit ?? 5000) ? <> (latest {query.limit}; narrow the dates to see more)</> : null}
      </p>

      {jobs.length === 0 ? (
        <EmptyState title={view === "available" ? (weekStart ? `Every booking ${weekName(weekStart).toLowerCase()} has a driver.` : "Every upcoming booking has a driver.") : view === "day" ? `Nothing booked for ${fmtDay(day)}.` : view === "booked" ? "Nothing booked in this week." : "No bookings match."}>
          {view === "available" ? (
            "New bookings with the driver TBC will show up here."
          ) : view === "day" ? (
            <Link href={day >= today ? `/jobs/new?date=${day}` : dayHref(today)} className="link">{day >= today ? "Add a booking for this day" : "Go to today"}</Link>
          ) : (
            <Link href={keep({ view })} className="link">Try different filters</Link>
          )}
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
                    <RepeatChip earlier={repeats[j.id]} />
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
        <>
          {/* Phones: one card per booking, under a heading per day. The full table needs a wider screen. */}
          <div className="flex flex-col gap-4 sm:hidden">
            {days.map((g) => (
              <section key={g.date} aria-label={fmtDay(g.date)}>
                {grouped ? (
                  <h2 className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-bold">
                    <Link href={dayHref(g.date)} className="hover:underline">{dayLabel(g.date)}</Link>
                    <span className="font-semibold text-muted tabular">{daySummary(g)}</span>
                  </h2>
                ) : null}
                <ul className="card divide-y divide-line overflow-hidden">
                  {g.jobs.map((j) => {
                    const d = j.driver_id ? person.get(j.driver_id) : null;
                    return (
                      <li key={j.id}>
                        <Link href={`/jobs/${j.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-surface-2">
                          <span className="flex items-baseline justify-between gap-3">
                            <span className="font-bold tabular">{fmtTime(j.pickup_time)}</span>
                            <span className="font-semibold tabular">{j.money ? money(charge(j), cur) : ""}</span>
                          </span>
                          <span className="truncate font-semibold">{j.customer_name} · {j.passengers} pax</span>
                          <span className="truncate text-sm text-muted">{j.pickup_address} → {j.dropoff_address}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                            {d ? <span className="inline-flex items-center gap-1.5 font-semibold"><PersonDot colour={d.colour} />{d.display_name}</span> : j.operator ? <span className="chip bg-idle-bg text-idle">{j.operator}</span> : <Unassigned />}
                            {j.status !== "confirmed" ? <StatusChip status={j.status} /> : null}
                            {j.collected_via ? (
                              <span className="chip bg-ok-bg text-ok">Collected {j.collected_via}</span>
                            ) : j.money ? (
                              <PaymentChip status={j.money.payment_status} />
                            ) : null}
                            <RepeatChip earlier={repeats[j.id]} />
                            {j.flag_note ? <span className="chip bg-bad-bg text-bad" title={j.flag_note}>⚑ {j.flag_note.slice(0, 30)}</span> : null}
                            {j.is_shared ? <span className="chip bg-info-bg text-info">Shared</span> : null}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="w-full min-w-[1050px] text-sm">
              <thead className="border-b border-line bg-surface-2">
                <tr>
                  <th className="th">{grouped ? "Time" : "Date"}</th>
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
                {days.map((g) => (
                  <Fragment key={g.date}>
                    {grouped ? (
                      <tr className="bg-surface-2/60">
                        <th scope="rowgroup" colSpan={5} className="px-3 py-1.5 text-left text-[13px] font-bold">
                          <Link href={dayHref(g.date)} className="hover:underline">{dayLabel(g.date)}</Link>
                        </th>
                        <td colSpan={5} className="px-3 py-1.5 text-left text-[13px] font-semibold text-muted tabular">{daySummary(g)}</td>
                      </tr>
                    ) : null}
                    {g.jobs.map((j) => {
                      const d = j.driver_id ? person.get(j.driver_id) : null;
                      return (
                        <tr key={j.id} className="hover:bg-surface-2">
                          <td className="td whitespace-nowrap tabular">{fmtTime(j.pickup_time)}</td>
                          <td className="td max-w-72">
                            <Link href={`/jobs/${j.id}`} className="block truncate hover:underline">{j.pickup_address} → {j.dropoff_address}</Link>
                            <p className="text-xs text-muted">
                              {SERVICE_LABEL[j.service_type]} · {j.passengers} pax{j.vehicle_id ? ` · ${vehicleName.get(j.vehicle_id) ?? ""}` : ""}
                              {j.is_shared ? " · shared" : ""}
                              {j.linked_job_id ? " · return booked" : ""}
                            </p>
                          </td>
                          <td className="td max-w-48">
                            <span className="block truncate">{j.customer_name}</span>
                            <RepeatChip earlier={repeats[j.id]} />
                            {j.flag_note ? <span className="chip bg-bad-bg text-bad" title={j.flag_note}>⚑ Flagged</span> : null}
                          </td>
                          <td className="td whitespace-nowrap">
                            {d ? <span className="inline-flex items-center gap-2"><PersonDot colour={d.colour} />{d.display_name}</span> : j.operator ? <span className="chip bg-idle-bg text-idle">{j.operator}</span> : <Unassigned />}
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
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
