"use client";

import Link from "next/link";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";
import { importBookings } from "./actions";

export function ImportForm({ currency }: { currency: string }) {
  const { state, pending, onSubmit, formRef } = useFormAction(importBookings);
  const fmt = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 2 }).format(n);
  const fmtDate = (d: string) => new Intl.DateTimeFormat("en-NZ", { weekday: "short", day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  const rows = state?.rows ?? [];
  const withWarnings = rows.filter((r) => r.warnings.length && !r.duplicate).length;

  return (
    <div className="flex flex-col gap-4">
      <form ref={formRef} onSubmit={onSubmit} className="card flex flex-col gap-3 p-4">
        <div>
          <label htmlFor="file" className="field-label">Booking spreadsheet (.xlsx)</label>
          <input id="file" name="file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required className="field file:mr-3 file:rounded-md file:border-0 file:bg-surface-2 file:px-3 file:py-1 file:font-semibold" />
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="submit" name="mode" value="check" disabled={pending} className="btn btn-quiet">
            {pending ? <Spinner /> : null} Check the file
          </button>
          {state?.mode === "check" && state.ready ? (
            <button type="submit" name="mode" value="import" disabled={pending} className="btn btn-primary">
              {pending ? <Spinner /> : null} Import {state.ready} booking{state.ready === 1 ? "" : "s"}
            </button>
          ) : null}
        </div>
        {state ? (
          <p role={state.ok ? "status" : "alert"} className={`rounded-lg px-3 py-2 text-sm font-semibold ${state.ok ? "bg-ok-bg text-ok" : "bg-bad-bg text-bad"}`}>
            {state.message}
          </p>
        ) : null}
        {state?.mode === "import" && state.imported ? (
          <p className="text-sm">
            <Link href="/jobs?view=upcoming" className="link">See the bookings</Link> · <Link href="/calendar?view=month" className="link">Open the calendar</Link>
          </p>
        ) : null}
        {state?.failed?.length ? (
          <ul className="list-disc pl-5 text-sm text-bad">
            {state.failed.map((f) => <li key={`${f.sheet}-${f.row}`}>{f.sheet} row {f.row}: {f.error}</li>)}
          </ul>
        ) : null}
      </form>

      {rows.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-bold">
            Preview{withWarnings ? <span className="ml-2 text-sm font-normal text-warn">{withWarnings} with something to check</span> : null}
          </h2>
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm tabular [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2">
              <thead className="border-b border-line bg-surface-2">
                <tr>
                  <th className="th">Tab / row</th>
                  <th className="th">Date</th>
                  <th className="th">Time</th>
                  <th className="th">Pick up → Drop off</th>
                  <th className="th text-right">People</th>
                  <th className="th">Driver</th>
                  <th className="th">Vehicle</th>
                  <th className="th">Name</th>
                  <th className="th text-right">Charge</th>
                  <th className="th text-right">Driver pay</th>
                  <th className="th">Payment</th>
                  <th className="th">Flight / ref</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r) => (
                  <tr key={`${r.sheet}-${r.row}`} className={r.duplicate ? "text-muted line-through decoration-1" : r.warnings.length ? "bg-warn-bg/40" : ""}>
                    <td className="whitespace-nowrap text-muted">{r.sheet} · {r.row}</td>
                    <td className="whitespace-nowrap">{fmtDate(r.date)}</td>
                    <td>{r.time}</td>
                    <td className="max-w-80">
                      <p className="truncate">{r.pickup} → {r.dropoff}</p>
                      {r.duplicate ? <p className="text-xs no-underline">Already in the app, skipped</p> : null}
                      {!r.duplicate && r.warnings.map((w) => <p key={w} className="text-xs font-semibold text-warn">{w}</p>)}
                    </td>
                    <td className="text-right">{r.people}</td>
                    <td className={r.driver === "TBC" ? "text-warn" : ""}>{r.driver}</td>
                    <td>{r.vehicle || <span className="text-muted">–</span>}</td>
                    <td className="max-w-40 truncate">{r.name}</td>
                    <td className="text-right">{fmt(r.charge)}{r.shared ? <span className="block text-xs text-muted">shared</span> : null}</td>
                    <td className="text-right">{fmt(r.driverPay)}</td>
                    <td className="whitespace-nowrap">{r.payment}</td>
                    <td className="max-w-44 truncate">{[r.flight, r.ref].filter(Boolean).join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state?.skipped?.length ? (
            <details className="text-sm">
              <summary className="cursor-pointer font-semibold text-muted">{state.skipped.length} row{state.skipped.length === 1 ? "" : "s"} left out</summary>
              <ul className="mt-2 list-disc pl-5 text-muted">
                {state.skipped.map((s) => <li key={`${s.sheet}-${s.row}`}>{s.sheet} row {s.row}: {s.reason}</li>)}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
