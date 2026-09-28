"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { saveJob } from "@/app/(app)/jobs/actions";
import { Spinner } from "@/components/spinner";
import { useFormAction } from "@/components/use-form-action";
import { PAYMENT_LABEL, PAYMENTS, ROLE_LABEL, SERVICE_LABEL, SERVICES, SOURCE_LABEL, SOURCES, STATUS_LABEL, STATUSES } from "@/lib/constants";
import type { Customer } from "@/lib/store/types";
import type { Job, Profile, Vehicle } from "@/lib/types";

type Defaults = Partial<Job> & { money?: Job["money"] };

const DURATIONS = [30, 45, 60, 75, 90, 120, 180, 240, 480];
const round2 = (n: number) => Math.round(n * 100) / 100;
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
}: {
  job?: Job; // editing
  defaults: Defaults;
  people: Profile[];
  vehicles: Vehicle[];
  customers: Customer[];
  places: string[];
  currency: string;
}) {
  const { state, pending, onSubmit, formRef } = useFormAction(saveJob);
  const d = defaults;
  const m = d.money;

  // The fields that feed the live sums are controlled; the rest aren't.
  const [duration, setDuration] = useState(String(d.duration_min ?? 60));
  const [driverId, setDriverId] = useState(d.driver_id ?? "");
  const [vehicleId, setVehicleId] = useState(d.vehicle_id ?? "");
  const [km, setKm] = useState(d.distance_km == null ? "" : String(d.distance_km));
  const [price, setPrice] = useState(m ? String(m.price) : "");
  const [driverCost, setDriverCost] = useState(m ? String(m.driver_cost) : "");
  const [fuel, setFuel] = useState(m ? String(m.fuel_cost) : "");
  const [tolls, setTolls] = useState(m ? String(m.tolls_parking) : "");
  const [other, setOther] = useState(m ? String(m.other_cost) : "");
  const [phone, setPhone] = useState(d.customer_phone ?? "");
  const [email, setEmail] = useState(d.customer_email ?? "");

  const fmt = (n: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency }).format(n);
  const driver = people.find((p) => p.user_id === driverId);
  const vehicle = vehicles.find((v) => v.id === vehicleId);
  const hours = asNum(duration) / 60;
  const suggestDriver = driver?.pay_rate ? round2(driver.pay_rate * hours) : null;
  const suggestFuel = vehicle?.cost_per_km && asNum(km) > 0 ? round2(vehicle.cost_per_km * asNum(km)) : null;

  const costs = asNum(driverCost) + asNum(fuel) + asNum(tolls) + asNum(other);
  const earned = asNum(price);
  const left = earned - costs;

  // Picking a known customer fills in their phone and email if those are empty.
  const onCustomer = (name: string) => {
    const c = customers.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    if (!c) return;
    if (!phone && c.phone) setPhone(c.phone);
    if (!email && c.email) setEmail(c.email);
  };

  const active = people.filter((p) => p.is_active || p.user_id === d.driver_id);
  const drivers = active.filter((p) => p.role === "driver");
  const office = active.filter((p) => p.role !== "driver");

  return (
    <form ref={formRef} onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
      {job ? <input type="hidden" name="id" value={job.id} /> : null}

      <div className="flex min-w-0 flex-col gap-4">
        <Section title="Trip">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Pickup date" htmlFor="pickup_date">
              <input id="pickup_date" name="pickup_date" type="date" required defaultValue={d.pickup_date} className="field" />
            </Field>
            <Field label="Pickup time" htmlFor="pickup_time">
              <input id="pickup_time" name="pickup_time" type="time" required step={300} defaultValue={d.pickup_time} className="field" />
            </Field>
            <Field label="Takes (minutes)" htmlFor="duration_min" hint="Blocks the driver's calendar">
              <input id="duration_min" name="duration_min" type="number" min={5} max={1440} step={5} list="durations" value={duration} onChange={(e) => setDuration(e.target.value)} className="field" />
              <datalist id="durations">{DURATIONS.map((x) => <option key={x} value={x} />)}</datalist>
            </Field>
            <Field label="Service" htmlFor="service_type">
              <select id="service_type" name="service_type" defaultValue={d.service_type ?? "airport"} className="field">
                {SERVICES.map((s) => <option key={s} value={s}>{SERVICE_LABEL[s]}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Pick up from" htmlFor="pickup_address">
              <input id="pickup_address" name="pickup_address" required maxLength={200} list="places" defaultValue={d.pickup_address} className="field" autoComplete="off" />
            </Field>
            <Field label="Drop off at" htmlFor="dropoff_address">
              <input id="dropoff_address" name="dropoff_address" required maxLength={200} list="places" defaultValue={d.dropoff_address} className="field" autoComplete="off" />
            </Field>
            <datalist id="places">{places.map((p) => <option key={p} value={p} />)}</datalist>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Passengers" htmlFor="passengers">
              <input id="passengers" name="passengers" type="number" min={1} max={99} required defaultValue={d.passengers ?? 1} className="field" />
            </Field>
            <Field label="Bags" htmlFor="luggage">
              <input id="luggage" name="luggage" type="number" min={0} max={199} defaultValue={d.luggage ?? 0} className="field" />
            </Field>
            <Field label="Distance (km)" htmlFor="distance_km" hint="One way, for fuel cost">
              <input id="distance_km" name="distance_km" type="number" min={0} max={5000} step={0.1} value={km} onChange={(e) => setKm(e.target.value)} className="field" />
            </Field>
            <Field label="Flight number" htmlFor="flight_no">
              <input id="flight_no" name="flight_no" maxLength={20} defaultValue={d.flight_no ?? ""} className="field uppercase" placeholder="NZ102" />
            </Field>
          </div>
        </Section>

        <Section title="Customer">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" htmlFor="customer_name" hint={customers.length ? "Start typing to pick a past customer" : undefined}>
              <input
                id="customer_name"
                name="customer_name"
                required
                maxLength={120}
                list="customers"
                defaultValue={d.customer_name}
                onChange={(e) => onCustomer(e.target.value)}
                className="field"
                autoComplete="off"
              />
              <datalist id="customers">{customers.map((c) => <option key={c.name} value={c.name} />)}</datalist>
            </Field>
            <Field label="Booked by" htmlFor="booking_source">
              <select id="booking_source" name="booking_source" defaultValue={d.booking_source ?? "phone"} className="field">
                {SOURCES.map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}
              </select>
            </Field>
            <Field label="Phone" htmlFor="customer_phone">
              <input id="customer_phone" name="customer_phone" type="tel" maxLength={40} value={phone} onChange={(e) => setPhone(e.target.value)} className="field" />
            </Field>
            <Field label="Email" htmlFor="customer_email">
              <input id="customer_email" name="customer_email" type="email" maxLength={120} value={email} onChange={(e) => setEmail(e.target.value)} className="field" />
            </Field>
          </div>
          <Field label="Notes for the driver" htmlFor="notes" hint="Child seat, meet at arrivals, gate code…">
            <textarea id="notes" name="notes" rows={3} maxLength={1000} defaultValue={d.notes ?? ""} className="field" />
          </Field>
        </Section>
      </div>

      <div className="flex min-w-0 flex-col gap-4">
        <Section title="Who's doing it">
          <Field label="Status" htmlFor="status">
            <select id="status" name="status" defaultValue={d.status ?? "confirmed"} className="field">
              {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
          </Field>
          <Field label="Driver" htmlFor="driver_id" hint="Leave empty to list it under Available jobs">
            <select id="driver_id" name="driver_id" value={driverId} onChange={(e) => setDriverId(e.target.value)} className="field">
              <option value="">No driver yet</option>
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
            <select id="vehicle_id" name="vehicle_id" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)} className="field">
              <option value="">Not set</option>
              {vehicles.filter((v) => v.is_active || v.id === d.vehicle_id).map((v) => (
                <option key={v.id} value={v.id}>{v.name}{v.seats ? ` · ${v.seats} seats` : ""}</option>
              ))}
            </select>
          </Field>
        </Section>

        <Section title="Price and costs">
          <Field label={`Price charged (${currency})`} htmlFor="price">
            <input id="price" name="price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className="field text-lg font-semibold" placeholder="0.00" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Driver pay" htmlFor="driver_cost">
              <input id="driver_cost" name="driver_cost" inputMode="decimal" value={driverCost} onChange={(e) => setDriverCost(e.target.value)} className="field" placeholder="0.00" />
              {suggestDriver !== null && asNum(driverCost) !== suggestDriver ? (
                <button type="button" onClick={() => setDriverCost(String(suggestDriver))} className="mt-1 text-left text-xs font-semibold text-accent-text hover:underline">
                  Use {fmt(suggestDriver)} ({driver!.display_name.split(" ")[0]}&rsquo;s rate × job time)
                </button>
              ) : null}
            </Field>
            <Field label="Fuel and running" htmlFor="fuel_cost">
              <input id="fuel_cost" name="fuel_cost" inputMode="decimal" value={fuel} onChange={(e) => setFuel(e.target.value)} className="field" placeholder="0.00" />
              {suggestFuel !== null && asNum(fuel) !== suggestFuel ? (
                <button type="button" onClick={() => setFuel(String(suggestFuel))} className="mt-1 text-left text-xs font-semibold text-accent-text hover:underline">
                  Use {fmt(suggestFuel)} (km × vehicle cost per km)
                </button>
              ) : null}
            </Field>
            <Field label="Tolls and parking" htmlFor="tolls_parking">
              <input id="tolls_parking" name="tolls_parking" inputMode="decimal" value={tolls} onChange={(e) => setTolls(e.target.value)} className="field" placeholder="0.00" />
            </Field>
            <Field label="Other costs" htmlFor="other_cost">
              <input id="other_cost" name="other_cost" inputMode="decimal" value={other} onChange={(e) => setOther(e.target.value)} className="field" placeholder="0.00" />
            </Field>
          </div>
          <dl className="grid grid-cols-3 gap-2 rounded-lg bg-surface-2 p-3 text-sm tabular" aria-live="polite">
            <div><dt className="text-xs text-muted">Costs</dt><dd className="font-semibold">{fmt(costs)}</dd></div>
            <div><dt className="text-xs text-muted">Profit</dt><dd className={`font-semibold ${left < 0 ? "text-bad" : "text-ok"}`}>{fmt(left)}</dd></div>
            <div><dt className="text-xs text-muted">Margin</dt><dd className="font-semibold">{earned > 0 ? `${Math.round((left / earned) * 100)}%` : "–"}</dd></div>
          </dl>
          <Field label="Payment" htmlFor="payment_status">
            <select id="payment_status" name="payment_status" defaultValue={m?.payment_status ?? "unpaid"} className="field">
              {PAYMENTS.map((p) => <option key={p} value={p}>{PAYMENT_LABEL[p]}</option>)}
            </select>
          </Field>
        </Section>

        <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 shadow-lg sm:bottom-4">
          {state && !state.ok ? <p role="alert" className="rounded-lg bg-bad-bg px-3 py-2 text-sm font-semibold text-bad">{state.message}</p> : null}
          <div className="flex gap-2">
            <button type="submit" disabled={pending} className="btn btn-primary flex-1">
              {pending ? <><Spinner /> Saving…</> : job ? "Save changes" : "Create job"}
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
