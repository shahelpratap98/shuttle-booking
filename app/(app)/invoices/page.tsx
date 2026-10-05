import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PaymentChip } from "@/components/chips";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { METHOD_LABEL, METHODS } from "@/lib/constants";
import { addDays, daysBetween, fmtDay, todayIn } from "@/lib/dates";
import { bookingRef, charge, money } from "@/lib/format";
import type { Job } from "@/lib/types";
import { markInvoicePaid } from "./actions";

export const metadata: Metadata = { title: "Invoices" };

// Money still owed for trips: invoiced bookings, account customers (hotels,
// schools, companies) and part-paid tours, grouped by who pays. The sheet
// kept these as "Invoice # INV-0092", "On account", "Charge Hotel", "Paid 3000".
export default async function InvoicesPage() {
  const { store } = await requireOffice();
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const cur = settings.currency;

  const jobs = await store.jobs({ from: addDays(today, -730), statuses: ["confirmed", "completed", "no_show"] });
  const owed = (j: Job) => (j.money ? Math.max(charge(j) - j.money.amount_paid, 0) : 0);
  // Waiting for money: invoiced, or a finished trip still not paid, or a deposit with the rest to come.
  const open = jobs.filter(
    (j) =>
      j.money &&
      j.money.payment_status !== "paid" &&
      owed(j) > 0 &&
      (j.money.payment_status === "invoiced" || j.money.amount_paid > 0 || (j.pickup_date < today && j.money.payment_status === "unpaid")),
  );

  type Group = { key: string; payer: string; jobs: Job[]; total: number; oldest: string };
  const groups = new Map<string, Group>();
  for (const j of open) {
    const payer = j.money?.bill_to || j.customer_name;
    const key = j.money?.invoice_no ? `inv:${j.money.invoice_no}` : `who:${payer.toLowerCase()}`;
    const g = groups.get(key) ?? { key, payer, jobs: [], total: 0, oldest: j.pickup_date };
    g.jobs.push(j);
    g.total += owed(j);
    if (j.pickup_date < g.oldest) g.oldest = j.pickup_date;
    groups.set(key, g);
  }
  const list = [...groups.values()].sort((a, b) => a.oldest.localeCompare(b.oldest));
  const total = list.reduce((s, g) => s + g.total, 0);
  const m = (n: number) => money(n, cur);

  return (
    <>
      <PageHeader
        title="Invoices"
        intro={<>Money still owed for trips, oldest first: <b className="text-text tabular">{m(total)}</b> in all. Mark an invoice paid when the money arrives.</>}
        actions={<Link href="/jobs?view=unpaid" className="btn btn-quiet">Waiting for payment list</Link>}
      />
      {list.length === 0 ? (
        <EmptyState title="Nothing owed.">Invoiced bookings, account customers and part-paid trips show up here.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((g) => {
            const age = daysBetween(g.oldest, today);
            const invoice = g.key.startsWith("inv:") ? g.key.slice(4) : null;
            return (
              <section key={g.key} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="text-lg font-bold">{invoice ?? g.payer}</h2>
                  {invoice ? <span className="text-sm text-muted">{g.payer}</span> : null}
                  <span className="ml-auto text-lg font-bold tabular">{m(g.total)}</span>
                </div>
                <p className={`text-sm ${age > 30 ? "font-semibold text-bad" : "text-muted"}`}>
                  {g.jobs.length} booking{g.jobs.length === 1 ? "" : "s"}; oldest trip {age > 0 ? `${age} day${age === 1 ? "" : "s"} ago` : "still to come"}
                </p>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {g.jobs.map((j) => (
                    <li key={j.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                      <Link href={`/jobs/${j.id}`} className="w-28 shrink-0 font-semibold hover:underline">{fmtDay(j.pickup_date)}</Link>
                      <span className="min-w-0 flex-1 truncate">{j.customer_name} · {bookingRef(j)}</span>
                      {j.money ? <PaymentChip status={j.money.payment_status} /> : null}
                      {j.money?.amount_paid ? <span className="text-muted tabular">paid {m(j.money.amount_paid)} of {m(charge(j))}</span> : null}
                      <span className="font-semibold tabular">{m(owed(j))}</span>
                    </li>
                  ))}
                </ul>
                <ActionForm action={markInvoicePaid} submitLabel="Mark all paid" pendingLabel="Saving…" submitClass="btn btn-primary btn-sm" className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="job_ids" value={g.jobs.map((j) => j.id).join(",")} />
                  <div>
                    <label htmlFor={`m-${g.key}`} className="field-label">Paid by</label>
                    <select id={`m-${g.key}`} name="method" defaultValue="bank" className="field w-auto">
                      {METHODS.map((x) => <option key={x} value={x}>{METHOD_LABEL[x]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`on-${g.key}`} className="field-label">On</label>
                    <input id={`on-${g.key}`} name="on" type="date" max={today} defaultValue={today} className="field w-auto" />
                  </div>
                </ActionForm>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
