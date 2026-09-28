// Business numbers worked out from a list of jobs. Pure functions: the same
// code runs against the live database and the demo data.
//
// Money follows the booking sheet: Charges − Driver pay = the business's pay
// (the sheet's "Trekway Pay"). Optional running expenses (fuel, tolls,
// other) come off that to give profit.

import { BILLABLE } from "@/lib/constants";
import { addDays, addMonths, daysBetween, endOfMonth, fmtRange, minutesOf, startOfMonth, startOfWeek, weekdayIndex } from "@/lib/dates";
import { businessPay, charge, expenses } from "@/lib/format";
import type { Job } from "@/lib/types";

export const PERIODS = {
  "this-week": "This week",
  "next-4w": "Next 4 weeks",
  "this-month": "This month",
  "next-month": "Next month",
  "last-week": "Last week",
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
  let from: string, to: string;
  switch (k) {
    case "last-week":
      from = addDays(week, -7);
      to = addDays(week, -1);
      break;
    case "next-4w":
      from = today;
      to = addDays(today, 27);
      break;
    case "this-month":
      from = startOfMonth(today);
      to = endOfMonth(today);
      break;
    case "next-month":
      from = addMonths(today, 1);
      to = endOfMonth(from);
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
  let prevFrom: string, prevTo: string;
  if (k.includes("month")) {
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

export interface Summary {
  booked: number; // confirmed + completed + no-show
  completed: number;
  upcoming: number; // confirmed, not done yet
  cancelled: number;
  noShow: number;
  enquiries: number;
  charges: number;
  driverPay: number;
  businessPay: number; // charges − driver pay
  expenses: number;
  profit: number; // business pay − expenses
  share: number | null; // business pay as a share of charges
  avgCharge: number | null;
  passengers: number;
  hours: number;
  km: number;
  paid: number;
  toCollect: number; // pay-on-the-day charges not collected yet
  outstanding: number; // done but not paid yet
  cancellationRate: number | null;
  avgLeadDays: number | null;
  sharedTrips: number;
  returnTrips: number;
  costSplit: { fuel: number; tolls: number; other: number };
}

export function summarise(jobs: Job[]): Summary {
  const billable = jobs.filter(isBillable);
  const charges = sum(billable, charge);
  const driverPay = sum(billable, (j) => j.driver_pay);
  const exp = sum(billable, expenses);
  const cancelled = jobs.filter((j) => j.status === "cancelled").length;
  const leadDays = billable.map((j) => Math.max(0, daysBetween(j.created_at.slice(0, 10), j.pickup_date)));
  const notPaid = (j: Job) => j.money && j.money.payment_status !== "paid";

  return {
    booked: billable.length,
    completed: jobs.filter((j) => j.status === "completed").length,
    upcoming: jobs.filter((j) => j.status === "confirmed").length,
    cancelled,
    noShow: jobs.filter((j) => j.status === "no_show").length,
    enquiries: jobs.filter((j) => j.status === "enquiry").length,
    charges,
    driverPay,
    businessPay: charges - driverPay,
    expenses: exp,
    profit: charges - driverPay - exp,
    share: charges > 0 ? (charges - driverPay) / charges : null,
    avgCharge: billable.length ? charges / billable.length : null,
    passengers: sum(billable, (j) => j.passengers),
    hours: sum(billable, (j) => j.duration_min) / 60,
    km: sum(billable, (j) => j.distance_km ?? 0),
    paid: sum(billable.filter((j) => j.money?.payment_status === "paid"), charge),
    toCollect: sum(billable.filter((j) => j.money?.payment_status === "pay_on_day"), charge),
    outstanding: sum(billable.filter((j) => j.status !== "confirmed" && notPaid(j)), charge),
    cancellationRate: billable.length + cancelled ? cancelled / (billable.length + cancelled) : null,
    avgLeadDays: leadDays.length ? leadDays.reduce((a, b) => a + b, 0) / leadDays.length : null,
    sharedTrips: billable.filter((j) => j.is_shared).length,
    returnTrips: billable.filter((j) => j.linked_job_id).length,
    costSplit: {
      fuel: sum(billable, (j) => j.money?.fuel_cost ?? 0),
      tolls: sum(billable, (j) => j.money?.tolls_parking ?? 0),
      other: sum(billable, (j) => j.money?.other_cost ?? 0),
    },
  };
}

export interface BucketRow {
  start: string; // first day of the week or month
  bookings: number; // booked jobs (confirmed + completed + no-show)
  completed: number;
  upcoming: number;
  lost: number; // cancelled + no-show
  charges: number;
  driverPay: number;
  businessPay: number;
}

const emptyRow = (start: string): BucketRow => ({ start, bookings: 0, completed: 0, upcoming: 0, lost: 0, charges: 0, driverPay: 0, businessPay: 0 });

function addTo(row: BucketRow, j: Job) {
  if (j.status === "completed") row.completed++;
  else if (j.status === "confirmed") row.upcoming++;
  if (j.status === "cancelled" || j.status === "no_show") row.lost++;
  if (isBillable(j)) {
    row.bookings++;
    row.charges += charge(j);
    row.driverPay += j.driver_pay;
    row.businessPay += businessPay(j);
  }
}

// One row per Monday-to-Sunday week, oldest first.
export function weekly(jobs: Job[], firstWeek: string, weeks: number): BucketRow[] {
  const rows = Array.from({ length: weeks }, (_, i) => emptyRow(addDays(firstWeek, i * 7)));
  for (const j of jobs) {
    const row = rows[Math.floor(daysBetween(firstWeek, j.pickup_date) / 7)];
    if (row) addTo(row, j);
  }
  return rows;
}

// One row per calendar month, oldest first. firstMonth is any day in the first month.
export function monthly(jobs: Job[], firstMonth: string, months: number): BucketRow[] {
  const rows = Array.from({ length: months }, (_, i) => emptyRow(addMonths(firstMonth, i)));
  const index = new Map(rows.map((r, i) => [r.start.slice(0, 7), i]));
  for (const j of jobs) {
    const i = index.get(j.pickup_date.slice(0, 7));
    if (i !== undefined) addTo(rows[i], j);
  }
  return rows;
}

export interface GroupRow {
  key: string;
  jobs: number;
  charges: number;
  driverPay: number;
  businessPay: number;
  passengers: number;
  hours: number;
  km: number;
}

// Booked jobs grouped by any key (service type, source, driver, vehicle…).
export function groupBy(jobs: Job[], keyOf: (j: Job) => string | null): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const j of jobs.filter(isBillable)) {
    const key = keyOf(j) ?? "";
    const row = map.get(key) ?? { key, jobs: 0, charges: 0, driverPay: 0, businessPay: 0, passengers: 0, hours: 0, km: 0 };
    row.jobs++;
    row.charges += charge(j);
    row.driverPay += j.driver_pay;
    row.businessPay += businessPay(j);
    row.passengers += j.passengers;
    row.hours += j.duration_min / 60;
    row.km += j.distance_km ?? 0;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.jobs - a.jobs || b.charges - a.charges);
}

// Booked pickups by weekday (rows, Mon first) and hour of day (columns).
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
