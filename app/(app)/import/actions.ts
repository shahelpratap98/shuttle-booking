"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/components/action-form";
import { requireOffice } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import { bookingKey, parseWorkbook, type ParsedBooking } from "@/lib/import-sheet";
import { hit, waitMessage } from "@/lib/rate-limit";

export interface PreviewRow {
  sheet: string;
  row: number;
  date: string;
  time: string;
  pickup: string;
  dropoff: string;
  people: number;
  driver: string;
  vehicle: string;
  name: string;
  charge: number;
  driverPay: number;
  payment: string;
  ref: string;
  flight: string;
  shared: boolean;
  operator: string;
  bookedOn: string;
  duplicate: boolean;
  warnings: string[];
}

export type ImportState =
  | {
      ok: boolean;
      message: string;
      mode?: "check" | "import";
      sheets?: string[];
      rows?: PreviewRow[];
      skipped?: { sheet: string; row: number; reason: string }[];
      ready?: number;
      // names in the sheet that aren't set up in the app yet, with how many jobs use them
      setup?: { drivers: { name: string; jobs: number; upcoming: number }[]; vehicles: { name: string; jobs: number }[] };
      imported?: number;
      failed?: { sheet: string; row: number; error: string }[];
    }
  | undefined;

const MAX_BYTES = 5 * 1024 * 1024;
const PAYMENT_TEXT = { unpaid: "Not paid yet", pay_on_day: "Pay on the day", invoiced: "Invoiced", paid: "Paid" } as const;

