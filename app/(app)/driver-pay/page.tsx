import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { PersonDot } from "@/components/chips";
import { EmptyState, PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { addDays, fmtDate, fmtDay, isIsoDate, todayIn } from "@/lib/dates";
import { bookingRef, money } from "@/lib/format";
import type { Job } from "@/lib/types";
import { settleDriver } from "./actions";

export const metadata: Metadata = { title: "Driver pay" };

// Weekly driver pay runs (the sheet's "Paid Shef" column): for each driver,
// what we owe them for finished jobs not paid out yet, less any cash they
// collected from customers and are still holding.
export default async function DriverPayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { store } = await requireOffice();
  const q = await searchParams;
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const upTo = typeof q.to === "string" && isIsoDate(q.to) && q.to <= today ? q.to : today;
  const cur = settings.currency;

  const [owing, recent, people] = await Promise.all([
    store.jobs({ to: upTo, statuses: ["completed", "no_show"], unsettled: true }),
    store.jobs({ from: addDays(today, -120), to: today, statuses: ["completed", "no_show"] }),
    store.people(),
  ]);
  const person = new Map(people.map((p) => [p.user_id, p]));
  const cashHeld = (j: Job) => (j.collected_via === "cash" ? j.collect_amount : 0);

  // One group per driver, and one per outside operator.
  type Group = { key: string; name: string; colour: string | null; jobs: Job[]; pay: number; cash: number };
  const groups = new Map<string, Group>();
  for (const j of owing) {
    const key = j.driver_id ?? (j.operator ? `op:${j.operator.toLowerCase()}` : null);
    if (!key) continue;
    const p = j.driver_id ? person.get(j.driver_id) : null;
    const g = groups.get(key) ?? { key, name: p?.display_name ?? j.operator ?? "Unknown", colour: p?.colour ?? null, jobs: [], pay: 0, cash: 0 };
    g.jobs.push(j);
    g.pay += j.driver_pay;
    g.cash += cashHeld(j);
    groups.set(key, g);
  }
  // Owner-drivers (pay $0, no cash held) have nothing to settle.
  const list = [...groups.values()].filter((g) => g.pay > 0 || g.cash > 0).sort((a, b) => b.pay - b.cash - (a.pay - a.cash));

  // Paid out recently, by day and driver, so a mistake can be undone.
  const paidRuns = new Map<string, { day: string; name: string; jobs: Job[]; pay: number; cash: number }>();
  for (const j of recent) {
    if (!j.driver_settled_on || j.driver_settled_on < addDays(today, -60)) continue;
    const name = j.driver_id ? (person.get(j.driver_id)?.display_name ?? "Unknown") : (j.operator ?? "Unknown");
    const key = `${j.driver_settled_on}|${name}`;
    const r = paidRuns.get(key) ?? { day: j.driver_settled_on, name, jobs: [], pay: 0, cash: 0 };
    r.jobs.push(j);
    r.pay += j.driver_pay;
    r.cash += cashHeld(j);
    paidRuns.set(key, r);
  }
  const runs = [...paidRuns.values()].sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name)).slice(0, 20);
  const m = (n: number) => money(n, cur);
  const totalNet = list.reduce((s, g) => s + g.pay - g.cash, 0);

  return (
    <>
      <PageHeader
        title="Driver pay"
        intro="What each driver is owed for finished jobs, less cash they collected from customers. Pay them, then mark it paid out."
      />

      <form className="mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <div>
          <label htmlFor="to" className="field-label">Jobs up to</label>
          <input id="to" name="to" type="date" max={today} defaultValue={upTo} className="field w-auto" />
        </div>
        <button type="submit" className="btn btn-quiet">Show</button>
        {upTo !== today ? <Link href="/driver-pay" className="btn btn-quiet">Up to today</Link> : null}
        <p className="w-full text-sm text-muted sm:ml-2 sm:w-auto">
          To pay this run: <b className="text-text tabular">{m(totalNet)}</b>
        </p>
      </form>
      {list.length > 1 ? (
        <details className="mb-4 rounded-lg border border-line px-4 py-3 text-sm">
          <summary className="cursor-pointer font-semibold">Mark everyone paid out up to {fmtDate(upTo)}</summary>
          <p className="mt-2 text-muted">
            For history brought in from the spreadsheet that was already paid: set &ldquo;Jobs up to&rdquo; above, then mark all {list.reduce((n, g) => n + g.jobs.length, 0)} jobs
            as paid out in one go.
          </p>
          <ActionForm action={settleDriver} submitLabel="Mark all paid out" pendingLabel="Saving…" submitClass="btn btn-quiet btn-sm" className="mt-2 flex flex-wrap items-end gap-2">
            <input type="hidden" name="job_ids" value={list.flatMap((g) => g.jobs.map((j) => j.id)).join(",")} />
            <div>
              <label htmlFor="on-all" className="field-label">Paid on</label>
              <input id="on-all" name="on" type="date" max={today} defaultValue={upTo} className="field w-auto" />
            </div>
          </ActionForm>
        </details>
      ) : null}

      {list.length === 0 ? (
        <EmptyState title="Everyone is paid up.">Finished jobs show here until their driver is paid.</EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((g) => {
            const net = g.pay - g.cash;
            return (
              <section key={g.key} className="card p-4">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <h2 className="flex items-center gap-2 text-lg font-bold">
                    {g.colour ? <PersonDot colour={g.colour} className="size-3" /> : null}
                    {g.name}
                    {g.colour ? null : <span className="chip bg-idle-bg text-idle">other operator</span>}
                  </h2>
                  <p className="text-sm text-muted">{g.jobs.length} job{g.jobs.length === 1 ? "" : "s"}, {fmtDay(g.jobs[0].pickup_date)} to {fmtDay(g.jobs[g.jobs.length - 1].pickup_date)}</p>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-3 text-sm tabular sm:max-w-lg">
                  <div><dt className="text-xs text-muted">Pay for the jobs</dt><dd className="font-semibold">{m(g.pay)}</dd></div>
                  <div><dt className="text-xs text-muted">Cash they hold</dt><dd className="font-semibold">− {m(g.cash)}</dd></div>
                  <div>
                    <dt className="text-xs text-muted">{net >= 0 ? "Pay them" : "They owe us"}</dt>
                    <dd className={`text-lg font-bold ${net < 0 ? "text-bad" : ""}`}>{m(Math.abs(net))}</dd>
                  </div>
                </dl>
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer font-semibold text-muted hover:text-text">The jobs</summary>
                  <ul className="mt-2 divide-y divide-line">
                    {g.jobs.map((j) => (
                      <li key={j.id} className="flex flex-wrap items-baseline gap-x-3 py-1.5">
                        <Link href={`/jobs/${j.id}`} className="w-28 shrink-0 font-semibold hover:underline">{fmtDay(j.pickup_date)}</Link>
                        <span className="min-w-0 flex-1 truncate">{j.customer_name} · {bookingRef(j)}</span>
                        <span className="tabular">{m(j.driver_pay)}</span>
                        {cashHeld(j) ? <span className="tabular text-muted">cash {m(cashHeld(j))}</span> : null}
                      </li>
                    ))}
                  </ul>
                </details>
                <ActionForm action={settleDriver} submitLabel="Mark paid out" pendingLabel="Saving…" submitClass="btn btn-primary btn-sm" className="mt-3 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="job_ids" value={g.jobs.map((j) => j.id).join(",")} />
                  <div>
                    <label htmlFor={`on-${g.key}`} className="field-label">Paid on</label>
                    <input id={`on-${g.key}`} name="on" type="date" max={today} defaultValue={today} className="field w-auto" />
                  </div>
                </ActionForm>
              </section>
            );
          })}
        </div>
      )}

      {runs.length ? (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-bold">Paid out recently</h2>
          <ul className="card divide-y divide-line">
            {runs.map((r) => (
              <li key={`${r.day}-${r.name}`} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm">
                <span className="w-28 shrink-0 font-semibold">{fmtDate(r.day)}</span>
                <span className="min-w-0 flex-1">{r.name} · {r.jobs.length} job{r.jobs.length === 1 ? "" : "s"}</span>
                <span className="tabular">{m(r.pay - r.cash)}</span>
                <ActionForm action={settleDriver} submitLabel="Undo" pendingLabel="Undoing…" submitClass="btn btn-quiet btn-sm">
                  <input type="hidden" name="job_ids" value={r.jobs.map((j) => j.id).join(",")} />
                  <input type="hidden" name="undo" value="1" />
                </ActionForm>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
