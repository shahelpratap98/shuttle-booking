// Dry run of the spreadsheet importer against a real workbook, without a
// database: prints what each row would become, then a summary.
//   npx tsx --conditions=react-server scripts/check-import.ts "path/to/Booking.xlsx" [Driver,Names,…] [today]
// Pass the team's first names to see drivers matched as they would be live.
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/import-sheet";
import { DEMO_PEOPLE } from "@/lib/store/demo-seed";
import type { Profile, Vehicle } from "@/lib/types";

const [file, names, today = new Date().toISOString().slice(0, 10)] = process.argv.slice(2);
if (!file) {
  console.error("Pass the .xlsx path");
  process.exit(1);
}
async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const dates = { cof_due: null, rego_due: null, service_due: null };
  const vehicles: Vehicle[] = ["Car", "Van", "Wagon", "Hiace"].map((name, i) => ({ id: name.toLowerCase(), name, registration: null, seats: i ? 10 : 4, cost_per_km: null, notes: null, is_active: true, ...dates }));
  const people: Profile[] = names
    ? names.split(",").map((n, i) => ({ user_id: n.toLowerCase(), display_name: n, email: `${n}@x`, phone: null, role: "driver", colour: "#000000", pay_rate: null, is_active: true, ...(i < 0 ? {} : {}) }))
    : DEMO_PEOPLE;
  const res = parseWorkbook(wb, { people, vehicles, today });
  console.log("tabs:", res.sheets.join(", "));
  for (const b of res.bookings) {
    const i = b.input;
    const m = b.money;
    console.log(
      `${b.sheet} r${b.row} | ${i.pickup_date} ${i.pickup_time} | ${i.status} | ${i.pickup_address} -> ${i.dropoff_address} | ${i.passengers}p | drv ${i.driver_id ?? (i.operator ? "OP " + i.operator : "TBC")} | veh ${i.vehicle_id} | ${i.customer_name} | ${i.customer_phone} | ${i.customer_email ?? ""} | $${m.price} dp ${i.driver_pay} | ${m.payment_status}${m.payment_method ? "/" + m.payment_method : ""}${m.paid_on ? " " + m.paid_on : ""}${m.amount_paid ? " deposit " + m.amount_paid : ""}${m.invoice_no ? " " + m.invoice_no : ""}${m.bill_to ? " bill " + m.bill_to : ""} | flight ${i.flight_no ?? ""} | ref ${i.booking_ref ?? ""} booked ${i.booked_on ?? "?"} | ${i.booking_source} | ${i.service_type} ${i.duration_min}m${i.is_shared ? " SHARED" : ""}${b.settledOn ? " SETTLED" : ""} | notes: ${i.notes ?? ""}${b.warnings.length ? " | WARN: " + b.warnings.join("; ") : ""}`,
    );
  }
  const count = <T,>(f: (b: (typeof res.bookings)[number]) => T) => {
    const m = new Map<T, number>();
    for (const b of res.bookings) m.set(f(b), (m.get(f(b)) ?? 0) + 1);
    return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]));
  };
  console.log("\nSUMMARY", res.bookings.length, "bookings");
  console.log("payment:", count((b) => b.money.payment_status + (b.money.payment_method ? "/" + b.money.payment_method : "")));
  console.log("service:", count((b) => b.input.service_type));
  console.log("status:", count((b) => b.input.status));
  console.log("driver:", count((b) => (b.input.driver_id ? "named" : b.input.operator ? "operator" : "TBC")));
  console.log("booked_on known:", res.bookings.filter((b) => b.input.booked_on).length, "invoice no:", res.bookings.filter((b) => b.money.invoice_no).length, "deposits:", res.bookings.filter((b) => b.money.amount_paid).length, "settled:", res.bookings.filter((b) => b.settledOn).length);
  console.log("warnings:", count((b) => b.warnings.map((w) => w.replace(/"[^"]*"/g, '"…"')).join("; ") || "none"));
  console.log("skipped:", res.skipped);
}
main();
