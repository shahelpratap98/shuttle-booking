import "server-only";
import type { Workbook, Worksheet, CellValue } from "exceljs";
import { isIsoDate } from "@/lib/dates";
import type { BookingSource, JobInput, JobMoney, PaymentMethod, Profile, ServiceType, Vehicle } from "@/lib/types";

// Reads the business's booking workbook: one tab per month, a header row of
//   Date | Day | Pick up | Drop off | Time | # of People | Driver | Vehicle |
//   Name | Phone # | Charges | Trekway Pay | Driver Pay | More Info |
//   Flight Information | Booking Reference
// and one booking per row. Rows with only a date (the blank days of the month)
// are ignored. Nothing is saved here; the caller decides.

export interface ParsedBooking {
  sheet: string;
  row: number;
  input: JobInput;
  money: JobMoney;
  // for linking -OUT / -RET legs after import
  refBase: string | null;
  leg: "out" | "ret" | null;
  warnings: string[];
}

export interface SkippedRow {
  sheet: string;
  row: number;
  reason: string;
}

export interface ParseResult {
  sheets: string[]; // tabs that had a booking header
  bookings: ParsedBooking[];
  skipped: SkippedRow[];
}

const MAX_ROWS = 5000;

type Col = "date" | "pickup" | "dropoff" | "time" | "people" | "driver" | "vehicle" | "name" | "phone" | "charges" | "driverPay" | "moreInfo" | "flight" | "ref" | "email";

// Header text -> field. Matched after lower-casing and dropping punctuation.
const HEADERS: [RegExp, Col][] = [
  [/^date$/, "date"],
  [/^pick ?up( address)?$/, "pickup"],
  [/^drop ?off( address)?$/, "dropoff"],
  [/^(pick ?up )?time$/, "time"],
  [/^(of |no of |number of )?(people|pax|passengers)$/, "people"],
  [/^driver$/, "driver"],
  [/^vehicle$/, "vehicle"],
  [/^(customer )?name$/, "name"],
  [/^phone( no| number)?$/, "phone"],
  [/^(total )?charges?$/, "charges"],
  [/^driver pay$/, "driverPay"],
  [/^more info(rmation)?$/, "moreInfo"],
  [/^flight( info(rmation)?)?$/, "flight"],
  [/^booking ref(erence)?$/, "ref"],
  [/^e ?mail$/, "email"],
];

