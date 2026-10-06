"use client";

import Link from "next/link";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";
import { ActionForm } from "@/components/action-form";
import { addVehicles, importBookings } from "./actions";

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

      {state?.mode === "check" && (state.setup?.vehicles.length || state.setup?.drivers.length) ? (
        <section className="card flex flex-col gap-4 border-warn/40 p-4">
          <div>
            <h2 className="font-bold">Set up before importing</h2>
            <p className="text-sm text-muted">
              The sheet uses these names, but they aren&rsquo;t in the app yet, so their rows are flagged. Set them up, then press <b>Check the file</b> again.
            </p>
          </div>

          {state.setup.vehicles.length ? (
            <ActionForm action={addVehicles} submitLabel="Add these vehicles" pendingLabel="Adding…" submitClass="btn btn-quiet btn-sm" className="flex flex-col gap-2">
              <fieldset>
                <legend className="field-label">Vehicles</legend>
                <ul className="flex flex-col gap-1 text-sm">
                  {state.setup.vehicles.map((v) => (
                    <li key={v.name}>
                      <label className="inline-flex items-center gap-2">
                        <input type="checkbox" name="vehicle" value={v.name} defaultChecked={v.jobs >= 2} className="size-4" />
                        <b>{v.name}</b> <span className="text-muted">({v.jobs} booking{v.jobs === 1 ? "" : "s"})</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="field-hint">One-offs like &ldquo;Take Camry&rdquo; can stay unticked; those bookings just come in without a vehicle.</p>
              </fieldset>
            </ActionForm>
          ) : null}

          {state.setup.drivers.length ? (
            <div className="text-sm">
              <p className="field-label">Drivers not on the Team page</p>
              <ul className="flex flex-col gap-1">
                {state.setup.drivers.map((d) => (
                  <li key={d.name}>
                    <b>{d.name}</b>{" "}
                    <span className="text-muted">
                      ({d.jobs} booking{d.jobs === 1 ? "" : "s"}{d.upcoming ? `, ${d.upcoming} still to come` : ", all in the past"})
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-muted">
                Anyone still driving: add them on the <Link href="/team" className="link">Team page</Link> with their email, so they can sign in and see their jobs.
                Anyone who has left can be skipped: their bookings come in as Driver TBC with &ldquo;Driver: name&rdquo; kept in the notes.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

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
                      {r.duplicate ? <p className="text-xs no-underline">Already in the app (or listed twice in the file), skipped</p> : null}
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
