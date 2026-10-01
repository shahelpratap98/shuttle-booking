import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { BarList, Heatmap, Legend, LineChart, StackedColumns } from "@/components/charts";
import { PaymentChip, PersonDot, StatusChip } from "@/components/chips";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { TargetBar } from "@/components/target-bar";
import { requireOffice } from "@/lib/auth";
import { BILLABLE, NO_DRIVER, SERVICE_LABEL, SOURCE_LABEL, UNASSIGNED_COLOUR } from "@/lib/constants";
import { addDays, addMonths, endOfMonth, fmtDay, fmtShort, fmtTime, startOfMonth, startOfWeek, todayIn, WEEKDAYS } from "@/lib/dates";
import { bookingRef, businessPay, charge, expenses, money, num, pct, profit, shareLabel } from "@/lib/format";
import { busyGrid, change, groupBy, monthly, PERIODS, periodFor, summarise, weekly } from "@/lib/metrics";
import type { BookingSource, ServiceType } from "@/lib/types";

export const metadata: Metadata = { title: "Dashboard" };

const TREND_WEEKS = 12;
const MONTHS_BACK = 3;
const MONTHS_AHEAD = 5;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const params = await searchParams;
  const settings = await store.settings();
  const cur = settings.currency;
  const share = shareLabel(settings.business_name); // "Trekway pay"
  const today = todayIn(settings.timezone);
  const period = periodFor(typeof params.period === "string" ? params.period : undefined, today);

  // One fetch covers the period, the one before it, the weekly trend and the months.
  const trendStart = addDays(startOfWeek(period.to), -7 * (TREND_WEEKS - 1));
  const monthStart = startOfMonth(addMonths(today, -MONTHS_BACK));
  const monthEnd = endOfMonth(addMonths(today, MONTHS_AHEAD));
  const fetchFrom = [period.prevFrom, trendStart, monthStart].sort()[0];
  const fetchTo = [period.to, monthEnd].sort()[1];
  const [jobs, people, vehicles, target] = await Promise.all([
    store.jobs({ from: fetchFrom, to: fetchTo }),
    store.people(),
    store.vehicles(),
    store.weeklyTarget(),
  ]);

  const inRange = (from: string, to: string) => jobs.filter((j) => j.pickup_date >= from && j.pickup_date <= to);
  const periodJobs = inRange(period.from, period.to);
  const now = summarise(periodJobs);
  const before = summarise(inRange(period.prevFrom, period.prevTo));

  const weeks = weekly(jobs, trendStart, TREND_WEEKS);
  const weekLabels = weeks.map((w) => fmtShort(w.start));
  const months = monthly(jobs, monthStart, MONTHS_BACK + 1 + MONTHS_AHEAD);
  const monthLabel = (d: string) => new Intl.DateTimeFormat("en-NZ", { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const thisMonth = today.slice(0, 7);

  const person = new Map(people.map((p) => [p.user_id, p]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const upcoming = jobs.filter((j) => j.pickup_date >= today && (j.status === "confirmed" || j.status === "enquiry"));
  const tbc = upcoming.filter((j) => !j.driver_id);
  const todays = upcoming.filter((j) => j.pickup_date === today && j.status === "confirmed");
  const collectSoon = upcoming.filter((j) => j.status === "confirmed" && j.pickup_date <= addDays(today, 6) && j.collect_amount > 0 && !j.collected_via);
  const waiting = jobs.filter(
    (j) => j.pickup_date < today && j.pickup_date >= addDays(today, -90) && (j.status === "completed" || j.status === "no_show") && j.money && j.money.payment_status !== "paid",
  );

  const byService = groupBy(periodJobs, (j) => j.service_type);
  const bySource = groupBy(periodJobs, (j) => j.booking_source);
  const byDriver = groupBy(periodJobs, (j) => j.driver_id);
  const byVehicle = groupBy(periodJobs, (j) => j.vehicle_id);
  const grid = busyGrid(periodJobs);
  const usedHours = grid[0].map((_, h) => h).filter((h) => grid.some((row) => row[h] > 0));
  const hours = usedHours.length ? range(Math.min(...usedHours), Math.max(...usedHours)) : range(6, 20);
  const weekdayCounts = grid.map((row) => row.reduce((a, b) => a + b, 0));

  const rows = periodJobs
    .filter((j) => BILLABLE.includes(j.status))
    .sort((a, b) => (a.pickup_date + a.pickup_time).localeCompare(b.pickup_date + b.pickup_time));
  const anyExpenses = now.expenses > 0;

  const m = (n: number) => money(n, cur, { cents: false });
  const m2 = (n: number) => money(n, cur);

  const moneySplit = [
    { name: share, colour: "var(--color-series-1)" },
    { name: "Driver pay", colour: "var(--color-series-3)" },
  ];
  const jobSeries = [
    { name: "Completed", colour: "var(--color-series-1)" },
    { name: "Booked, not done yet", colour: "var(--color-series-3)" },
    { name: "Cancelled or no-show", colour: "var(--color-series-2)" },
  ];
  const lineSeries = [
    { name: "Charges", colour: "var(--color-series-1)" },
    { name: "Driver pay", colour: "var(--color-series-2)" },
    { name: share, colour: "var(--color-series-3)" },
  ];

  return (
    <>
      <PageHeader
        title="Dashboard"
        intro={<>{PERIODS[period.key]}: {period.label}. Changes compare with the {period.key.includes("month") ? "month" : "same length of time"} before.</>}
        actions={
          <>
            <Link href="/import" className="btn btn-quiet">Import spreadsheet</Link>
            <Link href="/jobs/new" className="btn btn-accent">New booking</Link>
          </>
        }
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

      {/* headline numbers, in the booking sheet's terms */}
      <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <StatTile label="Bookings" value={num(now.booked)} delta={change(now.booked, before.booked)} note={`${now.completed} done`} />
        <StatTile label="Charges" value={m(now.charges)} delta={change(now.charges, before.charges)} />
        <StatTile label="Driver pay" value={m(now.driverPay)} delta={change(now.driverPay, before.driverPay)} goodWhenUp={false} />
        <StatTile label={share} value={m(now.businessPay)} delta={change(now.businessPay, before.businessPay)} note={now.share === null ? undefined : `${pct(now.share)} of charges`} />
        <StatTile label="Average booking" value={now.avgCharge === null ? "–" : m(now.avgCharge)} delta={now.avgCharge === null || before.avgCharge === null ? null : change(now.avgCharge, before.avgCharge)} />
        <StatTile label="Passengers" value={num(now.passengers)} delta={change(now.passengers, before.passengers)} note={`${num(now.hours, 0)} driving hours`} />
      </section>

      {/* things to act on */}
      <section aria-label="Needs attention" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title={`${NO_DRIVER} (${tbc.length})`} sub="Upcoming bookings nobody has been given yet" action={<Link href="/jobs?view=available" className="link text-sm">Assign</Link>}>
          {tbc.length === 0 ? (
            <p className="text-sm text-muted">Every upcoming booking has a driver.</p>
          ) : (
            <ul className="-my-1 divide-y divide-line text-sm">
              {tbc.slice(0, 6).map((j) => (
                <li key={j.id} className="flex items-center gap-3 py-1.5">
                  <span className="w-24 shrink-0 font-semibold tabular">{j.pickup_date === today ? "Today" : fmtDay(j.pickup_date)}</span>
                  <span className="w-[4.5rem] shrink-0 whitespace-nowrap tabular text-muted">{fmtTime(j.pickup_time)}</span>
                  <Link href={`/jobs/${j.id}`} className="min-w-0 truncate hover:underline">{j.customer_name} · {j.passengers} pax</Link>
                  {j.status === "enquiry" ? <span className="ml-auto"><StatusChip status="enquiry" /></span> : null}
                </li>
              ))}
              {tbc.length > 6 ? <li className="py-1.5 text-muted">and {tbc.length - 6} more</li> : null}
            </ul>
          )}
        </Card>
        <Card title="Today" sub={fmtDay(today)} action={<Link href={`/calendar?view=day&date=${today}`} className="link text-sm">Calendar</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="Bookings today" value={num(todays.length)} />
            <Fact label={NO_DRIVER} value={num(todays.filter((j) => !j.driver_id).length)} warn={todays.some((j) => !j.driver_id)} />
            <Fact label="Passengers" value={num(todays.reduce((s, j) => s + j.passengers, 0))} />
            <Fact label="Drivers collect today" value={m(todays.filter((j) => !j.collected_via).reduce((s, j) => s + j.collect_amount, 0))} />
          </dl>
        </Card>
        <Card title="Payments" sub="Pay on the day, and done but not paid" action={<Link href="/jobs?view=unpaid" className="link text-sm">See all</Link>}>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Fact label="To collect, next 7 days" value={m(collectSoon.reduce((s, j) => s + j.collect_amount, 0))} />
            <Fact label="Bookings paying on the day" value={num(collectSoon.length)} />
            <Fact label="Done, not paid yet" value={m(waiting.reduce((s, j) => s + charge(j), 0))} warn={waiting.length > 0} />
            <Fact label="Those bookings" value={num(waiting.length)} />
          </dl>
        </Card>
      </section>

      {/* month by month: the sheet's monthly tabs and totals */}
      <section aria-label="Month by month" className="mt-4">
        <Card title="Month by month" sub={`All bookings, ${monthLabel(months[0].start)} to ${monthLabel(months[months.length - 1].start)}. Future months show what's booked so far.`}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
            <div className="min-w-0">
              <div className="mb-3"><Legend series={moneySplit} /></div>
              <StackedColumns
                ariaLabel={`Charges per month, split into ${share} and driver pay`}
                labels={months.map((r) => monthLabel(r.start))}
                series={moneySplit}
                values={months.map((r) => [r.businessPay, r.driverPay])}
                format="compact"
              />
            </div>
            <div className="-mx-4 min-w-0 overflow-x-auto px-4">
              <table className="w-full text-sm tabular">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th px-2">Month</th>
                    <th className="th px-2 text-right">Bookings</th>
                    <th className="th px-2 text-right">Charges</th>
                    <th className="th px-2 text-right">Driver pay</th>
                    <th className="th px-2 text-right">{share}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {months.map((r) => (
                    <tr key={r.start} className={r.start.slice(0, 7) === thisMonth ? "bg-accent/10 font-semibold" : ""}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        {monthLabel(r.start)}
                        {r.start.slice(0, 7) > thisMonth ? <span className="ml-1 text-xs font-normal text-muted">so far</span> : null}
                      </td>
                      <td className="px-2 py-1.5 text-right">{num(r.bookings)}</td>
                      <td className="px-2 py-1.5 text-right">{m(r.charges)}</td>
                      <td className="px-2 py-1.5 text-right">{m(r.driverPay)}</td>
                      <td className="px-2 py-1.5 text-right">{m(r.businessPay)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </section>

      {/* week by week */}
      <section aria-label="Week by week" className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card title="Bookings per week" sub={`${TREND_WEEKS} weeks to ${fmtShort(period.to)}, by week starting Monday`}>
          <div className="mb-3"><Legend series={jobSeries} /></div>
          <StackedColumns ariaLabel="Bookings per week, stacked by status" labels={weekLabels} series={jobSeries} values={weeks.map((w) => [w.completed, w.upcoming, w.lost])} />
        </Card>
        <Card title="Charges and pay per week" sub={`${cur}, booked jobs, ${TREND_WEEKS} weeks to ${fmtShort(period.to)}`}>
          <div className="mb-3"><Legend series={lineSeries} kind="line" /></div>
          <LineChart
            ariaLabel={`Charges, driver pay and ${share} per week`}
            labels={weekLabels}
            series={lineSeries}
            values={[weeks.map((w) => w.charges), weeks.map((w) => w.driverPay), weeks.map((w) => w.businessPay)]}
            format="compact"
          />
        </Card>
        <div className="min-w-0 lg:col-span-2">
          <Card
        title="Week by week"
        sub={`Number of bookings and total booking $ each week, newest first${target ? `. Weekly target ${m(target)}` : ""}`}
        action={<Link href="/totals" className="link text-sm">Every week and month</Link>}
      >
            <div className="-mx-4 overflow-x-auto px-4">
              <table className="w-full min-w-[560px] text-sm tabular">
                <thead>
                  <tr className="border-b border-line">
                    <th className="th px-2">Week starting</th>
                    <th className="th px-2 text-right">Bookings</th>
                    <th className="th px-2 text-right">Total booking $</th>
                    {target ? <th className="th px-2 text-right">vs target</th> : null}
                    <th className="th px-2 text-right">Driver pay</th>
                    <th className="th px-2 text-right">{share}</th>
                    <th className="th px-2 text-right">Cancelled / no-show</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...weeks].reverse().map((w) => (
                    <tr key={w.start} className={w.start === startOfWeek(today) ? "bg-accent/10 font-semibold" : ""}>
                      <td className="px-2 py-1.5 whitespace-nowrap">
                        <Link href={`/calendar?view=week&date=${w.start}`} className="hover:underline">{fmtDay(w.start)}</Link>
                      </td>
                      <td className="px-2 py-1.5 text-right">{num(w.bookings)}</td>
                      <td className="px-2 py-1.5 text-right">{m(w.charges)}</td>
                      {target ? <td className="px-2 py-1.5 text-right"><TargetBar value={w.charges} target={target} /></td> : null}
                      <td className="px-2 py-1.5 text-right">{m(w.driverPay)}</td>
                      <td className="px-2 py-1.5 text-right">{m(w.businessPay)}</td>
                      <td className="px-2 py-1.5 text-right text-muted">{num(w.lost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </section>

      {/* booking metrics */}
      <h2 className="mt-8 mb-3 text-lg font-bold">Bookings</h2>
      <section aria-label="Booking metrics" className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card title="Where bookings come from" sub="Bookings by channel">
          <BarList rows={bySource.map((r) => ({ label: SOURCE_LABEL[r.key as BookingSource] ?? r.key, value: r.jobs, display: num(r.jobs), sub: pct(r.jobs / Math.max(1, now.booked)) }))} />
        </Card>
        <Card title="By service" sub="Bookings, with charges">
          <BarList rows={byService.map((r) => ({ label: SERVICE_LABEL[r.key as ServiceType] ?? r.key, value: r.jobs, display: num(r.jobs), sub: m(r.charges) }))} />
        </Card>
        <Card title="Booking health">
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <Fact label="Booked ahead (average)" value={now.avgLeadDays === null ? "–" : `${num(now.avgLeadDays, 0)} days`} />
            <Fact label="Cancellation rate" value={now.cancellationRate === null ? "–" : pct(now.cancellationRate)} warn={(now.cancellationRate ?? 0) > 0.1} />
            <Fact label="Return trips" value={num(now.returnTrips)} />
            <Fact label="Shared rides" value={num(now.sharedTrips)} />
            <Fact label="No-shows" value={num(now.noShow)} warn={now.noShow > 0} />
            <Fact label="Enquiries" value={num(now.enquiries)} />
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
            head={["Driver", "Jobs", "Hours", "Charges", "Driver pay", share]}
            rows={byDriver.map((r) => {
              const p = r.key ? person.get(r.key) : null;
              return [
                <span key="n" className="inline-flex items-center gap-2">
                  <PersonDot colour={p?.colour ?? UNASSIGNED_COLOUR} />
                  {p ? <Link href={`/jobs?driver=${p.user_id}&from=${period.from}&to=${period.to}`} className="hover:underline">{p.display_name}</Link> : <span className="text-muted">{NO_DRIVER}</span>}
                </span>,
                num(r.jobs),
                num(r.hours, 1),
                m(r.charges),
                m(r.driverPay),
                m(r.businessPay),
              ];
            })}
          />
        </Card>
        <Card title="Vehicles" sub="Booked jobs in the period">
          <Table
            head={["Vehicle", "Jobs", "Passengers", "Charges", share]}
            rows={byVehicle.map((r) => [
              r.key ? vehicleName.get(r.key) ?? "Removed vehicle" : <span key="n" className="text-muted">Not set</span>,
              num(r.jobs),
              num(r.passengers),
              m(r.charges),
              m(r.businessPay),
            ])}
          />
          {anyExpenses ? (
            <p className="mt-3 text-xs text-muted">
              Running expenses recorded: fuel {m(now.costSplit.fuel)}, tolls and parking {m(now.costSplit.tolls)}, other {m(now.costSplit.other)}. Profit after them: {m(now.profit)}.
            </p>
          ) : null}
        </Card>
      </section>

      {/* every booking, in the sheet's column order */}
      <div className="mt-8 mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold">Bookings and pay</h2>
          <p className="text-sm text-muted">Every booked job in {period.label}, laid out like the booking sheet.</p>
        </div>
        <a href={`/jobs/export?from=${period.from}&to=${period.to}`} className="btn btn-quiet btn-sm print:hidden">Download for Excel</a>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[1100px] text-sm tabular [&_td]:px-2 [&_th]:px-2">
          <thead className="border-b border-line bg-surface-2">
            <tr>
              <th className="th">Date</th>
              <th className="th">Time</th>
              <th className="th">Pick up → Drop off</th>
              <th className="th text-right">People</th>
              <th className="th">Driver</th>
              <th className="th">Name</th>
              <th className="th text-right">Charges</th>
              <th className="th text-right">{share}</th>
              <th className="th text-right">Driver pay</th>
              {anyExpenses ? <th className="th text-right">Expenses</th> : null}
              {anyExpenses ? <th className="th text-right">Profit</th> : null}
              <th className="th">Payment</th>
              <th className="th">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.length === 0 ? (
              <tr><td colSpan={13} className="td py-6 text-center text-muted">No bookings in this period.</td></tr>
            ) : (
              rows.map((j) => {
                const driver = j.driver_id ? person.get(j.driver_id) : null;
                return (
                  <tr key={j.id} className="hover:bg-surface-2">
                    <td className="td whitespace-nowrap">{fmtDay(j.pickup_date)}</td>
                    <td className="td whitespace-nowrap">{fmtTime(j.pickup_time)}</td>
                    <td className="td max-w-80">
                      <Link href={`/jobs/${j.id}`} className="block truncate hover:underline">{j.pickup_address} → {j.dropoff_address}</Link>
                    </td>
                    <td className="td text-right">{j.passengers}</td>
                    <td className="td whitespace-nowrap">{driver ? driver.display_name : <span className="text-warn">TBC</span>}</td>
                    <td className="td max-w-40 truncate">{j.customer_name}{j.status === "no_show" ? <> <StatusChip status={j.status} /></> : null}</td>
                    <td className="td text-right">{m2(charge(j))}</td>
                    <td className="td text-right font-semibold">{m2(businessPay(j))}</td>
                    <td className="td text-right">{m2(j.driver_pay)}</td>
                    {anyExpenses ? <td className="td text-right">{m2(expenses(j))}</td> : null}
                    {anyExpenses ? <td className={`td text-right ${profit(j) < 0 ? "text-bad" : ""}`}>{m2(profit(j))}</td> : null}
                    <td className="td">{j.money ? <PaymentChip status={j.money.payment_status} /> : null}</td>
                    <td className="td whitespace-nowrap"><Link href={`/jobs/${j.id}`} className="link">{bookingRef(j)}</Link></td>
                  </tr>
                );
              })
            )}
          </tbody>
          {rows.length ? (
            <tfoot className="border-t-2 border-line-2 bg-surface-2 font-semibold">
              <tr>
                <td className="td" colSpan={6}>Total, {rows.length} bookings</td>
                <td className="td text-right">{m2(now.charges)}</td>
                <td className="td text-right">{m2(now.businessPay)}</td>
                <td className="td text-right">{m2(now.driverPay)}</td>
                {anyExpenses ? <td className="td text-right">{m2(now.expenses)}</td> : null}
                {anyExpenses ? <td className="td text-right">{m2(now.profit)}</td> : null}
                <td className="td" colSpan={2} />
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
  if (!rows.length) return <p className="text-sm text-muted">No bookings in this period.</p>;
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

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
