import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarList, Heatmap, Legend, LineChart, StackedColumns } from "@/components/charts";
import { PaymentChip, PersonDot, StatusChip } from "@/components/chips";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireOffice } from "@/lib/auth";
import { SERVICE_LABEL, SOURCE_LABEL, UNASSIGNED_COLOUR } from "@/lib/constants";
import { addDays, fmtDay, fmtShort, fmtTime, startOfWeek, todayIn, WEEKDAYS } from "@/lib/dates";
import { jobRef, money, num, pct, profit, totalCost } from "@/lib/format";
import { busyGrid, change, groupBy, PERIODS, periodFor, summarise, weekly } from "@/lib/metrics";
import { BILLABLE } from "@/lib/constants";
import type { ServiceType, BookingSource } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const TREND_WEEKS = 12;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const params = await searchParams;
  const settings = await store.settings();
  const cur = settings.currency;
  const today = todayIn(settings.timezone);
  const period = periodFor(typeof params.period === "string" ? params.period : undefined, today);

  // One fetch covers the period, the one before it, and the weekly trend.
  const trendStart = addDays(startOfWeek(period.to), -7 * (TREND_WEEKS - 1));
  const fetchFrom = [period.prevFrom, trendStart].sort()[0];
  const [jobs, people, vehicles, openJobs, recentDone] = await Promise.all([
    store.jobs({ from: fetchFrom, to: period.to }),
    store.people(),
    store.vehicles(),
    store.jobs({ from: today, statuses: ["confirmed", "enquiry"] }),
    store.jobs({ from: addDays(today, -90), to: today, statuses: ["completed", "no_show"] }),
  ]);

  const inRange = (from: string, to: string) => jobs.filter((j) => j.pickup_date >= from && j.pickup_date <= to);
  const periodJobs = inRange(period.from, period.to);
  const now = summarise(periodJobs);
  const before = summarise(inRange(period.prevFrom, period.prevTo));

  const weeks = weekly(jobs, trendStart, TREND_WEEKS);
  const weekLabels = weeks.map((w) => fmtShort(w.start));

  const person = new Map(people.map((p) => [p.user_id, p]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const unassigned = openJobs.filter((j) => !j.driver_id);
  const enquiries = openJobs.filter((j) => j.status === "enquiry");
  const unpaid = recentDone.filter((j) => j.money && j.money.payment_status !== "paid");
  const todays = openJobs.filter((j) => j.pickup_date === today && j.status === "confirmed");

  const byService = groupBy(periodJobs, (j) => j.service_type);
  const bySource = groupBy(periodJobs, (j) => j.booking_source);
  const byDriver = groupBy(periodJobs, (j) => j.driver_id);
  const byVehicle = groupBy(periodJobs, (j) => j.vehicle_id);
  const grid = busyGrid(periodJobs);
  const usedHours = grid[0].map((_, h) => h).filter((h) => grid.some((row) => row[h] > 0));
  const hours = usedHours.length ? range(Math.min(...usedHours), Math.max(...usedHours)) : range(6, 20);
  const weekdayCounts = grid.map((row) => row.reduce((a, b) => a + b, 0));

  const costRows = periodJobs
    .filter((j) => BILLABLE.includes(j.status))
    .sort((a, b) => (a.pickup_date + a.pickup_time).localeCompare(b.pickup_date + b.pickup_time));

  const m = (n: number) => money(n, cur, { cents: false });
  const m2 = (n: number) => money(n, cur);

  const jobSeries = [
    { name: "Completed", colour: "var(--color-series-1)" },
    { name: "Booked, not done yet", colour: "var(--color-series-3)" },
    { name: "Cancelled or no-show", colour: "var(--color-series-2)" },
  ];
  const moneySeries = [
    { name: "Revenue", colour: "var(--color-series-1)" },
    { name: "Costs", colour: "var(--color-series-2)" },
    { name: "Profit", colour: "var(--color-series-3)" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        intro={<>{PERIODS[period.key]}: {period.label}. Changes compare with the {period.key.includes("month") ? "month" : "same length of time"} before.</>}
        actions={<Link href="/jobs/new" className="btn btn-accent">New job</Link>}
      />

      <nav aria-label="Time period" className="mb-5 flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 [scrollbar-width:none] print:hidden">
        {(Object.keys(PERIODS) as (keyof typeof PERIODS)[]).map((k) => (
          <Link
            key={k}
            href={`/dashboard?period=${k}`}
            aria-current={k === period.key ? "page" : undefined}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${k === period.key ? "bg-ink text-on-ink" : "text-muted hover:bg-surface-2 hover:text-text"}`}
          >
            {PERIODS[k]}
          </Link>
        ))}
      </nav>

      {/* headline numbers */}
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="Jobs booked" value={num(now.booked)} delta={change(now.booked, before.booked)} note={`${now.completed} done`} />
        <StatTile label="Revenue" value={m(now.revenue)} delta={change(now.revenue, before.revenue)} />
        <StatTile label="Costs" value={m(now.costs)} delta={change(now.costs, before.costs)} goodWhenUp={false} />
        <StatTile label="Profit" value={m(now.profit)} delta={change(now.profit, before.profit)} note={now.margin === null ? undefined : `${pct(now.margin)} margin`} />
        <StatTile label="Average job" value={now.avgValue === null ? "–" : m(now.avgValue)} delta={now.avgValue === null || before.avgValue === null ? null : change(now.avgValue, before.avgValue)} />
        <StatTile label="Passengers" value={num(now.passengers)} delta={change(now.passengers, before.passengers)} note={`${num(now.hours, 0)} driving hours`} />
      </section>

      {/* things to act on */}
      <section aria-label="Needs attention" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card
          title={`Available jobs (${unassigned.length})`}
          sub="Upcoming jobs with no driver yet"
          action={<Link href="/jobs?view=available" className="link text-sm">Assign</Link>}
        >
          {unassigned.length === 0 ? (
            <p className="text-sm text-muted">Every upcoming job has a driver.</p>
          ) : (
            <ul className="-my-1 divide-y divide-line text-sm">
              {unassigned.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-24 shrink-0 font-semibold tabular">{j.pickup_date === today ? "Today" : fmtDay(j.pickup_date)}</span>
                  <span className="w-[4.5rem] shrink-0 whitespace-nowrap tabular text-muted">{fmtTime(j.pickup_time)}</span>
                  <Link href={`/jobs/${j.id}`} className="min-w-0 truncate hover:underline">{j.customer_name} · {j.passengers} pax</Link>
                  {j.status === "enquiry" ? <span className="ml-auto"><StatusChip status="enquiry" /></span> : null}
                </li>
              ))}
              {unassigned.length > 6 ? <li className="py-1.5 text-muted">and {unassigned.length - 6} more</li> : null}
            </ul>
          )}
        </Card>
        <Card title="Today" sub={fmtDay(today)} action={<Link href={`/calendar?view=team&date=${today}`} className="link text-sm">Calendar</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Jobs today" value={num(todays.length)} />
            <Fact label="Without a driver" value={num(todays.filter((j) => !j.driver_id).length)} warn={todays.some((j) => !j.driver_id)} />
            <Fact label="Open enquiries" value={num(enquiries.length)} />
            <Fact label="Passengers today" value={num(todays.reduce((s, j) => s + j.passengers, 0))} />
          </dl>
        </Card>
        <Card title="Waiting to be paid" sub="Done in the last 90 days" action={<Link href="/jobs?view=unpaid" className="link text-sm">See all</Link>}>
          <p className="text-2xl font-semibold tabular">{m2(unpaid.reduce((s, j) => s + (j.money?.price ?? 0), 0))}</p>
          <p className="mt-1 text-sm text-muted">
            {unpaid.length} job{unpaid.length === 1 ? "" : "s"}: {unpaid.filter((j) => j.money?.payment_status === "unpaid").length} unpaid,{" "}
            {unpaid.filter((j) => j.money?.payment_status === "invoiced").length} invoiced.
          </p>
        </Card>
      </section>

      {/* weekly trends */}
      <section aria-label="Weekly trends" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Jobs per week" sub={`${TREND_WEEKS} weeks to ${fmtShort(period.to)}, by week starting`}>
          <div className="mb-3"><Legend series={jobSeries} /></div>
          <StackedColumns
            ariaLabel="Jobs per week, stacked by status"
            labels={weekLabels}
            series={jobSeries}
            values={weeks.map((w) => [w.completed, w.upcoming, w.lost])}
          />
          <WeekTable
            headers={["Week of", "Completed", "Booked", "Cancelled / no-show"]}
            rows={weeks.map((w) => [fmtShort(w.start), num(w.completed), num(w.upcoming), num(w.lost)])}
          />
        </Card>
        <Card title="Revenue, costs and profit per week" sub={`${cur}, booked jobs, ${TREND_WEEKS} weeks to ${fmtShort(period.to)}`}>
          <div className="mb-3"><Legend series={moneySeries} kind="line" /></div>
          <LineChart
            ariaLabel="Revenue, costs and profit per week"
            labels={weekLabels}
            series={moneySeries}
            values={[weeks.map((w) => w.revenue), weeks.map((w) => w.costs), weeks.map((w) => w.profit)]}
            format="compact"
          />
          <WeekTable
            headers={["Week of", "Revenue", "Costs", "Profit"]}
            rows={weeks.map((w) => [fmtShort(w.start), m(w.revenue), m(w.costs), m(w.profit)])}
          />
        </Card>
      </section>

      {/* booking metrics */}
      <h2 className="mt-8 mb-3 text-lg font-bold">Bookings</h2>
      <section aria-label="Booking metrics" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="By service" sub="Jobs, with revenue">
          <BarList rows={byService.map((r) => ({ label: SERVICE_LABEL[r.key as ServiceType], value: r.jobs, display: num(r.jobs), sub: m(r.revenue) }))} />
        </Card>
        <Card title="Where bookings come from" sub="Jobs by booking source">
          <BarList rows={bySource.map((r) => ({ label: SOURCE_LABEL[r.key as BookingSource], value: r.jobs, display: num(r.jobs), sub: pct(r.jobs / Math.max(1, now.booked)) }))} />
        </Card>
        <Card title="Booking health">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Fact label="Booked ahead (average)" value={now.avgLeadDays === null ? "–" : `${num(now.avgLeadDays, 1)} days`} />
            <Fact label="Cancellation rate" value={now.cancellationRate === null ? "–" : pct(now.cancellationRate)} warn={(now.cancellationRate ?? 0) > 0.1} />
            <Fact label="Cancelled" value={num(now.cancelled)} />
            <Fact label="No-shows" value={num(now.noShow)} warn={now.noShow > 0} />
            <Fact label="Enquiries in period" value={num(now.enquiries)} />
            <Fact label="Kilometres" value={num(now.km)} />
          </dl>
        </Card>
        <Card title="Busiest days" sub="Pickups by day of the week">
          <BarList rows={WEEKDAYS.map((d, i) => ({ label: d, value: weekdayCounts[i], display: num(weekdayCounts[i]) }))} />
        </Card>
        <div className="min-w-0 lg:col-span-2">
          <Card title="Busiest times" sub="Pickups by day and hour. Hover a square for the count.">
            <Heatmap rows={WEEKDAYS} grid={grid} hours={hours} />
          </Card>
        </div>
      </section>

      {/* team and fleet */}
      <h2 className="mt-8 mb-3 text-lg font-bold">Drivers and vehicles</h2>
      <section aria-label="Drivers and vehicles" className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Who did what" sub="Booked jobs in the period">
          <Table
            head={["Driver", "Jobs", "Hours", "Pax", "Revenue", "Driver cost", "Profit"]}
            rows={byDriver.map((r) => {
              const p = r.key ? person.get(r.key) : null;
              return [
                <span key="n" className="inline-flex items-center gap-2">
                  <PersonDot colour={p?.colour ?? UNASSIGNED_COLOUR} />
                  {p ? <Link href={`/jobs?driver=${p.user_id}&from=${period.from}&to=${period.to}`} className="hover:underline">{p.display_name}</Link> : <span className="text-muted">No driver yet</span>}
                </span>,
                num(r.jobs),
                num(r.hours, 1),
                num(r.passengers),
                m(r.revenue),
                m(periodJobs.filter((j) => (j.driver_id ?? "") === r.key && BILLABLE.includes(j.status)).reduce((s, j) => s + (j.money?.driver_cost ?? 0), 0)),
                m(r.profit),
              ];
            })}
          />
        </Card>
        <Card title="Vehicles" sub="Booked jobs in the period">
          <Table
            head={["Vehicle", "Jobs", "Km", "Fuel & running", "Revenue"]}
            rows={byVehicle.map((r) => [
              r.key ? vehicleName.get(r.key) ?? "Removed vehicle" : <span key="n" className="text-muted">Not set</span>,
              num(r.jobs),
              num(r.km),
              m(periodJobs.filter((j) => (j.vehicle_id ?? "") === r.key && BILLABLE.includes(j.status)).reduce((s, j) => s + (j.money?.fuel_cost ?? 0), 0)),
              m(r.revenue),
            ])}
          />
          <p className="mt-3 text-xs text-muted">
            Where the money went: driver pay {m(now.costSplit.driver)}, fuel and running {m(now.costSplit.fuel)}, tolls and parking {m(now.costSplit.tolls)}, other {m(now.costSplit.other)}.
          </p>
        </Card>
      </section>

      {/* every job's costs */}
      <div className="mt-8 mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Job costs</h2>
          <p className="text-sm text-muted">Every booked job in {period.label}: what it earned, what it cost, what was left.</p>
        </div>
        <a href={`/jobs/export?from=${period.from}&to=${period.to}`} className="btn btn-quiet btn-sm print:hidden">Download CSV</a>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1000px] text-sm tabular [&_td]:px-2 [&_th]:px-2">
          <thead className="border-b border-line bg-surface-2">
            <tr>
              <th className="th">Job</th>
              <th className="th">Pickup</th>
              <th className="th">Customer</th>
              <th className="th">Driver</th>
              <th className="th text-right">Price</th>
              <th className="th text-right">Driver</th>
              <th className="th text-right">Fuel</th>
              <th className="th text-right">Tolls</th>
              <th className="th text-right">Other</th>
              <th className="th text-right">Total cost</th>
              <th className="th text-right">Profit</th>
              <th className="th text-right">Margin</th>
              <th className="th">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {costRows.length === 0 ? (
              <tr><td colSpan={13} className="td py-6 text-center text-muted">No booked jobs in this period.</td></tr>
            ) : (
              costRows.map((j) => {
                const p = profit(j.money);
                const price = j.money?.price ?? 0;
                const driver = j.driver_id ? person.get(j.driver_id) : null;
                return (
                  <tr key={j.id} className="hover:bg-surface-2">
                    <td className="td whitespace-nowrap"><Link href={`/jobs/${j.id}`} className="link">{jobRef(j.job_no)}</Link></td>
                    <td className="td whitespace-nowrap">{fmtDay(j.pickup_date)} {fmtTime(j.pickup_time)}</td>
                    <td className="td max-w-48 truncate">{j.customer_name}{j.status !== "completed" ? <> <StatusChip status={j.status} /></> : null}</td>
                    <td className="td whitespace-nowrap">{driver ? driver.display_name : <span className="text-muted">None</span>}</td>
                    <td className="td text-right">{m2(price)}</td>
                    <td className="td text-right">{m2(j.money?.driver_cost ?? 0)}</td>
                    <td className="td text-right">{m2(j.money?.fuel_cost ?? 0)}</td>
                    <td className="td text-right">{m2(j.money?.tolls_parking ?? 0)}</td>
                    <td className="td text-right">{m2(j.money?.other_cost ?? 0)}</td>
                    <td className="td text-right">{m2(totalCost(j.money))}</td>
                    <td className={`td text-right font-semibold ${p < 0 ? "text-bad" : ""}`}>{m2(p)}</td>
                    <td className={`td text-right ${p < 0 ? "text-bad" : "text-muted"}`}>{price > 0 ? pct(p / price) : "–"}</td>
                    <td className="td">{j.money ? <PaymentChip status={j.money.payment_status} /> : null}</td>
                  </tr>
                );
              })
            )}
          </tbody>
          {costRows.length ? (
            <tfoot className="border-t-2 border-line-2 bg-surface-2 font-semibold">
              <tr>
                <td className="td" colSpan={4}>Total, {costRows.length} jobs</td>
                <td className="td text-right">{m2(now.revenue)}</td>
                <td className="td text-right">{m2(now.costSplit.driver)}</td>
                <td className="td text-right">{m2(now.costSplit.fuel)}</td>
                <td className="td text-right">{m2(now.costSplit.tolls)}</td>
                <td className="td text-right">{m2(now.costSplit.other)}</td>
                <td className="td text-right">{m2(now.costs)}</td>
                <td className={`td text-right ${now.profit < 0 ? "text-bad" : ""}`}>{m2(now.profit)}</td>
                <td className="td text-right">{now.margin === null ? "–" : pct(now.margin)}</td>
                <td className="td" />
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    </>
  );
}

function Card({ title, sub, action, children }: { title: string; sub?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="card flex h-full min-w-0 flex-col p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold">{title}</h3>
          {sub ? <p className="text-xs text-muted">{sub}</p> : null}
        </div>
        {action ? <div className="shrink-0 print:hidden">{action}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Fact({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={`text-lg font-semibold tabular ${warn ? "text-warn" : ""}`}>{value}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  if (!rows.length) return <p className="text-sm text-muted">No booked jobs in this period.</p>;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="border-b border-line">
            {head.map((h, i) => <th key={h} className={`th px-2 ${i ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, k) => <td key={k} className={`px-2 py-1.5 whitespace-nowrap ${k ? "text-right" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// The chart's numbers as a table, for anyone who can't or won't read the chart.
function WeekTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <details className="mt-3 text-sm print:hidden">
      <summary className="cursor-pointer text-xs font-semibold text-muted hover:text-text">Show as a table</summary>
      <table className="mt-2 w-full tabular">
        <thead>
          <tr className="border-b border-line">
            {headers.map((h, i) => <th key={h} className={`th px-2 ${i ? "text-right" : ""}`}>{h}</th>)}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r) => (
            <tr key={r[0]}>
              {r.map((c, k) => <td key={k} className={`px-2 py-1 ${k ? "text-right" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
