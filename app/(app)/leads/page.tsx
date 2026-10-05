import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireOffice } from "@/lib/auth";
import { BILLABLE } from "@/lib/constants";
import { addMonths, eachDay, endOfMonth, fmtDay, fmtMonth, startOfMonth, todayIn } from "@/lib/dates";
import { num, pct } from "@/lib/format";
import { saveLeadDay } from "./actions";

export const metadata: Metadata = { title: "Leads" };

// Enquiries per day (the old "Lead Record" tab) next to the bookings taken
// that day, so you can see how many enquiries turn into bookings.
export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? `${q.month}-01` : startOfMonth(today);
  const last = endOfMonth(month);

  const [leads, taken] = await Promise.all([store.leads(month, last), store.jobs({ bookedFrom: month, bookedTo: last, statuses: BILLABLE })]);
  const byDay = new Map(leads.map((l) => [l.day, l]));
  const bookedOn = new Map<string, number>();
  for (const j of taken) if (j.booked_on) bookedOn.set(j.booked_on, (bookedOn.get(j.booked_on) ?? 0) + 1);

  const days = eachDay(month, last < today ? last : today < month ? month : today).reverse();
  const totalLeads = leads.reduce((s, l) => s + l.leads, 0);
  const totalLocal = leads.reduce((s, l) => s + (l.local ?? 0), 0);
  const daysWithLeads = leads.filter((l) => l.leads > 0).length;
  const ym = (d: string) => d.slice(0, 7);

  return (
    <>
      <PageHeader title="Leads" intro="Enquiries each day (website, calls, messages), next to the bookings taken that day." />

      <nav aria-label="Month" className="mb-4 flex items-center gap-1">
        <Link href={`/leads?month=${ym(addMonths(month, -1))}`} className="btn btn-quiet btn-sm" aria-label="Previous month">‹</Link>
        <span className="px-3 text-lg font-bold">{fmtMonth(month)}</span>
        <Link href={`/leads?month=${ym(addMonths(month, 1))}`} className="btn btn-quiet btn-sm" aria-label="Next month">›</Link>
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Enquiries" value={num(totalLeads)} note={totalLocal ? `${num(totalLocal)} local` : undefined} />
        <StatTile label="Average a day" value={daysWithLeads ? num(totalLeads / daysWithLeads, 1) : "–"} note={daysWithLeads ? `over ${daysWithLeads} day${daysWithLeads === 1 ? "" : "s"}` : undefined} />
        <StatTile label="Bookings taken" value={num(taken.length)} note="new bookings made this month" />
        <StatTile label="Turned into bookings" value={totalLeads ? pct(Math.min(taken.length / totalLeads, 1)) : "–"} note="bookings taken ÷ enquiries" />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0 overflow-hidden">
          <table className="w-full text-sm tabular">
            <thead className="border-b border-line bg-surface-2">
              <tr>
                <th className="th">Day</th>
                <th className="th text-right">Enquiries</th>
                <th className="th text-right">Local</th>
                <th className="th text-right">Bookings taken</th>
                <th className="th hidden sm:table-cell">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {days.map((d) => {
                const l = byDay.get(d);
                return (
                  <tr key={d} className={d === today ? "bg-accent/10 font-semibold" : ""}>
                    <td className="td whitespace-nowrap">{fmtDay(d)}</td>
                    <td className="td text-right">{l ? num(l.leads) : <span className="text-muted">–</span>}</td>
                    <td className="td text-right text-muted">{l?.local ?? ""}</td>
                    <td className="td text-right">{bookedOn.get(d) ?? 0}</td>
                    <td className="td hidden text-muted sm:table-cell">{l?.note ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {days.length === 0 ? <p className="p-4 text-sm text-muted">This month hasn&rsquo;t started yet.</p> : null}
        </section>

        <section className="card h-fit p-4">
          <h2 className="mb-3 font-bold">Enter a day</h2>
          <ActionForm action={saveLeadDay} submitLabel="Save" className="flex flex-col gap-3">
            <div>
              <label htmlFor="day" className="field-label">Day</label>
              <input id="day" name="day" type="date" max={today} defaultValue={today} required className="field" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="leads" className="field-label">Enquiries</label>
                <input id="leads" name="leads" type="number" min={0} max={10000} required className="field" />
              </div>
              <div>
                <label htmlFor="local" className="field-label">of which local</label>
                <input id="local" name="local" type="number" min={0} max={10000} className="field" />
              </div>
            </div>
            <div>
              <label htmlFor="note" className="field-label">Note (optional)</label>
              <input id="note" name="note" maxLength={300} className="field" placeholder="Google ads started, school holidays…" />
            </div>
            <p className="field-hint">Saving a day again replaces its numbers.</p>
          </ActionForm>
        </section>
      </div>
    </>
  );
}
