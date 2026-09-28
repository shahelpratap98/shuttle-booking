// Dry run of the spreadsheet importer against a real workbook, without a
// database: prints what each row would become.
//   npx tsx --conditions=react-server scripts/check-import.ts "path/to/Booking.xlsx"
import ExcelJS from "exceljs";
import { parseWorkbook } from "@/lib/import-sheet";
import { DEMO_PEOPLE } from "@/lib/store/demo-seed";

const file = process.argv[2];
if (!file) {
  console.error("Pass the .xlsx path");
  process.exit(1);
}
async function main() {
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(file);
const vehicles = [
  { id: "car", name: "Car", registration: null, seats: 4, cost_per_km: null, notes: null, is_active: true },
  { id: "van", name: "Van", registration: null, seats: 10, cost_per_km: null, notes: null, is_active: true },
];
const res = parseWorkbook(wb, { people: DEMO_PEOPLE, vehicles, today: "2026-09-28" });
console.log("tabs:", res.sheets.join(", "));
for (const b of res.bookings) {
  const i = b.input;
  const m = b.money;
  console.log(
    `${b.sheet} r${b.row} | ${i.pickup_date} ${i.pickup_time} | ${i.pickup_address} -> ${i.dropoff_address} | ${i.passengers}p | drv ${i.driver_id ?? "TBC"} | veh ${i.vehicle_id} | ${i.customer_name} | ${i.customer_phone} | ${i.customer_email ?? ""} | $${m.price} dp ${i.driver_pay} | ${m.payment_status}${m.payment_method ? "/" + m.payment_method : ""}${m.paid_on ? " " + m.paid_on : ""} | flight ${i.flight_no ?? ""} | ref ${i.booking_ref ?? ""} | ${i.booking_source} | ${i.service_type} ${i.duration_min}m${i.is_shared ? " SHARED" : ""} | notes: ${i.notes ?? ""}${b.warnings.length ? " | WARN: " + b.warnings.join("; ") : ""}`,
  );
}
console.log("skipped:", res.skipped);
}
main();
