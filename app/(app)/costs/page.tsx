import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";
import { requireOffice } from "@/lib/auth";
import { BILLABLE } from "@/lib/constants";
import { addMonths, endOfMonth, fmtMonth, startOfMonth, todayIn } from "@/lib/dates";
import { money, num, shareLabel } from "@/lib/format";
import { summarise } from "@/lib/metrics";
import { addOverhead, copyLastMonth, removeOverhead } from "./actions";
import { RunCalculator } from "./run-calculator";

export const metadata: Metadata = { title: "Costs" };

// Costs every month, not one trip: Google and Facebook ads, the marketing
// helper, staff, fuel cards, phone, insurance. With them, the month's real
// profit and what each booking cost in marketing.
const SUGGESTED = ["Google ads", "Facebook ads", "Marketing (Jaikar)", "Staff", "Fuel card", "Phone and internet", "Insurance", "Vehicle finance", "Office", "Accountant"];
const MARKETING = /ads|marketing|google|facebook|jaikar/i;

export default async function CostsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const month = typeof q.month === "string" && /^\d{4}-\d{2}$/.test(q.month) ? `${q.month}-01` : startOfMonth(today);
  const cur = settings.currency;
  const share = shareLabel(settings.business_name);

  const [costs, jobs] = await Promise.all([store.overheads(month, month), store.jobs({ from: month, to: endOfMonth(month), statuses: BILLABLE })]);
  const s = summarise(jobs);
  const overheads = costs.reduce((t, o) => t + o.amount, 0);
  const marketing = costs.filter((o) => MARKETING.test(o.category)).reduce((t, o) => t + o.amount, 0);
  const left = s.businessPay - s.expenses - overheads;
  const m = (n: number) => money(n, cur, { cents: false });
  const ym = (d: string) => d.slice(0, 7);

  return (
    <>
      <PageHeader title="Costs" intro="Running costs each month (ads, staff, fuel…), the month's profit after them, and a calculator for regular runs." />

      <nav aria-label="Month" className="mb-4 flex items-center gap-1">
        <Link href={`/costs?month=${ym(addMonths(month, -1))}`} className="btn btn-quiet btn-sm" aria-label="Previous month">‹</Link>
        <span className="px-3 text-lg font-bold">{fmtMonth(month)}</span>
        <Link href={`/costs?month=${ym(addMonths(month, 1))}`} className="btn btn-quiet btn-sm" aria-label="Next month">›</Link>
      </nav>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={share} value={m(s.businessPay)} note={`${num(s.booked)} bookings, ${m(s.charges)} charged`} />
        <StatTile label="Running costs" value={m(overheads)} note={s.expenses ? `plus ${m(s.expenses)} on jobs` : undefined} />
        <StatTile label="Left after costs" value={m(left)} note={left < 0 ? "costs are more than the month brought in" : undefined} />
        <StatTile label="Marketing a booking" value={s.booked && marketing ? m(marketing / s.booked) : "–"} note={marketing ? `${m(marketing)} on marketing` : "add ads to see this"} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="card min-w-0 p-4">
          <h2 className="mb-2 font-bold">{fmtMonth(month)} costs</h2>
          {costs.length === 0 ? (
            <p className="text-sm text-muted">Nothing entered for this month yet.</p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {costs.map((o) => (
                <li key={o.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="min-w-0 flex-1 font-semibold">{o.category}{o.note ? <span className="font-normal text-muted"> · {o.note}</span> : null}</span>
                  <span className="tabular">{money(o.amount, cur)}</span>
                  <ActionForm action={removeOverhead} submitLabel="Remove" pendingLabel="…" submitClass="btn btn-quiet btn-sm">
                    <input type="hidden" name="id" value={o.id} />
                  </ActionForm>
                </li>
              ))}
              <li className="flex justify-between py-2 font-bold"><span>Total</span><span className="tabular">{money(overheads, cur)}</span></li>
            </ul>
          )}
          <ActionForm action={copyLastMonth} submitLabel={`Copy ${fmtMonth(addMonths(month, -1))}'s costs`} pendingLabel="Copying…" submitClass="btn btn-quiet btn-sm mt-3">
            <input type="hidden" name="month" value={month} />
          </ActionForm>
        </section>

        <section className="card h-fit p-4">
          <h2 className="mb-3 font-bold">Add a cost</h2>
          <ActionForm action={addOverhead} submitLabel="Add" resetOnSuccess className="flex flex-col gap-3">
            <input type="hidden" name="month" value={month} />
            <div>
              <label htmlFor="category" className="field-label">What</label>
              <input id="category" name="category" list="cost-kinds" required maxLength={60} className="field" placeholder="Google ads" />
              <datalist id="cost-kinds">{SUGGESTED.map((c) => <option key={c} value={c} />)}</datalist>
            </div>
            <div>
              <label htmlFor="amount" className="field-label">Amount for the month ({cur})</label>
              <input id="amount" name="amount" inputMode="decimal" required className="field" placeholder="1350" />
              <p className="field-hint">Google ads at $45 a day is $1,350 for 30 days.</p>
            </div>
            <div>
              <label htmlFor="cost-note" className="field-label">Note (optional)</label>
              <input id="cost-note" name="note" maxLength={300} className="field" />
            </div>
          </ActionForm>
        </section>
      </div>

      <section className="card mt-6 p-4">
        <h2 className="font-bold">Regular run calculator</h2>
        <p className="mb-3 text-sm text-muted">For quoting a contract or a daily shuttle (e.g. Papamoa to Auckland): what it brings in and what&rsquo;s left after drivers, fuel and marketing.</p>
        <RunCalculator currency={cur} />
      </section>
    </>
  );
}
