"use client";

import { useActionState, useState } from "react";
import { assignJob, driverUpdate, setStatus } from "@/app/(app)/jobs/actions";
import { Outcome } from "@/components/action-form";
import { Spinner } from "@/components/spinner";
import { STATUS_LABEL } from "@/lib/constants";
import type { JobStatus } from "@/lib/types";

export type DriverOption = { id: string; name: string; note: string | null };
export type VehicleOption = { id: string; name: string; note: string | null };

// Pick a driver and vehicle for a job. Drivers who are off or already busy at
// that time are labelled, not hidden: the owner may still know better.
export function AssignForm({
  jobId,
  driverId,
  vehicleId,
  drivers,
  vehicles,
  compact = false,
}: {
  jobId: string;
  driverId: string | null;
  vehicleId: string | null;
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(assignJob, undefined);
  const [driver, setDriver] = useState(driverId ?? "");
  const chosen = drivers.find((d) => d.id === driver);

  return (
    <form action={action} className={compact ? "flex flex-col gap-2 sm:flex-row sm:items-center" : "flex flex-col gap-3"}>
      <input type="hidden" name="job_id" value={jobId} />
      <label className={compact ? "sr-only" : "field-label"} htmlFor={`driver-${jobId}`}>Driver</label>
      <select
        id={`driver-${jobId}`}
        name="driver_id"
        value={driver}
        onChange={(e) => setDriver(e.target.value)}
        className={`field ${compact ? "w-full py-1.5 text-sm sm:w-60" : ""}`}
      >
        <option value="">TBC</option>
        {drivers.map((d) => (
          <option key={d.id} value={d.id}>{d.name}{d.note ? ` (${d.note})` : ""}</option>
        ))}
      </select>
      <label className={compact ? "sr-only" : "field-label"} htmlFor={`vehicle-${jobId}`}>Vehicle</label>
      <select id={`vehicle-${jobId}`} name="vehicle_id" defaultValue={vehicleId ?? ""} className={`field ${compact ? "w-full py-1.5 text-sm sm:w-44" : ""}`}>
        <option value="">Vehicle not set</option>
        {vehicles.map((v) => (
          <option key={v.id} value={v.id}>{v.name}{v.note ? ` (${v.note})` : ""}</option>
        ))}
      </select>
      {!compact && chosen?.note ? <p className="text-xs font-semibold text-warn">Heads up: {chosen.name} is {chosen.note}.</p> : null}
      <button type="submit" disabled={pending} className={`btn ${compact ? "btn-sm btn-primary" : "btn-primary self-start"}`}>
        {pending ? <><Spinner /> Saving…</> : driverId ? "Update" : "Assign"}
      </button>
      {compact ? (state && !state.ok ? <span role="alert" className="text-sm font-semibold text-bad">{state.message}</span> : null) : <Outcome state={state} />}
    </form>
  );
}

// Office: move a job between statuses with one click.
export function StatusButtons({ jobId, status }: { jobId: string; status: JobStatus }) {
  const [state, action, pending] = useActionState(setStatus, undefined);
  const next: JobStatus[] =
    status === "enquiry" ? ["confirmed", "cancelled"]
    : status === "confirmed" ? ["completed", "no_show", "cancelled"]
    : ["confirmed"];
  const label = (s: JobStatus) =>
    s === "confirmed" ? (status === "enquiry" ? "Confirm booking" : "Reopen as confirmed") : s === "completed" ? "Mark done" : `Mark ${STATUS_LABEL[s].toLowerCase()}`;

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="job_id" value={jobId} />
      <div className="flex flex-wrap gap-2">
        {next.map((s) => (
          <button
            key={s}
            type="submit"
            name="status"
            value={s}
            disabled={pending}
            className={`btn btn-sm ${s === "cancelled" || s === "no_show" ? "btn-danger" : s === "completed" ? "btn-primary" : "btn-quiet"}`}
          >
            {label(s)}
          </button>
        ))}
        {pending ? <Spinner /> : null}
      </div>
      <Outcome state={state} />
    </form>
  );
}

// Driver: finish a job from their phone. On a pay-on-the-day job they also
// say how the customer paid, which marks the booking paid for the office.
export function DriverDoneForm({
  jobId,
  status,
  distanceKm,
  driverNotes,
  collect = null,
  canFinish = true,
}: {
  jobId: string;
  status: JobStatus;
  distanceKm: number | null;
  driverNotes: string | null;
  collect?: string | null; // "$180.00" when there's money to collect
  canFinish?: boolean; // false before the day of the job
}) {
  const [state, action, pending] = useActionState(driverUpdate, undefined);
  const done = status === "completed" || status === "no_show";
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="job_id" value={jobId} />
      {collect ? (
        <fieldset className="rounded-lg border border-info/30 bg-info-bg p-3">
          <legend className="px-1 text-sm font-bold text-info">Collect {collect}</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-[15px]">
            {[["cash", "Paid cash"], ["card", "Paid by card"], ["", "Not paid yet"]].map(([v, label]) => (
              <label key={v} className="inline-flex min-h-11 items-center gap-2 font-semibold">
                <input type="radio" name="collected_via" value={v} defaultChecked={v === ""} className="size-5" />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`km-${jobId}`} className="field-label">Km driven</label>
          <input id={`km-${jobId}`} name="distance_km" type="number" inputMode="decimal" min={0} max={5000} step={0.1} defaultValue={distanceKm ?? ""} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor={`notes-${jobId}`} className="field-label">Notes for the office</label>
        <textarea id={`notes-${jobId}`} name="driver_notes" rows={2} maxLength={1000} defaultValue={driverNotes ?? ""} className="field" placeholder="Flight late, extra stop, parking paid…" />
      </div>
      <div className="flex flex-wrap gap-2">
        {done ? (
          <>
            <button type="submit" name="status" value={status} disabled={pending} className="btn btn-primary">{pending ? <Spinner /> : null} Save</button>
            <button type="submit" name="status" value="confirmed" disabled={pending} className="btn btn-quiet">Undo: not done yet</button>
          </>
        ) : canFinish ? (
          <>
            <button type="submit" name="status" value="completed" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">{pending ? <Spinner /> : null} Mark done</button>
            <button type="submit" name="status" value="no_show" disabled={pending} className="btn btn-danger">Customer no-show</button>
          </>
        ) : (
          <p className="text-sm text-muted">You can mark this done on the day.</p>
        )}
      </div>
      <Outcome state={state} />
    </form>
  );
}
