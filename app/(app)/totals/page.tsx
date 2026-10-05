import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Legend, StackedColumns } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { TargetBar } from "@/components/target-bar";
import { isOwner, requireOffice } from "@/lib/auth";
import { BILLABLE } from "@/lib/constants";
import { addDays, daysBetween, endOfMonth, fmtShort, startOfWeek, todayIn } from "@/lib/dates";
import { charge, gstOf, money, num, pct, shareLabel } from "@/lib/format";
import type { Job } from "@/lib/types";
import { monthly, summarise, weekly, type BucketRow } from "@/lib/metrics";

export const metadata: Metadata = { title: "Totals" };

// What's been booked, month by month and week by week, for any year: past
// years from history, future months as booked so far. Counted by pick-up
// date, like the dashboard: confirmed, done and no-show bookings.
export default async function TotalsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, store } = await requireOffice();
  const q = await searchParams;
  const settings = await store.settings();
  const cur = settings.currency;
  const share = shareLabel(settings.business_name);
  const today = todayIn(settings.timezone);
  const thisYear = Number(today.slice(0, 4));
  const asked = Number(typeof q.year === "string" ? q.year : NaN);
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= 2100 ? asked : thisYear;

  const first = `${year}-01-01`;
  const last = `${year}-12-31`;
  const firstWeek = startOfWeek(first);
  const weekCount = Math.floor(daysBetween(firstWeek, last) / 7) + 1;
  const [jobs, target, taken, overheads, leads] = await Promise.all([
    store.jobs({ from: firstWeek, to: last }),
    store.weeklyTarget(),
    store.jobs({ bookedFrom: first, bookedTo: last, statuses: BILLABLE }), // bookings taken this year, whatever the trip date
    store.overheads(first, `${year}-12-01`),
    store.leads(first, last),
  ]);

  const yearJobs = jobs.filter((j) => j.pickup_date >= first);
  const total = summarise(yearJobs);
  const months = monthly(yearJobs, first, 12);
  const allWeeks = weekly(jobs, firstWeek, weekCount);
  // Only the stretch of the year that has bookings (and this week), not a
  // run of empty weeks before the first booking or after the last.
  const used = allWeeks.map((w, i) => (w.bookings || w.lost || w.start === startOfWeek(today) ? i : -1)).filter((i) => i >= 0);
  const weeks = used.length ? allWeeks.slice(used[0], used[used.length - 1] + 1) : [];
  const thisMonth = today.slice(0, 7);
  const thisWeek = startOfWeek(today);

  const m = (n: number) => money(n, cur, { cents: false });
  const monthName = (d: string) => new Intl.DateTimeFormat("en-NZ", { month: "long", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const monthShort = (d: string) => new Intl.DateTimeFormat("en-NZ", { month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const jobsLink = (from: string, to: string) => `/jobs?view=all&from=${from}&to=${to}`;

  // Per month: bookings taken (by the day they were booked), running costs,
  // enquiries, and how the month's trips were paid.
  const monthKeys = months.map((r) => r.start.slice(0, 7));
  const perMonth = <T,>(make: () => T) => new Map(monthKeys.map((k) => [k, make()]));
  const takenBy = perMonth(() => ({ n: 0, total: 0 }));
  for (const j of taken) {
    const t = j.booked_on ? takenBy.get(j.booked_on.slice(0, 7)) : undefined;
    if (t) {
      t.n++;
      t.total += charge(j);
    }
  }
  const costBy = perMonth(() => 0);
  for (const o of overheads) costBy.set(o.month.slice(0, 7), (costBy.get(o.month.slice(0, 7)) ?? 0) + o.amount);
  const leadsBy = perMonth(() => 0);
  for (const l of leads) leadsBy.set(l.day.slice(0, 7), (leadsBy.get(l.day.slice(0, 7)) ?? 0) + l.leads);
  const expensesBy = perMonth(() => 0);
  const PAID_WAYS = ["online", "cash", "card", "bank", "invoiced", "to collect", "not paid"] as const;
  type Way = (typeof PAID_WAYS)[number];
  const wayOf = (j: Job): Way =>
    j.money?.payment_status === "paid" ? ((j.money.payment_method ?? "bank") as Way)
    : j.money?.payment_status === "invoiced" ? "invoiced"
    : j.money?.payment_status === "pay_on_day" ? "to collect"
    : "not paid";
  const paidBy = perMonth(() => Object.fromEntries(PAID_WAYS.map((w) => [w, 0])) as Record<Way, number>);
  for (const j of yearJobs) {
    if (!BILLABLE.includes(j.status)) continue;
    const k = j.pickup_date.slice(0, 7);
    paidBy.get(k)![wayOf(j)] += charge(j);
    expensesBy.set(k, (expensesBy.get(k) ?? 0) + (j.money ? j.money.fuel_cost + j.money.tolls_parking + j.money.other_cost : 0));
  }
  const yearTaken = [...takenBy.values()].reduce((a, t) => ({ n: a.n + t.n, total: a.total + t.total }), { n: 0, total: 0 });
  const yearCosts = [...costBy.values()].reduce((a, b) => a + b, 0);
  const yearLeads = [...leadsBy.values()].reduce((a, b) => a + b, 0);
  const anyLeads = yearLeads > 0;
  const gst = settings.gst_registered;

  const pastWeeks = weeks.filter((w) => w.start < thisWeek);
  const hit = target ? pastWeeks.filter((w) => w.charges >= target).length : 0;
  const moneySplit = [
    { name: share, colour: "var(--color-series-1)" },
    { name: "Driver pay", colour: "var(--color-series-3)" },
  ];

  return (
    <>
      <PageHeader
        title="Totals"
        intro="Everything booked, month by month and week by week, by pick-up date. Future months and weeks show what's booked so far."
        actions={<Link href={`/jobs/export?from=${first}&to=${last}`} className="btn btn-quiet">Download {year} for Excel</Link>}
      />

      <nav aria-label="Year" className="mb-4 flex items-center gap-1">
        <Link href={`/totals?year=${year - 1}`} className="btn btn-quiet btn-sm" aria-label={`${year - 1}`}>‹ {year - 1}</Link>
        <span className="px-3 text-xl font-bold tabular">{year}</span>
        <Link href={`/totals?year=${year + 1}`} className="btn btn-quiet btn-sm" aria-label={`${year + 1}`}>{year + 1} ›</Link>
        {year !== thisYear ? <Link href="/totals" className="btn btn-quiet btn-sm ml-2">This year</Link> : null}
      </nav>

      <section aria-label={`${year} in numbers`} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Bookings" value={num(total.booked)} note={year >= thisYear ? "so far" : undefined} />
        <StatTile label="Total booking $" value={m(total.charges)} />
        <StatTile label={share} value={m(total.businessPay)} note={`Driver pay ${m(total.driverPay)}`} />
        {target ? (
          <StatTile label="Weekly target" value={m(target)} note={pastWeeks.length ? `Reached in ${hit} of ${pastWeeks.length} past weeks` : undefined} />
        ) : (
          <StatTile
            label="Weekly target"
            value="Not set"
            note={isOwner(viewer.role) ? <Link href="/settings#target" className="link">Set one in Settings</Link> : "The owner sets it in Settings"}
          />
        )}
      </section>

      <Card title="Month by month" sub={`Total booking $ each month of ${year}, split into ${share} and driver pay.`}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0">
            <div className="mb-3"><Legend series={moneySplit} /></div>
            <StackedColumns
              ariaLabel={`Total booking $ per month in ${year}, split into ${share} and driver pay`}
              labels={months.map((r) => monthShort(r.start))}
              series={moneySplit}
              values={months.map((r) => [r.businessPay, r.driverPay])}
              format="compact"
            />
          </div>
          <TotalsTable
            first="Month"
            share={share}
            m={m}
            rows={months.map((r) => ({
              key: r.start,
              label: (
                <Link href={jobsLink(r.start, endOfMonth(r.start))} className="hover:underline">
                  {monthName(r.start)}
                  {r.start.slice(0, 7) > thisMonth ? <span className="ml-1 text-xs font-normal text-muted">so far</span> : null}
                </Link>
              ),
              row: r,
              now: r.start.slice(0, 7) === thisMonth,
            }))}
            total={{ bookings: total.booked, charges: total.charges, driverPay: total.driverPay, businessPay: total.businessPay, lost: total.cancelled + total.noShow }}
          />
        </div>
      </Card>

      <Card
        title="Each month in detail"
        sub={`Bookings taken in the month (the old "New booking for month": by the day they were booked, not the trip date)${gst ? ", the GST in the month's charges" : ""}, running costs from Costs, and what's left${anyLeads ? ", plus enquiries from Leads" : ""}. Older imported bookings without a TW- reference have no booked-on day.`}
      >
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm tabular">
            <thead>
              <tr className="border-b border-line">
                <th className="th px-2">Month</th>
                <th className="th px-2 text-right">Taken this month</th>
                <th className="th px-2 text-right">Total booking $</th>
                {gst ? <th className="th px-2 text-right">GST in it</th> : null}
                <th className="th px-2 text-right">{share}</th>
                <th className="th px-2 text-right">Running costs</th>
                <th className="th px-2 text-right">Left after costs</th>
                {anyLeads ? <th className="th px-2 text-right">Enquiries</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {months.map((r) => {
                const k = r.start.slice(0, 7);
                const t = takenBy.get(k)!;
                const cost = costBy.get(k) ?? 0;
                const lead = leadsBy.get(k) ?? 0;
                const left = r.businessPay - (expensesBy.get(k) ?? 0) - cost;
                return (
                  <tr key={k} className={k === thisMonth ? "bg-accent/10 font-semibold" : ""}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{monthName(r.start)}</td>
                    <td className="px-2 py-1.5 text-right">{t.n ? <>{m(t.total)} <span className="text-xs text-muted">({t.n})</span></> : <span className="text-muted">–</span>}</td>
                    <td className="px-2 py-1.5 text-right">{m(r.charges)}</td>
                    {gst ? <td className="px-2 py-1.5 text-right text-muted">{m(gstOf(r.charges))}</td> : null}
                    <td className="px-2 py-1.5 text-right">{m(r.businessPay)}</td>
                    <td className="px-2 py-1.5 text-right">{cost ? m(cost) : <span className="text-muted">–</span>}</td>
                    <td className={`px-2 py-1.5 text-right ${left < 0 ? "text-bad" : ""}`}>{m(left)}</td>
                    {anyLeads ? (
                      <td className="px-2 py-1.5 text-right">
                        {lead ? <>{num(lead)} <span className="text-xs text-muted">({pct(Math.min(t.n / lead, 1))} booked)</span></> : <span className="text-muted">–</span>}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-line-2 font-bold">
                <td className="px-2 py-2">Year</td>
                <td className="px-2 py-2 text-right">{m(yearTaken.total)}</td>
                <td className="px-2 py-2 text-right">{m(total.charges)}</td>
                {gst ? <td className="px-2 py-2 text-right">{m(gstOf(total.charges))}</td> : null}
                <td className="px-2 py-2 text-right">{m(total.businessPay)}</td>
                <td className="px-2 py-2 text-right">{m(yearCosts)}</td>
                <td className="px-2 py-2 text-right">{m(total.businessPay - total.expenses - yearCosts)}</td>
                {anyLeads ? <td className="px-2 py-2 text-right">{num(yearLeads)}</td> : null}
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Card title="How each month was paid" sub="Total booking $ by how it was paid. To collect = pay on the day, still to come. Not paid = nothing recorded yet.">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm tabular">
            <thead>
              <tr className="border-b border-line">
                <th className="th px-2">Month</th>
                {["Online", "Cash", "Card", "Bank", "Invoiced", "To collect", "Not paid"].map((h) => <th key={h} className="th px-2 text-right">{h}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {months.map((r) => {
                const k = r.start.slice(0, 7);
                const p = paidBy.get(k)!;
                return (
                  <tr key={k} className={k === thisMonth ? "bg-accent/10 font-semibold" : ""}>
                    <td className="px-2 py-1.5 whitespace-nowrap">{monthName(r.start)}</td>
                    {PAID_WAYS.map((w) => (
                      <td key={w} className={`px-2 py-1.5 text-right ${w === "not paid" && p[w] && k < thisMonth ? "text-bad" : ""}`}>
                        {p[w] ? m(p[w]) : <span className="text-muted">–</span>}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Week by week"
        sub={`Monday to Sunday weeks in ${year}${target ? `, against the weekly target of ${m(target)}` : ""}. Tap a week to see its bookings.`}
      >
        {weeks.length === 0 ? (
          <p className="text-sm text-muted">No bookings in {year}.</p>
        ) : (
          <TotalsTable
            first="Week (Mon – Sun)"
            share={share}
            m={m}
            target={target}
            rows={weeks.map((w) => ({
              key: w.start,
              label: (
                <Link href={jobsLink(w.start, addDays(w.start, 6))} className="hover:underline">
                  {fmtShort(w.start)} – {fmtShort(addDays(w.start, 6))}
                  {w.start > thisWeek ? <span className="ml-1 text-xs font-normal text-muted">so far</span> : null}
                </Link>
              ),
              row: w,
              now: w.start === thisWeek,
            }))}
          />
        )}
      </Card>
    </>
  );
}

function Card({ title, sub, children }: { title: string; sub: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="card mt-4 min-w-0 p-4">
      <h2 className="font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-muted">{sub}</p>
      {children}
    </section>
  );
}

type Line = { key: string; label: ReactNode; row: BucketRow; now: boolean };
type Sum = Pick<BucketRow, "bookings" | "charges" | "driverPay" | "businessPay" | "lost">;

// Bookings, total $, driver pay, the business's share and cancellations per
// row; on a phone only the first three columns fit, so the rest hide.
function TotalsTable({
  first, share, m, rows, total, target,
}: {
  first: string; share: string; m: (n: number) => string; rows: Line[]; total?: Sum; target?: number | null;
}) {
  const wide = "hidden sm:table-cell";
  return (
    <div className="-mx-4 min-w-0 overflow-x-auto px-4">
      <table className="w-full text-sm tabular">
        <thead>
          <tr className="border-b border-line">
            <th className="th px-2">{first}</th>
            <th className="th px-2 text-right">Bookings</th>
            <th className="th px-2 text-right">Total booking $</th>
            {target ? <th className="th px-2 text-right">vs target</th> : null}
            <th className={`th px-2 text-right ${wide}`}>Driver pay</th>
            <th className={`th px-2 text-right ${wide}`}>{share}</th>
            <th className={`th px-2 text-right ${wide}`}>Cancelled / no-show</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map(({ key, label, row, now }) => (
            <tr key={key} className={now ? "bg-accent/10 font-semibold" : ""}>
              <td className="px-2 py-1.5 whitespace-nowrap">{label}</td>
              <td className="px-2 py-1.5 text-right">{num(row.bookings)}</td>
              <td className="px-2 py-1.5 text-right">{m(row.charges)}</td>
              {target ? <td className="px-2 py-1.5 text-right"><TargetBar value={row.charges} target={target} /></td> : null}
              <td className={`px-2 py-1.5 text-right ${wide}`}>{m(row.driverPay)}</td>
              <td className={`px-2 py-1.5 text-right ${wide}`}>{m(row.businessPay)}</td>
              <td className={`px-2 py-1.5 text-right text-muted ${wide}`}>{num(row.lost)}</td>
            </tr>
          ))}
        </tbody>
        {total ? (
          <tfoot>
            <tr className="border-t-2 border-line-2 font-bold">
              <td className="px-2 py-2">Year</td>
              <td className="px-2 py-2 text-right">{num(total.bookings)}</td>
              <td className="px-2 py-2 text-right">{m(total.charges)}</td>
              {target ? <td /> : null}
              <td className={`px-2 py-2 text-right ${wide}`}>{m(total.driverPay)}</td>
              <td className={`px-2 py-2 text-right ${wide}`}>{m(total.businessPay)}</td>
              <td className={`px-2 py-2 text-right text-muted ${wide}`}>{num(total.lost)}</td>
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
