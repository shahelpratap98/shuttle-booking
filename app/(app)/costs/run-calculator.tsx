"use client";

import { useState } from "react";

// What a regular run earns and costs (the "Build up JD" sums): vehicles ×
// trips a day × seats × price, against staff, fuel and marketing.
const WEEKS_PER_MONTH = 52 / 12;

export function RunCalculator({ currency }: { currency: string }) {
  const [v, setV] = useState({ vehicles: "2", trips: "2", seats: "6", price: "99", days: "7", hours: "10", rate: "30", fuel: "200", marketing: "1050" });
  const n = (k: keyof typeof v) => {
    const x = Number(v[k].replace(/[$,\s]/g, ""));
    return Number.isFinite(x) && x >= 0 ? x : 0;
  };
  const fmt = (x: number) => new Intl.NumberFormat("en-NZ", { style: "currency", currency, maximumFractionDigits: 0 }).format(x);

  const weekly = n("vehicles") * n("trips") * n("seats") * n("price") * n("days");
  const staffWeek = n("vehicles") * n("hours") * n("rate") * n("days");
  const fuelWeek = n("vehicles") * n("fuel") * n("days");
  const costWeek = staffWeek + fuelWeek + n("marketing");
  const month = (x: number) => x * WEEKS_PER_MONTH;

  const field = (k: keyof typeof v, label: string, hint?: string) => (
    <div>
      <label htmlFor={`calc-${k}`} className="field-label">{label}</label>
      <input id={`calc-${k}`} inputMode="decimal" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="field" />
      {hint ? <p className="field-hint">{hint}</p> : null}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {field("vehicles", "Vehicles")}
        {field("trips", "Trips a day, each")}
        {field("seats", "Seats filled a trip")}
        {field("price", `Price a seat (${currency})`)}
        {field("days", "Days a week")}
        {field("hours", "Driver hours a day, each")}
        {field("rate", "Driver pay an hour")}
        {field("fuel", "Fuel a day, each vehicle")}
        {field("marketing", "Marketing a week")}
      </div>
      <dl className="flex flex-col gap-1.5 rounded-lg bg-surface-2 p-4 text-sm tabular" aria-live="polite">
        <Row label="Takings a week" value={fmt(weekly)} />
        <Row label="Costs a week" value={`− ${fmt(costWeek)}`} />
        <div className="my-1 border-t border-line-2" />
        <Row label="Left a week" value={fmt(weekly - costWeek)} strong />
        <Row label="Takings a month" value={fmt(month(weekly))} />
        <Row label="Left a month" value={fmt(month(weekly - costWeek))} strong />
        <p className="mt-2 text-xs text-muted">A month is 52 ÷ 12 weeks. Costs: drivers {fmt(staffWeek)}, fuel {fmt(fuelWeek)}, marketing {fmt(n("marketing"))} a week.</p>
      </dl>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className={strong ? "font-semibold" : "text-muted"}>{label}</dt>
      <dd className={strong ? "font-bold" : ""}>{value}</dd>
    </div>
  );
}