export async function importBookings(_prev: ImportState, fd: FormData): Promise<ImportState> {
  const { viewer, store } = await requireOffice();
  const limit = hit(`import:${viewer.user_id}`, 30, 60 * 60);
  if (!limit.ok) return { ok: false, message: "That's a lot of imports. " + waitMessage(limit.retryAfter) };

  const file = fd.get("file");
  const mode = fd.get("mode") === "import" ? "import" : "check";
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose the booking spreadsheet (.xlsx) first." };
  if (file.size > MAX_BYTES) return { ok: false, message: "That file is over 5 MB. Save a copy with just the booking tabs and try again." };
  if (!/\.xlsx$/i.test(file.name)) return { ok: false, message: "Only Excel .xlsx files can be read. In Excel use File, Save As, Excel Workbook (.xlsx)." };

  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(await file.arrayBuffer());
  } catch (e) {
    console.error("[import] unreadable workbook", e);
    return { ok: false, message: "That file couldn't be opened as an Excel workbook. Is it password protected, or an older .xls file?" };
  }

  const [people, vehicles, settings] = await Promise.all([store.people(), store.vehicles(), store.settings()]);
  const today = todayIn(settings.timezone);
  const parsed = parseWorkbook(wb, { people, vehicles, today });
  if (!parsed.sheets.length) {
    return { ok: false, message: "No booking tab found. The app looks for a header row with Date, Pick up and Name." };
  }

  // Already in the system? (same day, time and customer)
  const dates = parsed.bookings.map((b) => b.input.pickup_date).sort();
  const existing = dates.length ? await store.jobs({ from: dates[0], to: dates[dates.length - 1] }) : [];
  const known = new Set(existing.map(bookingKey));
  // ...or listed twice in this file (the same trip copied onto two tabs).
  const seen = new Set<string>();
  const dupOf = new Set<ParsedBooking>();
  for (const b of parsed.bookings) {
    const k = bookingKey(b.input);
    if (known.has(k) || seen.has(k)) dupOf.add(b);
    seen.add(k);
  }
  const isDup = (b: ParsedBooking) => dupOf.has(b);

  const personName = new Map(people.map((p) => [p.user_id, p.display_name]));
  const vehicleName = new Map(vehicles.map((v) => [v.id, v.name]));
  const rows: PreviewRow[] = parsed.bookings.map((b) => ({
    sheet: b.sheet,
    row: b.row,
    date: b.input.pickup_date,
    time: b.input.pickup_time,
    pickup: b.input.pickup_address,
    dropoff: b.input.dropoff_address,
    people: b.input.passengers,
    driver: b.input.driver_id ? personName.get(b.input.driver_id) ?? "" : b.input.operator ? `${b.input.operator} (other operator)` : "TBC",
    vehicle: b.input.vehicle_id ? vehicleName.get(b.input.vehicle_id) ?? "" : "",
    name: b.input.customer_name,
    charge: b.money.price,
    driverPay: b.input.driver_pay,
    payment: PAYMENT_TEXT[b.money.payment_status] + (b.money.paid_on ? ` ${b.money.paid_on.split("-").reverse().join(".")}` : ""),
    ref: b.input.booking_ref ?? "",
    flight: b.input.flight_no ?? "",
    shared: b.input.is_shared,
    operator: b.input.operator ?? "",
    bookedOn: b.input.booked_on ?? "",
    duplicate: isDup(b),
    warnings: b.warnings,
  }));
  const fresh = parsed.bookings.filter((b) => !isDup(b));

  if (mode === "check") {
    const dupCount = rows.length - fresh.length;
    // What to set up first so the rows aren't flagged: drivers for the Team
    // page, vehicles for the Vehicles page (busiest first).
    const drivers = new Map<string, { name: string; jobs: number; upcoming: number }>();
    const vehicleNames = new Map<string, { name: string; jobs: number }>();
    for (const b of fresh) {
      for (const w of b.warnings) {
        const d = /^Driver "(.+)" isn't on the Team page/.exec(w)?.[1];
        if (d) {
          const e = drivers.get(d.toLowerCase()) ?? { name: d, jobs: 0, upcoming: 0 };
          e.jobs++;
          if (b.input.pickup_date >= today) e.upcoming++;
          drivers.set(d.toLowerCase(), e);
        }
        const v = /^Vehicle "(.+)" isn't on the Vehicles page/.exec(w)?.[1];
        if (v) {
          const e = vehicleNames.get(v.toLowerCase()) ?? { name: v, jobs: 0 };
          e.jobs++;
          vehicleNames.set(v.toLowerCase(), e);
        }
      }
    }
    const setup = {
      drivers: [...drivers.values()].sort((a, b) => b.upcoming - a.upcoming || b.jobs - a.jobs),
      vehicles: [...vehicleNames.values()].sort((a, b) => b.jobs - a.jobs),
    };
    return {
      ok: true,
      mode,
      sheets: parsed.sheets,
      rows,
      skipped: parsed.skipped,
      ready: fresh.length,
      setup,
      message:
        `Found ${rows.length} booking${rows.length === 1 ? "" : "s"} on ${parsed.sheets.join(", ")}.` +
        (dupCount ? ` ${dupCount} ${dupCount === 1 ? "is" : "are"} already in the app and will be skipped.` : "") +
        (fresh.length ? ` Check them below, then import.` : ""),
    };
  }

  // Import: outbound legs and single trips first (a few at a time, a big
  // workbook has 1,000+ rows), then return legs so they can link to them.
  const outIds = new Map<string, string>();
  const settled = new Map<string, string[]>(); // day -> job ids whose driver was already paid ("Paid Shef")
  const failed: { sheet: string; row: number; error: string }[] = [];
  let imported = 0;
  const save = async (b: ParsedBooking) => {
    const input = { ...b.input };
    if (b.leg === "ret" && b.refBase && outIds.has(b.refBase)) input.linked_job_id = outIds.get(b.refBase)!;
    const res = await store.saveJob(null, input, b.money);
    if (!res.ok) {
      failed.push({ sheet: b.sheet, row: b.row, error: res.error });
      return;
    }
    imported++;
    if (b.leg === "out" && b.refBase) outIds.set(b.refBase, res.data);
    if (b.settledOn) settled.set(b.settledOn, [...(settled.get(b.settledOn) ?? []), res.data]);
  };
  const inBatches = async (list: ParsedBooking[], size: number) => {
    for (let i = 0; i < list.length; i += size) await Promise.all(list.slice(i, i + size).map(save));
  };
  await inBatches(fresh.filter((b) => b.leg !== "ret"), 8);
  await inBatches(fresh.filter((b) => b.leg === "ret"), 8);
  for (const [day, ids] of settled) await store.settleDriverPay(ids, day);
  revalidatePath("/", "layout");
  return {
    ok: failed.length === 0,
    mode,
    imported,
    failed,
    message: `Imported ${imported} booking${imported === 1 ? "" : "s"}.${failed.length ? ` ${failed.length} couldn't be saved, see below.` : ""}`,
  };
}

// From the import check: add the vehicles the sheet names that aren't set up
// yet ("Wagon", "Hiace"), so their bookings get the right vehicle.
export async function addVehicles(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const { store } = await requireOffice();
  const names = fd.getAll("vehicle").map((v) => String(v).trim().slice(0, 60)).filter(Boolean);
  if (!names.length) return { ok: false, message: "Tick the vehicles to add." };
  const have = new Set((await store.vehicles()).map((v) => v.name.toLowerCase()));
  const seatsFor = (n: string) => (/van|hiace|bus/i.test(n) ? 10 : /wagon|suv/i.test(n) ? 6 : /car|sedan|camry/i.test(n) ? 4 : null);
  const added: string[] = [];
  for (const name of names) {
    if (have.has(name.toLowerCase())) continue;
    const res = await store.saveVehicle(null, { name, registration: null, seats: seatsFor(name), cost_per_km: null, notes: null, is_active: true, cof_due: null, rego_due: null, service_due: null });
    if (!res.ok) return { ok: false, message: `${name}: ${res.error}` };
    added.push(name);
  }
  revalidatePath("/vehicles");
  return {
    ok: true,
    message: added.length ? `Added ${added.join(", ")}. Check seats on the Vehicles page, then press Check the file again.` : "Those vehicles are already set up.",
  };
}
