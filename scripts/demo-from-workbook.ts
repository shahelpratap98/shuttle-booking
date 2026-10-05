// Fill demo mode with a real workbook, to try the app on real data without
// a database. Overwrites .demo-data/state.json (back it up first).
//   npx tsx --conditions=react-server scripts/demo-from-workbook.ts "path/Booking.xlsx" Shef,Ali,Mo
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { todayIn } from "@/lib/dates";
import { parseWorkbook } from "@/lib/import-sheet";
import { JOB_DEFAULTS, VEHICLE_DEFAULTS } from "@/lib/store/defaults";
import type { Job, Profile, Vehicle } from "@/lib/types";

const [file, names = ""] = process.argv.slice(2);
if (!file) {
  console.error("Pass the .xlsx path");
  process.exit(1);
}
const COLOURS = ["#15803d", "#be185d", "#c2410c", "#6d28d9", "#0e7490", "#a16207", "#b91c1c", "#4338ca", "#047857"];

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const today = todayIn("Pacific/Auckland");
  const owner: Profile = { user_id: "d0000001-0000-4000-8000-000000000001", display_name: "Owner", email: "owner@example.com", phone: null, role: "owner", colour: "#1d4ed8", pay_rate: null, is_active: true };
  const people: Profile[] = [
    owner,
    ...names.split(",").filter(Boolean).map((n, i) => ({ user_id: randomUUID(), display_name: n, email: "", phone: null, role: "driver" as const, colour: COLOURS[i % COLOURS.length], pay_rate: null, is_active: true })),
  ];
  const vehicles: Vehicle[] = ["Car", "Van", "Wagon", "Hiace"].map((name, i) => ({ id: randomUUID(), name, registration: null, seats: [4, 10, 6, 11][i], cost_per_km: null, notes: null, is_active: true, ...VEHICLE_DEFAULTS }));
  const res = parseWorkbook(wb, { people, vehicles, today });

  let jobNo = 1001;
  const outIds = new Map<string, string>();
  const jobs: Job[] = [];
  for (const b of res.bookings) {
    const id = randomUUID();
    const linked = b.leg === "ret" && b.refBase ? (outIds.get(b.refBase) ?? null) : null;
    jobs.push({
      ...JOB_DEFAULTS,
      ...b.input,
      booked_on: b.input.booked_on ?? null,
      linked_job_id: linked,
      id,
      job_no: jobNo++,
      collect_amount: b.money.payment_status === "pay_on_day" ? Math.max(b.money.price - b.money.amount_paid, 0) : 0,
      collected_via: null,
      driver_notes: null,
      driver_settled_on: b.settledOn,
      created_at: new Date().toISOString(),
      completed_at: b.input.status === "completed" ? new Date().toISOString() : null,
      money: { ...b.money },
    });
    if (b.leg === "out" && b.refBase) outIds.set(b.refBase, id);
    if (linked) jobs.find((j) => j.id === linked)!.linked_job_id = id;
  }
  const state = {
    settings: { business_name: "Trekway Shuttle", currency: "NZD", timezone: "Pacific/Auckland", gst_registered: true },
    profiles: people,
    vehicles,
    jobs,
    timeOff: [],
    nextJobNo: jobNo,
    leadDays: [],
    overheads: [],
    version: 6,
  };
  const out = join(process.cwd(), ".demo-data", "state.json");
  mkdirSync(join(process.cwd(), ".demo-data"), { recursive: true });
  writeFileSync(out, JSON.stringify(state));
  console.log(`Wrote ${jobs.length} bookings, ${people.length} people, ${vehicles.length} vehicles to ${out}`);
}
main();
