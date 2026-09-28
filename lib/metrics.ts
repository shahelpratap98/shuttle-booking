// Business numbers worked out from a list of jobs. Pure functions: the same
// code runs against the live database and the demo data.

import { BILLABLE } from "@/lib/constants";
import { addDays, addMonths, daysBetween, endOfMonth, fmtRange, minutesOf, startOfMonth, startOfWeek, weekdayIndex } from "@/lib/dates";
import { totalCost } from "@/lib/format";
import type { Job } from "@/lib/types";

export const PERIODS = {
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "4w": "Last 4 weeks",
  "12w": "Last 12 weeks",
} as const;
export type PeriodKey = keyof typeof PERIODS;

export interface Period {
  key: PeriodKey;
  from: string;
  to: string;
  label: string;
  // the same length of time just before, for comparisons
  prevFrom: string;
  prevTo: string;
}

export function periodFor(key: string | undefined, today: string): Period {
  const k: PeriodKey = key && key in PERIODS ? (key as PeriodKey) : "this-week";
  const week = startOfWeek(today);
  let from: string, to: string, prevFrom: string, prevTo: string;
  switch (k) {
    case "last-week":
      from = addDays(week, -7);
      to = addDays(week, -1);
      break;
    case "this-month":
      from = startOfMonth(today);
      to = endOfMonth(today);
      break;
    case "last-month":
      from = addMonths(today, -1);
      to = endOfMonth(from);
      break;
    case "4w":
      from = addDays(week, -21);
      to = addDays(week, 6);
      break;
    case "12w":
      from = addDays(week, -77);
      to = addDays(week, 6);
      break;
    default:
      from = week;
      to = addDays(week, 6);
  }
  if (k === "this-month" || k === "last-month") {
    prevFrom = addMonths(from, -1);
    prevTo = endOfMonth(prevFrom);
  } else {
    const len = daysBetween(from, to) + 1;
    prevFrom = addDays(from, -len);
    prevTo = addDays(from, -1);
  }
  return { key: k, from, to, label: fmtRange(from, to), prevFrom, prevTo };
}

const isBillable = (j: Job) => BILLABLE.includes(j.status);
const price = (j: Job) => j.money?.price ?? 0;

export interface Summary {
  booked: number; // confirmed + completed + no-show
  completed: number;
  upcoming: number; // confirmed, not done yet
  cancelled: number;
  noShow: number;
  enquiries: number;
  revenue: number;
  costs: number;
  profit: number;
  margin: number | null;
  avgValue: number | null;
  passengers: number;
  hours: number;
  km: number;
  paid: number;
  outstanding: number; // done but not paid yet (unpaid or invoiced)
  cancellationRate: number | null;
  avgLeadDays: number | null;
  costSplit: { driver: number; fuel: number; tolls: number; other: number };
}

export function summarise(jobs: Job[]): Summary {
  const billable = jobs.filter(isBillable);
  const revenue = sum(billable, price);
  const costs = sum(billable, (j) => totalCost(j.money));
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const leadDays = billable.map((j) => Math.max(0, daysBetween(j.created_at.slice(0, 10), j.pickup_date)));

  return {
    booked: billable.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    upcoming: jobs.filter((j) => j.status === "confirmed").length,
    cancelled,
    noShow: jobs.filter((j) => j.status === "no_show").length,
    enquiries: jobs.filter((j) => j.status === "enquiry").length,
    revenue,
    costs,
    profit: revenue - costs,
    margin: revenue > 0 ? (revenue - costs) / revenue : null,
    avgValue: billable.length ? revenue / billable.length : null,
    passengers: sum(billable, (j) => j.passengers),
    hours: sum(billable, (j) => j.duration_min) / 60,
    km: sum(billable, (j) => j.distance_km ?? 0),
    paid: sum(billable.filter((j) => j.money?.payment_status === "paid"), price),
    outstanding: sum(
      billable.filter((j) => j.status !== "confirmed" && j.money && j.money.payment_status !== "paid"),
      price,
    ),
    cancellationRate: billable.length + cancelled ? cancelled / (billable.length + cancelled) : null,
    avgLeadDays: leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null,
    costSplit: {
      driver: sum(billable, (j) => j.money?.driver_cost ?? 0),
      fuel: sum(billable, (j) => j.money?.fuel_cost ?? 0),
      tolls: sum(billable, (j) => j.money?.tolls_parking ?? 0),
      other: sum(billable, (j) => j.money?.other_cost ?? 0),
    },
  };
}

export interface WeekRow {
  start: string;
  completed: number;
  upcoming: number;
  lost: number; // cancelled + no-show
  revenue: number;
  costs: number;
  profit: number;
}

// One row per Monday-to-Sunday week, oldest first.
export function weekly(jobs: Job[], firstWeek: string, weeks: number): WeekRow[] {
  const rows: WeekRow[] = Array.from({ length: weeks }, (_, i) => ({
    start: addDays(firstWeek, i * 7),
    completed: 0,
    upcoming: 0,
    lost: 0,
    revenue: 0,
    costs: 0,
    profit: 0,
  }));
  for (const j of jobs) {
    const i = Math.floor(daysBetween(firstWeek, j.pickup_date) / 7);
    const row = rows[i];
    if (!row) continue;
    if (j.status === "completed") row.completed++;
    else if (j.status === "confirmed") row.upcoming++;
    else if (j.status === "cancelled" || j.status === "no_show") row.lost++;
    if (isBillable(j)) {
      row.revenue += price(j);
      row.costs += totalCost(j.money);
    }
  }
  for (const r of rows) r.profit = r.revenue - r.costs;
  return rows;
}

export interface GroupRow {
  key: string;
  jobs: number;
  revenue: number;
  costs: number;
  profit: number;
  passengers: number;
  hours: number;
  km: number;
}

// Billable jobs grouped by any key (service type, source, driver, vehicle…).
export function groupBy(jobs: Job[], keyOf: (j: Job) => string | null): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const j of jobs.filter(isBillable)) {
    const key = keyOf(j) ?? "";
    const row = map.get(key) ?? { key, jobs: 0, revenue: 0, costs: 0, profit: 0, passengers: 0, hours: 0, km: 0 };
    row.jobs++;
    row.revenue += price(j);
    row.costs += totalCost(j.money);
    row.passengers += j.passengers;
    row.hours += j.duration_min / 60;
    row.km += j.distance_km ?? 0;
    map.set(key, row);
  }
  for (const r of map.values()) r.profit = r.revenue - r.costs;
  return [...map.values()].sort((a, b) => b.jobs - a.jobs || b.revenue - a.revenue);
}

// Billable pickups by weekday (rows, Mon first) and hour of day (columns).
export function busyGrid(jobs: Job[]): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const j of jobs.filter(isBillable)) grid[weekdayIndex(j.pickup_date)][Math.floor(minutesOf(j.pickup_time) / 60)]++;
  return grid;
}

// Change from the previous period as a fraction, or null when there's nothing to compare.
export const change = (now: number, before: number) => (before > 0 ? (now - before) / before : null);

function sum<T>(items: T[], f: (x: T) => number): number {
  let s = 0;
  for (const x of items) s += f(x);
  return s;
}
