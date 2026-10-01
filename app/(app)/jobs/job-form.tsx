"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { saveJob } from "@/app/(app)/jobs/actions";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";
import {
  BILLABLE, METHOD_LABEL, METHODS, NO_DRIVER, PAYMENT_LABEL, PAYMENTS, ROLE_LABEL, SERVICE_LABEL, SERVICES, SOURCE_LABEL, SOURCES, STATUS_LABEL, STATUSES,
} from "@/lib/constants";
import { customerKey } from "@/lib/customers";
import { fmtDate, fmtMonth, fmtShort, startOfWeek } from "@/lib/dates";
import type { Customer } from "@/lib/store/types";
import type { Job, JobStatus, PaymentStatus, Profile, Vehicle } from "@/lib/types";
import type { BookedSoFar } from "./form-data";

type Defaults = Partial<Job> & { money?: Job["money"] };

// How long a job ties the driver up, including the drive back.
const DURATIONS: [number, string][] = [
  [60, "1 h"], [90, "1 h 30"], [120, "2 h"], [180, "3 h"], [240, "4 h · Hamilton run"], [300, "5 h"],
  [360, "6 h"], [420, "7 h · Rotorua, Tauranga run"], [540, "9 h"], [720, "12 h · full day"],
];
const asNum = (s: string) => {
  const n = Number(s.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
};

export function JobForm({
  job,
  defaults,
  people,
  vehicles,
  customers,
  places,
  currency,
  shareName,
  today,
  totals,
  weeklyTarget,
}: {
  job?: Job; // editing
  defaults: Defaults;
  people: Profile[];
  vehicles: Vehicle[];
  customers: Customer[];
  places: string[];
  currency: string;
  shareName: string; // "Trekway pay"
  today: string;
  totals: BookedSoFar; // what's booked so far per month and week
  weeklyTarget: number | null;
}) {
  const { state, pending, onSubmit, formRef } = useFormAction(saveJob);
  const d = defaults;
  const m = d.money;

  // The fields that feed the live sums are controlled; the rest aren't.
  const [duration, setDuration] = useState(String(d.duration_min ?? 240));
  const [driverId, setDriverId] = useState(d.driver_id ?? "");
  const [price, setPrice] = useState(m ? String(m.price) : "");
  const [driverPay, setDriverPay] = useState(d.driver_pay ? String(d.driver_pay) : "");
  const [fuel, setFuel] = useState(m?.fuel_cost ? String(m.fuel_cost) : "");
  const [tolls, setTolls] = useState(m?.tolls_parking ? String(m.tolls_parking) : "");
  const [other, setOther] = useState(m?.other_cost ? String(m.other_cost) : "");
  const [payment, setPayment] = useState<PaymentStatus>(m?.payment_status ?? "pay_on_day");
  const [pickupDate, setPickupDate] = useState(d.pickup_date ?? "");
  const [status, setStatus] = useState<JobStatus>(d.status ?? "confirmed");
  const [name, setName] = useState(d.customer_name ?? "");
  const [phone, setPhone] = useState(d.customer_phone ?? "");
  const [email, setEmail] = useState(d.customer_email ?? "");

  const fmt = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(n);
  const driver = people.find((p) => p.user_id === driverId);
  const suggestPay = driver?.pay_rate ? Math.round(driver.pay_rate * (asNum(duration) / 60) * 100) / 100 : null;

  const charged = asNum(price);
  const toDriver = asNum(driverPay);
  const extra = asNum(fuel) + asNum(tolls) + asNum(other);
  const kept = charged - toDriver;

  // Picking a known customer fills in their phone and email if those are empty.
  const onCustomer = (value: string) => {
    setName(value);
    const c = customers.find((x) => x.name.toLowerCase() === value.trim().toLowerCase());
    if (!c) return;
    if (!phone && c.phone) setPhone(c.phone);
    if (!email && c.email) setEmail(c.email);
  };

  // Have they booked before? Same phone, else same name (lib/customers.ts).
  const known = name.trim() ? customers.find((c) => c.key === customerKey(name, phone)) : undefined;
  const sameAsSaved = job && known?.key === customerKey(job.customer_name, job.customer_phone);
  const earlier = known ? known.bookings - (sameAsSaved && BILLABLE.includes(job.status) ? 1 : 0) : 0;

  // The month and week this booking falls in, as booked so far, and with it.
  const counts = BILLABLE.includes(status);
  const bucket = (key: string, savedIn: boolean) => {
    const t = totals[key] ?? { bookings: 0, total: 0 };
    // When editing, take this booking's saved amount out first.
    const mine = job && savedIn && BILLABLE.includes(job.status) ? { bookings: 1, total: job.money?.price ?? 0 } : { bookings: 0, total: 0 };
    const before = { bookings: t.bookings - mine.bookings, total: t.total - mine.total };
    return { before, after: counts ? { bookings: before.bookings + 1, total: before.total + charged } : before };
  };
  const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(pickupDate);
  const month = hasDate ? bucket(`m:${pickupDate.slice(0, 7)}`, job?.pickup_date.slice(0, 7) === pickupDate.slice(0, 7)) : null;
  const week = hasDate ? bucket(`w:${startOfWeek(pickupDate)}`, Boolean(job) && startOfWeek(job!.pickup_date) === startOfWeek(pickupDate)) : null;
  const whole = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

  const active = people.filter((p) => p.is_active || p.user_id === d.driver_id);
  const drivers = active.filter((p) => p.role === "driver");
  const office = active.filter((p) => p.role !== "driver");
  const durationOptions = DURATIONS.some(([v]) => String(v) === duration) ? DURATIONS : [...DURATIONS, [asNum(duration), `${duration} min`] as [number, string]];

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}
      {d.linked_job_id ? <input type="hidden" name="linked_job_id" value={d.linked_job_id} /> : null}
      {/* kept as the driver reported it */}
      <input type="hidden" name="distance_km" value={d.distance_km ?? ""} />

      <div className="flex min-w-0 flex-col gap-4">
        <Section title="Trip">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Date" htmlFor="pickup_date">
              <input id="pickup_date" name="pickup_date" type="date" required value={pickupDate} onChange={(e) => setPickupDate(e.target.value)} className="field" />
            </Field>
            <Field label="Pickup time" htmlFor="pickup_time">
              <input id="pickup_time" name="pickup_time" type="time" required step={300} defaultValue={d.pickup_time} className="field" />
            </Field>
            <Field label="Driver busy for" htmlFor="duration_min" hint="Including the drive back">
              <select id="duration_min" name="duration_min" value={duration} onChange={(e) => setDuration(e.target.value)} className="field">
                {durationOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </Field>
            <Field label="Service" htmlFor="service_type">
              <select id="service_type" name="service_type" defaultValue={d.service_type ?? "airport"} className="field">
                {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pick up" htmlFor="pickup_address">
              <input id="pickup_address" name="pickup_address" required maxLength={300} list="places" defaultValue={d.pickup_address} className="field" autoComplete="off" />
            </Field>
            <Field label="Drop off" htmlFor="dropoff_address">
              <input id="dropoff_address" name="dropoff_address" required maxLength={300} list="places" defaultValue={d.dropoff_address} className="field" autoComplete="off" />
            </Field>
            <datalist id="places">{places.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="# of people" htmlFor="passengers">
              <input id="passengers" name="passengers" type="number" min={1} max={99} required defaultValue={d.passengers ?? 1} className="field" />
            </Field>
            <Field label="Bags" htmlFor="luggage">
              <input id="luggage" name="luggage" type="number" min={0} max={199} defaultValue={d.luggage ?? 0} className="field" />
            </Field>
            <div className="col-span-2">
              <Field label="Flight information" htmlFor="flight_no" hint="Flight number, or ship / wharf details">
                <input id="flight_no" name="flight_no" maxLength={60} defaultValue={d.flight_no ?? ""} className="field" placeholder="NZ175" />
              </Field>
            </div>
          </div>
          <label className="inline-flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" name="is_shared" defaultChecked={d.is_shared ?? false} className="size-4" />
            Shared ride (runs together with other bookings in the same vehicle)
          </label>
        </Section>

        <Section title="Customer">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="customer_name" hint={customers.length && !earlier ? "Start typing to pick a past customer" : undefined}>
              <input id="customer_name" name="customer_name" required maxLength={120} list="customers" value={name} onChange={(e) => onCustomer(e.target.value)} className="field" autoComplete="off" />
              <datalist id="customers">{[...new Set(customers.map((c) => c.name))].map((n) => <option key={n} value={n} />)}</datalist>
              {known && earlier > 0 ? (
                <p className="mt-1.5 rounded-lg bg-accent/15 px-2.5 py-1.5 text-sm font-semibold text-accent-text" aria-live="polite">
                  ★ Repeat customer: {earlier} earlier booking{earlier === 1 ? "" : "s"}
                  {known.last ? <span className="font-normal">, latest {fmtDate(known.last)}</span> : null}
                </p>
              ) : null}
            </Field>
            <Field label="Phone #" htmlFor="customer_phone">
              <input id="customer_phone" name="customer_phone" type="tel" maxLength={60} value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
            </Field>
            <Field label="Email" htmlFor="customer_email">
              <input id="customer_email" name="customer_email" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
            </Field>
            <Field label="Booked through" htmlFor="booking_source">
              <select id="booking_source" name="booking_source" defaultValue={d.booking_source ?? "whatsapp"} className="field">
                {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Booking reference" htmlFor="booking_ref" hint="Your own reference, if it has one">
              <input id="booking_ref" name="booking_ref" maxLength={60} defaultValue={d.booking_ref ?? ""} className="field" placeholder="TW-20260910-024" />
            </Field>
          </div>
          <Field label="More info for the driver" htmlFor="notes" hint="Name board at arrivals, child seat, second address…">
            <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={d.notes ?? ""} className="field" />
          </Field>
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Section title="Driver and vehicle">
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value as JobStatus)} className="field">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Driver" htmlFor="driver_id" hint="TBC puts it on the list of jobs to give out">
            <select id="driver_id" name="driver_id" value={driverId} onChange={(e) => setDriverId(e.target.value)} className="field">
              <option value="">TBC</option>
              <optgroup label="Drivers">
                {drivers.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
              </optgroup>
              {office.length ? (
                <optgroup label="Office">
                  {office.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name} ({ROLE_LABEL[p.role]})</option>)}
                </optgroup>
              ) : null}
            </select>
          </Field>
          <Field label="Vehicle" htmlFor="vehicle_id">
            <select id="vehicle_id" name="vehicle_id" defaultValue={d.vehicle_id ?? ""} className="field">
              <option value="">Not set</option>
              {vehicles.filter((v) => v.is_active || v.id === d.vehicle_id).map((v) => (
                <option key={v.id} value={v.id}>{v.name}{v.seats ? ` · ${v.seats} seats` : ""}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Charges and pay">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Charge (${currency})`} htmlFor="price">
              <input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="field text-lg font-semibold" placeholder="0" />
            </Field>
            <Field label="Driver pay" htmlFor="driver_pay">
              <input id="driver_pay" name="driver_pay" inputMode="decimal" value={driverPay} onChange={(e) => setDriverPay(e.target.value)} className="field text-lg" placeholder="0" />
              {suggestPay !== null && asNum(driverPay) !== suggestPay ? (
                <button type="button" onClick={() => setDriverPay(String(suggestPay))} className="mt-1 text-left text-xs font-semibold text-accent-text hover:underline">
                  Use {fmt(suggestPay)} ({driver!.display_name.split(" ")[0]}&rsquo;s hourly rate)
                </button>
              ) : null}
            </Field>
          </div>
          <dl className="flex items-baseline justify-between rounded-lg bg-surface-2 px-3 py-2.5 tabular" aria-live="polite">
            <dt className="text-sm font-semibold">{shareName}</dt>
            <dd className={`text-lg font-bold ${kept < 0 ? "text-bad" : ""}`}>
              {fmt(kept)}
              {charged > 0 ? <span className="ml-1.5 text-xs font-normal text-muted">{Math.round((kept / charged) * 100)}% of charge</span> : null}
            </dd>
          </dl>

          {month && week ? (
            <div className="rounded-lg border border-line px-3 py-2.5 text-sm tabular" aria-live="polite">
              <p>
                <b>{fmtMonth(pickupDate)}</b>: {month.before.bookings} booking{month.before.bookings === 1 ? "" : "s"}, {whole(month.before.total)} booked
                {counts ? <> &rarr; <b>{whole(month.after.total)}</b> with this one</> : null}
              </p>
              <p className="mt-1 text-muted">
                Week of {fmtShort(startOfWeek(pickupDate))}: {whole(week.after.total)}
                {weeklyTarget ? (
                  <> of {whole(weeklyTarget)} target ({Math.round((week.after.total / weeklyTarget) * 100)}%)</>
                ) : (
                  <>, {week.after.bookings} booking{week.after.bookings === 1 ? "" : "s"}</>
                )}
                {!counts ? " (enquiries and cancelled bookings don't count)" : ""}
              </p>
            </div>
          ) : null}

          <Field label="Payment" htmlFor="payment_status">
            <select id="payment_status" name="payment_status" value={payment} onChange={(e) => setPayment(e.target.value as PaymentStatus)} className="field">
              {PAYMENTS.map((p) => <option key={p} value={p}>{PAYMENT_LABEL[p]}</option>)}
            </select>
          </Field>
          {payment === "pay_on_day" ? (
            <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">The driver sees &ldquo;Collect {fmt(charged)}&rdquo; on this job and records cash or card when it&rsquo;s paid.</p>
          ) : null}
          {payment === "paid" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Paid by" htmlFor="payment_method">
                <select id="payment_method" name="payment_method" defaultValue={m?.payment_method ?? "online"} className="field">
                  {METHODS.map((x) => <option key={x} value={x}>{METHOD_LABEL[x]}</option>)}
                </select>
              </Field>
              <Field label="Paid on" htmlFor="paid_on">
                <input id="paid_on" name="paid_on" type="date" defaultValue={m?.paid_on ?? today} className="field" />
              </Field>
            </div>
          ) : null}

          <details className="rounded-lg border border-line px-3 py-2" open={extra > 0}>
            <summary className="cursor-pointer text-sm font-semibold text-muted">
              Other expenses (optional){extra > 0 ? `: ${fmt(extra)}, profit ${fmt(kept - extra)}` : ""}
            </summary>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <Field label="Fuel" htmlFor="fuel_cost">
                <input id="fuel_cost" name="fuel_cost" inputMode="decimal" value={fuel} onChange={(e) => setFuel(e.target.value)} className="field" placeholder="0" />
              </Field>
              <Field label="Tolls, parking" htmlFor="tolls_parking">
                <input id="tolls_parking" name="tolls_parking" inputMode="decimal" value={tolls} onChange={(e) => setTolls(e.target.value)} className="field" placeholder="0" />
              </Field>
              <Field label="Other" htmlFor="other_cost">
                <input id="other_cost" name="other_cost" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} className="field" placeholder="0" />
              </Field>
            </div>
          </details>
        </Section>

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg sm:bottom-4">
          {state && !state.ok ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{state.message}</p> : null}
          {!driverId ? <p className="text-xs text-muted">No driver chosen: this saves as {NO_DRIVER}.</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary flex-1">
              {pending ? <><Spinner /> Saving…</> : job ? "Save changes" : "Save booking"}
            </button>
            <Link href={job ? `/jobs/${job.id}` : "/jobs"} className="btn btn-quiet">Cancel</Link>
          </div>
        </div>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card flex min-w-0 flex-col gap-3 p-4">
      <legend className="sr-only">{title}</legend>
      <h2 aria-hidden="true" className="text-[15px] font-bold">{title}</h2>
      {children}
    </fieldset>
  );
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <label htmlFor={htmlFor} className="field-label">{label}</label>
      {children}
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );
}