const norm = (s: string) => s.toLowerCase().replace(/[#:. ]/g, " ").replace(/\s+/g, " ").trim();

// A cell's value as the spreadsheet shows it (formula results, rich text…).
function raw(v: CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date || typeof v !== "object") return v;
  if ("result" in v) return (v as { result?: unknown }).result ?? null;
  if ("richText" in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join("");
  if ("text" in v) return (v as { text: unknown }).text;
  if ("error" in v) return null;
  return null;
}

function text(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v.getTime()) ? "" : v.toISOString();
  return String(v).replace(/[ \t]/g, " ").replace(/\s+/g, " ").trim();
}

function dateOf(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 30000 && v < 80000) {
    // Excel serial date (days since 1899-12-30)
    return new Date(Date.UTC(1899, 11, 30) + v * 86_400_000).toISOString().slice(0, 10);
  }
  const s = text(v);
  if (isIsoDate(s.slice(0, 10))) return s.slice(0, 10);
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const iso = `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

// "06:30am", "1:30am", "8:30pm", "14:00", a time cell, or a day fraction.
function timeOf(v: unknown): string | null {
  const hm = (h: number, m: number) => (h >= 0 && h < 24 && m >= 0 && m < 60 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null);
  if (v instanceof Date && !isNaN(v.getTime())) return hm(v.getUTCHours(), v.getUTCMinutes());
  if (typeof v === "number" && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return hm(Math.floor(mins / 60) % 24, mins % 60);
  }
  const s = text(v).toLowerCase().replace(/\s+/g, "").replace(/\./g, ":");
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(s);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  if (m[3] === "pm" && h < 12) h += 12;
  if (m[3] === "am" && h === 12) h = 0;
  return hm(h, min);
}

function amountOf(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 100) / 100;
  const s = text(v).replace(/[$,\s]/g, "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const FLIGHT = /^[a-z]{2}\s?\d{1,4}[a-z]?$/i; // NZ175, QF 143, NZ0196, DL0065
const REF = /^(tw|tsm)[-\w]+$/i;

function paymentFrom(info: string): { status: JobMoney["payment_status"]; method: PaymentMethod | null; paidOn: string | null; recognised: boolean } {
  const s = info.toLowerCase();
  const d = /(\d{1,2})[./](\d{1,2})[./](\d{4})/.exec(info);
  const paidOn = d ? `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}` : null;
  const method: PaymentMethod | null = /online|website|stripe/.test(s) ? "online" : /bank|transfer|internet banking/.test(s) ? "bank" : /card|eftpos/.test(s) ? "card" : /cash/.test(s) ? "cash" : null;
  if (/pay(ing)? on (the )?day|on the day|pay driver/.test(s)) return { status: "pay_on_day", method: null, paidOn: null, recognised: true };
  if (/invoice/.test(s)) return { status: "invoiced", method: null, paidOn: null, recognised: true };
  if (/\bpaid\b/.test(s)) return { status: "paid", method, paidOn: paidOn && isIsoDate(paidOn) ? paidOn : null, recognised: true };
  if (/^cash$/.test(s.trim())) return { status: "pay_on_day", method: null, paidOn: null, recognised: true };
  return { status: "unpaid", method: null, paidOn: null, recognised: false };
}

function sourceFrom(s: string): BookingSource | null {
  const t = s.toLowerCase();
  if (/whats ?app|whatapp/.test(t)) return "whatsapp";
  if (/messenger|facebook/.test(t)) return "messenger";
  if (/text|sms|messgae|message/.test(t)) return "text";
  if (/e-?mail/.test(t)) return "email";
  if (/phone|call/.test(t)) return "phone";
  if (/website/.test(t)) return "website";
  if (/agent|partner/.test(t)) return "agent";
  return null;
}

// How long the driver is tied up, including the drive back, from where it's going.
function durationFor(a: string): number {
  const s = a.toLowerCase();
  if (/whole day|full day|day tour|tour|vessel|cruise/.test(s)) return 720;
  if (/rotorua|tauranga|taupo|mount maunganui|whakatane|okere/.test(s)) return 420;
  if (/waihi|thames|coromandel|hahei|whitianga|matamata|paeroa|tirau|putaruru|tokoroa/.test(s)) return 360;
  if (/cambridge|te awamutu|huntly|gordonton|ngaruawahia|raglan|morrinsville|hamilton|pukete|fitzroy/.test(s)) return 240;
  return 150;
}

function serviceFor(a: string): ServiceType {
  const s = a.toLowerCase();
  if (/cruise|vessel|ship|port|wharf|whaf/.test(s)) return "cruise";
  if (/tour/.test(s)) return "tour";
  if (/airport|international|domestic|akl/.test(s)) return "airport";
  return "transfer";
}

function findHeader(ws: Worksheet): { row: number; cols: Map<Col, number>; extra: number[] } | null {
  const last = Math.min(ws.rowCount, 150);
  for (let r = 1; r <= last; r++) {
    const cols = new Map<Col, number>();
    const row = ws.getRow(r);
    const width = Math.max(row.cellCount, 20);
    for (let c = 1; c <= width; c++) {
      const h = norm(text(raw(row.getCell(c).value)));
      if (!h) continue;
      const hit = HEADERS.find(([re]) => re.test(h));
      if (hit && !cols.has(hit[1])) cols.set(hit[1], c);
    }
    if (cols.has("date") && cols.has("pickup") && cols.has("name")) {
      const used = new Set(cols.values());
      const extra = Array.from({ length: width }, (_, i) => i + 1).filter((c) => !used.has(c));
      return { row: r, cols, extra };
    }
  }
  return null;
}

export function parseWorkbook(wb: Workbook, ctx: { people: Profile[]; vehicles: Vehicle[]; today: string }): ParseResult {
  const result: ParseResult = { sheets: [], bookings: [], skipped: [] };
  const people = ctx.people.filter((p) => p.is_active);

  const matchDriver = (name: string): Profile | null | undefined => {
    const n = name.toLowerCase().trim();
    if (!n || n === "tbc" || n === "tba" || n === "-" || n === "?") return null;
    return (
      people.find((p) => p.display_name.toLowerCase() === n) ??
      people.find((p) => p.display_name.toLowerCase().split(" ")[0] === n) ??
      people.find((p) => p.display_name.toLowerCase().startsWith(n)) ??
      undefined // named, but nobody by that name
    );
  };
  const matchVehicle = (name: string) => {
    const n = name.toLowerCase().trim();
    if (!n) return null;
    return ctx.vehicles.find((v) => v.name.toLowerCase() === n) ?? ctx.vehicles.find((v) => v.name.toLowerCase().includes(n) || n.includes(v.name.toLowerCase())) ?? undefined;
  };

  wb.eachSheet((ws) => {
    const header = findHeader(ws);
    if (!header) return;
    result.sheets.push(ws.name);
    const at = (row: ReturnType<Worksheet["getRow"]>, c: Col) => (header.cols.has(c) ? raw(row.getCell(header.cols.get(c)!).value) : null);
    const formulaOf = (row: ReturnType<Worksheet["getRow"]>, c: Col): string => {
      if (!header.cols.has(c)) return "";
      const v = row.getCell(header.cols.get(c)!).value as { formula?: string } | null;
      return v && typeof v === "object" && "formula" in v ? String(v.formula ?? "") : "";
    };

    for (let r = header.row + 1; r <= ws.rowCount && result.bookings.length < MAX_ROWS; r++) {
      const row = ws.getRow(r);
      const pickup = text(at(row, "pickup"));
      const dropoff = text(at(row, "dropoff"));
      const name = text(at(row, "name"));
      // The monthly tabs list every day; days with no booking only have a date.
      if (!pickup && !dropoff && !name) continue;

      const skip = (reason: string) => result.skipped.push({ sheet: ws.name, row: r, reason });
      const date = dateOf(at(row, "date"));
      if (!date) { skip("no date"); continue; }
      if (!name) { skip("no customer name"); continue; }
      if (!pickup || !dropoff) { skip("pick up or drop off is missing"); continue; }

      const warnings: string[] = [];
      const notes: string[] = [];

      const timeRaw = at(row, "time");
      let time = timeOf(timeRaw);
      if (!time) {
        time = "00:00";
        warnings.push(`Time "${text(timeRaw) || "blank"}" not understood; set to midnight, fix it after import`);
      }

      const peopleText = text(at(row, "people"));
      const parts = peopleText.match(/\d+/g)?.map(Number) ?? [];
      let passengers = parts.reduce((a, b) => a + b, 0);
      if (parts.length > 1) notes.push(`People: ${peopleText}`);
      if (!passengers) {
        passengers = 1;
        if (peopleText) warnings.push(`# of people "${peopleText}" not understood; set to 1`);
      }
      passengers = Math.min(99, passengers);

      const driverName = text(at(row, "driver"));
      const driver = matchDriver(driverName);
      if (driver === undefined) warnings.push(`Driver "${driverName}" isn't on the Team page, so it comes in as TBC`);

      const vehicleName = text(at(row, "vehicle"));
      const vehicle = matchVehicle(vehicleName);
      if (vehicle === undefined) warnings.push(`Vehicle "${vehicleName}" isn't on the Vehicles page; add it there and re-import, or set it after`);

      let phone = text(at(row, "phone")).replace(/^'+|'+$/g, "").replace(/\s*\/\s*'?/g, " / ");
      let email = text(at(row, "email"));
      if (EMAIL.test(phone)) {
        email ||= phone.match(EMAIL)![0];
        phone = "";
      }

      const price = amountOf(at(row, "charges"));
      if (price === null) warnings.push("No charge on this row");
      const driverPay = amountOf(at(row, "driverPay")) ?? 0;
      const chargeFormula = formulaOf(row, "charges");
      const shared = /\/\s*\d/.test(chargeFormula);
      if (shared) notes.push(`Charge split: ${chargeFormula.replace(/^=/, "")}`);

      // More Info: usually how it's being paid.
      const moreInfo = text(at(row, "moreInfo"));
      const pay = paymentFrom(moreInfo);
      const returnBooked = /return(ed)? booked/i;
      if (returnBooked.test(moreInfo)) notes.push("Return booked");
      else if (moreInfo && !pay.recognised) notes.push(moreInfo);

      // Flight Information: a flight number, or whatever else they wrote there.
      let flight: string | null = null;
      let ref: string | null = null;
      const flightText = text(at(row, "flight"));
      if (flightText) {
        if (FLIGHT.test(flightText)) flight = flightText.replace(/\s+/g, "").toUpperCase();
        else if (REF.test(flightText)) ref = flightText;
        else if (returnBooked.test(flightText)) {
          if (!notes.includes("Return booked")) notes.push("Return booked");
        } else notes.push(`Flight info: ${flightText}`);
      }

      // Booking Reference: their reference, how it came in, or the customer's email.
      let source: BookingSource = "other";
      const refText = text(at(row, "ref"));
      if (refText) {
        if (REF.test(refText)) {
          ref = refText;
          if (/^tw-/i.test(refText)) source = "website";
        } else if (EMAIL.test(refText)) {
          email ||= refText.match(EMAIL)![0];
          source = "email";
        } else {
          const s = sourceFrom(refText);
          if (s) source = s;
          else notes.push(refText);
        }
      }
      if (source === "other") source = sourceFrom(moreInfo) ?? (ref && /^tw-/i.test(ref) ? "website" : "other");

      // Any other filled-in column (the sheet sometimes has an email off to the side).
      for (const c of header.extra) {
        const v = text(raw(row.getCell(c).value));
        if (v && EMAIL.test(v) && !email) email = v.match(EMAIL)![0];
      }

      const leg = ref && /-out$/i.test(ref) ? "out" : ref && /-ret$/i.test(ref) ? "ret" : null;
      const where = `${pickup} ${dropoff}`;
      const past = date < ctx.today;

      result.bookings.push({
        sheet: ws.name,
        row: r,
        refBase: ref ? ref.replace(/-(out|ret)$/i, "") : null,
        leg,
        warnings,
        input: {
          booking_ref: ref ? ref.slice(0, 60) : null,
          status: past ? "completed" : "confirmed",
          service_type: serviceFor(where),
          pickup_date: date,
          pickup_time: time,
          duration_min: durationFor(where),
          pickup_address: pickup.slice(0, 300),
          dropoff_address: dropoff.slice(0, 300),
          passengers,
          luggage: 0,
          flight_no: flight,
          customer_name: name.slice(0, 120),
          customer_phone: phone.slice(0, 60) || null,
          customer_email: email ? email.slice(0, 120) : null,
          booking_source: source,
          driver_id: driver ? driver.user_id : null,
          vehicle_id: vehicle ? vehicle.id : null,
          linked_job_id: null,
          is_shared: shared,
          driver_pay: Math.min(driverPay, price ?? driverPay),
          notes: notes.join(". ").slice(0, 1000) || null,
          distance_km: null,
        },
        money: {
          price: price ?? 0,
          fuel_cost: 0,
          tolls_parking: 0,
          other_cost: 0,
          payment_status: pay.status,
          payment_method: pay.status === "paid" ? pay.method : null,
          paid_on: pay.status === "paid" ? pay.paidOn : null,
        },
      });
    }
  });

  // Outbound legs first, so a return can point at its outbound job.
  result.bookings.sort((a, b) => (a.input.pickup_date + a.input.pickup_time).localeCompare(b.input.pickup_date + b.input.pickup_time));
  return result;
}

// Same booking already in the system? Same day, time and customer.
export const bookingKey = (j: { pickup_date: string; pickup_time: string; customer_name: string }) =>
  `${j.pickup_date}|${j.pickup_time}|${j.customer_name.trim().toLowerCase()}`;
