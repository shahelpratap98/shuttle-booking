import "server-only";
import type { Workbook, Worksheet, CellValue } from "exceljs";
import { isIsoDate } from "@/lib/dates";
import type { BookingSource, JobInput, JobMoney, JobStatus, PaymentMethod, Profile, ServiceType, Vehicle } from "@/lib/types";

// Reads the business's booking workbook: one tab per month, a header row of
//   Date | Day | Pick up | Drop off | Time | # of People | Driver | Vehicle |
//   Name | Phone # | Charges | Trekway Pay | Driver Pay | More Info |
//   Flight Information | Booking Reference
// and one booking per row. Older tabs (2025) have fewer columns: no Driver,
// Trekway Pay or Driver Pay, sometimes the driver's name under More Info.
// Rows with only a date (the blank days of the month) are ignored. Nothing is
// saved here; the caller decides.

export interface ParsedBooking {
  sheet: string;
  row: number;
  input: JobInput;
  money: JobMoney;
  // for linking -OUT / -RET legs after import
  refBase: string | null;
  leg: "out" | "ret" | null;
  settledOn: string | null; // "Paid Shef" beside the row: the driver has been paid for it
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

type Col =
  | "date" | "pickup" | "dropoff" | "time" | "people" | "driver" | "vehicle" | "name" | "phone"
  | "charges" | "trekwayPay" | "driverPay" | "moreInfo" | "flight" | "ref" | "email";

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
  [/^trekway pay$/, "trekwayPay"],
  [/^driver pay$/, "driverPay"],
  [/^more info(rmation)?$/, "moreInfo"],
  [/^flight( info(rmation)?)?$/, "flight"],
  [/^booking ref(erence)?$/, "ref"],
  [/^e ?mail$/, "email"],
];

const norm = (s: string) => s.toLowerCase().replace(/[#:. ]/g, " ").replace(/\s+/g, " ").trim();

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
  return String(v).replace(/[ \t]/g, " ").replace(/\s+/g, " ").trim();
}

function dateOf(v: unknown): string | null {
  // Excel shows an empty or broken date cell as a day in 1899/1900.
  if (v instanceof Date) return !isNaN(v.getTime()) && v.getUTCFullYear() >= 2000 ? v.toISOString().slice(0, 10) : null;
  if (typeof v === "number" && v > 36000 && v < 80000) {
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

// "06:30am", "1:30am", "8:30pm", "14:00", "Midnight", a time cell, or a day fraction.
function timeOf(v: unknown): string | null {
  const hm = (h: number, m: number) => (h >= 0 && h < 24 && m >= 0 && m < 60 ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}` : null);
  if (v instanceof Date && !isNaN(v.getTime())) return hm(v.getUTCHours(), v.getUTCMinutes());
  if (typeof v === "number" && v >= 0 && v < 1) {
    const mins = Math.round(v * 1440);
    return hm(Math.floor(mins / 60) % 24, mins % 60);
  }
  const s = text(v).toLowerCase().replace(/\s+/g, "").replace(/\./g, ":");
  if (s === "midnight") return "00:00";
  if (s === "noon" || s === "midday") return "12:00";
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
const REF_IN = /\b(?:tw|tsm|trek)[-\w]*\d[-\w]*/i; // TW-…, TSM-PS-…, Trek270826-001, inside other text too
// Outside companies the sheet hands jobs to ("Quick Shuttle", "Maxcare", "Abc Cars").
// A bare vehicle word ("Car", "Van") is never a company, even if that vehicle isn't set up.
const OPERATOR_WORDS = /shuttle|maxcare|transport|taxi|limo|coach|\S+ cars?\b/i;
const VEHICLE_WORD = /^(car|van|wagon|hiace|bus|suv|sedan|prius|camry)s?$/i;
const isOperator = (s: string) => OPERATOR_WORDS.test(s) && !VEHICLE_WORD.test(s.trim());

// When the booking was taken, from the reference: TW-17072026-0008
// (ddmmyyyy), TW-20260918-002 (yyyymmdd), TSM-PS-190826-0001 (ddmmyy).
function bookedFromRef(ref: string, pickup: string): string | null {
  const d = /(\d{6,8})/.exec(ref)?.[1];
  if (!d) return null;
  const candidates: string[] = [];
  if (d.length === 8) {
    candidates.push(`${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`); // ddmmyyyy
    candidates.push(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`); // yyyymmdd
  } else if (d.length === 6) {
    candidates.push(`20${d.slice(4, 6)}-${d.slice(2, 4)}-${d.slice(0, 2)}`); // ddmmyy
  }
  // A booking is taken on or before the trip, and not years before it.
  return candidates.find((c) => isIsoDate(c) && c <= pickup && c >= `${Number(pickup.slice(0, 4)) - 2}${pickup.slice(4)}`) ?? null;
}

interface Payment {
  status: JobMoney["payment_status"];
  method: PaymentMethod | null;
  paidOn: string | null;
  invoiceNo: string | null;
  amountPaid: number; // a deposit or part payment
  billTo: string | null;
  recognised: boolean;
}

// More Info (and sometimes the reference column): how the booking is paid.
// Past trips marked "pay on the day" or "cash" were paid to the driver.
function paymentFrom(info: string, ctx: { date: string; past: boolean; price: number }): Payment {
  const s = info.toLowerCase();
  const base: Payment = { status: "unpaid", method: null, paidOn: null, invoiceNo: null, amountPaid: 0, billTo: null, recognised: false };
  if (!s.trim()) return base;

  // dd.mm.yyyy, dd/mm/yyyy, or dd/mm with the year of the trip
  const d = /(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/.exec(info);
  let paidOn: string | null = null;
  if (d) {
    const y = d[3] ? (d[3].length === 2 ? `20${d[3]}` : d[3]) : ctx.date.slice(0, 4);
    const iso = `${y}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
    paidOn = isIsoDate(iso) ? iso : null;
  }
  const inv = /\binv(?:oice)?\b[\s#:-]*(?:inv[\s-]*)?0*(\d{1,5})\b/i.exec(info);
  const invoiceNo = inv ? `INV-${inv[1].padStart(4, "0")}` : null;
  const paidAmount = /\bpaid\s*\$?\s*(\d{2,6})(?![./\d])/i.exec(info);
  const method: PaymentMethod | null =
    /on ?line|website|stripe|internet/.test(s) ? "online"
    : /credit card|\bcc\b|card|eftpos/.test(s) ? "card"
    : /bank|transfer/.test(s) ? "bank"
    : /cash|paid to|given to/.test(s) ? "cash"
    : null;
  const out = (p: Partial<Payment>): Payment => ({ ...base, recognised: true, invoiceNo, ...p });

  if (/\bfoc\b|free of charge/.test(s)) return out({ status: "paid", paidOn: ctx.date });
  if (/paid direct|personal acc/.test(s)) return out({ status: "paid", method: "cash", paidOn: ctx.date });
  if (/maybe|to be paid|not paid|pay directly|custmer pay|customer pay/.test(s)) return out({ status: "unpaid" });

  // Invoices and account customers ("Charge Hotel", "On account").
  if (invoiceNo || /invoice|on ?account|\baccount\b|charge (hotel|on account)|paid on invoice/.test(s)) {
    const billTo = /charge hotel/.test(s) ? "Hotel" : null;
    if (/\bpaid\b/.test(s) && !/to be|not/.test(s)) return out({ status: "paid", method: method ?? "bank", paidOn: paidOn ?? null, billTo });
    return out({ status: "invoiced", billTo });
  }

  // A deposit: "Paid 3000" of a bigger charge.
  if (paidAmount && Number(paidAmount[1]) < ctx.price) return out({ status: "unpaid", amountPaid: Number(paidAmount[1]) });

  if (/\bpaid\b|payment online|online payment|^online$|on ?line payment|paid on ?line|already/.test(s)) {
    return out({ status: "paid", method: method ?? "online", paidOn });
  }
  if (/pay(ing)? on (the )?day|on the day|pay driver|\bcash\b|collect (cash|money)/.test(s)) {
    return ctx.past ? out({ status: "paid", method: "cash", paidOn: ctx.date }) : out({ status: "pay_on_day" });
  }
  return base;
}

function sourceFrom(s: string): BookingSource | null {
  const t = s.toLowerCase();
  if (/whats ?app|whatapp|whataspp|whatsup/.test(t)) return "whatsapp";
  if (/messenger|messager|facebook|business suite/.test(t)) return "messenger";
  if (/text|sms|messgae|message/.test(t)) return "text";
  if (/e-?mail/.test(t)) return "email";
  if (/phone|call/.test(t)) return "phone";
  if (/website|online booking|on line book/.test(t)) return "website";
  if (/return(ing)? customer|existing customer|look after/.test(t)) return "repeat";
  if (/agent|partner/.test(t)) return "agent";
  return null;
}

// How long the driver is tied up, including the drive back, from where it's going.
function durationFor(a: string): number {
  const s = a.toLowerCase();
  if (/whole day|full day|day tour|tour|vessel|cruise/.test(s)) return 720;
  if (/rotorua|tauranga|taupo|mount maunganui|whakatane|okere|papamoa|hobbiton|waitomo/.test(s)) return 420;
  if (/waihi|thames|coromandel|hahei|whitianga|matamata|paeroa|tirau|putaruru|tokoroa/.test(s)) return 360;
  if (/cambridge|te awamutu|huntly|gordonton|ngaruawahia|raglan|morrinsville|hamilton|pukete|fitzroy|tamahere/.test(s)) return 240;
  return 150;
}

function serviceFor(a: string): ServiceType {
  const s = a.toLowerCase();
  // "airport" contains "port", so look for the airport first.
  if (/airport|international|domestic|\bakl\b/.test(s)) return "airport";
  if (/cruise|vessel|\bship\b|\bport\b|wharf|whaf/.test(s)) return "cruise";
  if (/tour/.test(s)) return "tour";
  if (/school|college|academy/.test(s)) return "school";
  if (/wedding|event|golf/.test(s)) return "event";
  return "transfer";
}

// "500 to Quick Shuttle": given to another operator, for that much.
function operatorFrom(s: string): { name: string; cost: number } | null {
  const m = /\$?\s*(\d+(?:\.\d+)?)\s+to\s+([a-z][a-z ]*?(?:shuttle|maxcare|cars?|transport|taxi|limo|coach))\b/i.exec(s);
  return m ? { name: m[2].trim().replace(/\b\w/g, (c) => c.toUpperCase()), cost: Number(m[1]) } : null;
}

// "Driver $150.00", "$150 Driver", "Trekway to pay $280", "Pay 50% to Driver"
function driverPayFrom(s: string, price: number): number | null {
  const amt = /driver\s*\$\s*(\d+(?:\.\d+)?)|\$\s*(\d+(?:\.\d+)?)\s*driver|trekway to pay\s*\$?\s*(\d+(?:\.\d+)?)/i.exec(s);
  if (amt) return Number(amt[1] ?? amt[2] ?? amt[3]);
  const pct = /(\d{1,3})\s*%\s*to driver/i.exec(s);
  if (pct && price > 0) return Math.round(price * Number(pct[1])) / 100;
  return null;
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

  // "Shef", "shef", "Recommend Shef", "Mo-new" all mean Shef / Mo.
  const matchDriver = (name: string): Profile | null | undefined => {
    const n = name.toLowerCase().replace(/\brecommend(ed)?\b|-?\s*new$/g, "").trim();
    if (!n || n === "tbc" || n === "tba" || n === "-" || n === "?" || n === "driver") return null;
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
    const cell = (row: ReturnType<Worksheet["getRow"]>, c: Col) => (header.cols.has(c) ? row.getCell(header.cols.get(c)!).value : null);
    const at = (row: ReturnType<Worksheet["getRow"]>, c: Col) => raw(cell(row, c));
    const formulaOf = (row: ReturnType<Worksheet["getRow"]>, c: Col): string => {
      const v = cell(row, c) as { formula?: string; sharedFormula?: string } | null;
      return v && typeof v === "object" && ("formula" in v || "sharedFormula" in v) ? String(v.formula ?? v.sharedFormula ?? "") : "";
    };
    let lastDate: string | null = null;

    for (let r = header.row + 1; r <= ws.rowCount && result.bookings.length < MAX_ROWS; r++) {
      const row = ws.getRow(r);
      const pickup = text(at(row, "pickup"));
      const dropoff = text(at(row, "dropoff"));
      const name = text(at(row, "name"));
      let ownDate = dateOf(at(row, "date"));
      // "06 to 13 Tour": a day of the same month as the rows around it.
      const dayOnly = /^(\d{1,2})\b/.exec(text(at(row, "date")));
      if (!ownDate && dayOnly && lastDate && isIsoDate(`${lastDate.slice(0, 8)}${dayOnly[1].padStart(2, "0")}`)) {
        ownDate = `${lastDate.slice(0, 8)}${dayOnly[1].padStart(2, "0")}`;
      }
      if (ownDate) lastDate = ownDate;
      const amount = amountOf(at(row, "charges"));
      const previous = result.bookings[result.bookings.length - 1];
      // A cost typed under a booking as a negative amount ("-2650 Paid to
      // Sunny", "-3200 Paid $1600 to Quick Shuttle"): it's what that job cost us.
      if (!name && amount !== null && amount < 0 && previous?.sheet === ws.name && r - previous.row <= 3) {
        previous.input.driver_pay = Math.min(previous.money.price, Math.round((previous.input.driver_pay - amount) * 100) / 100);
        const what = [pickup, text(at(row, "moreInfo"))].filter(Boolean).join(", ");
        previous.input.notes = [previous.input.notes, `Cost ${-amount}${what ? ` (${what})` : ""}`].filter(Boolean).join(". ").slice(0, 1000);
        continue;
      }
      // The monthly tabs list every day; days with no booking only have a date.
      if (!pickup && !dropoff && !name) continue;
      // The header row repeated further down the tab.
      if (/^pick ?up$/i.test(pickup) && /^drop ?off$/i.test(dropoff)) continue;

      const skip = (reason: string) => result.skipped.push({ sheet: ws.name, row: r, reason });
      const warnings: string[] = [];
      const notes: string[] = [];

      // A second booking on the same day sometimes leaves the date blank.
      const date = ownDate ?? lastDate;
      if (!date) { skip("no date"); continue; }
      if (!ownDate) warnings.push("No date on this row; took the date from the row above");
      // A row with money on it is kept even when half filled in (a tour, the
      // second day of an event), so the month's totals match the sheet.
      const hasCharge = (amountOf(at(row, "charges")) ?? 0) > 0;
      if (!name && !hasCharge) { skip("no customer name"); continue; }
      if ((!pickup || !dropoff) && !hasCharge) { skip("pick up or drop off is missing"); continue; }
      if (!name) warnings.push("No customer name; add it after import");
      if (!pickup || !dropoff) warnings.push("Pick up or drop off is missing; fix it after import");
      if (/to \d{1,2}\b/i.test(text(at(row, "date")))) notes.push(`Dates: ${text(at(row, "date"))}`);
      const past = date < ctx.today;

      const timeRaw = at(row, "time");
      let time = timeOf(timeRaw);
      if (!time) {
        time = "00:00";
        warnings.push(`Time "${text(timeRaw) || "blank"}" not understood; set to midnight, fix it after import`);
      }

      const peopleText = text(at(row, "people"));
      const parts = peopleText.match(/\d+/g)?.map(Number) ?? [];
      let passengers = parts.reduce((a, b) => a + b, 0);
      if (parts.length > 1 || /[a-z]/i.test(peopleText.replace(/pax|people/gi, ""))) notes.push(`People: ${peopleText}`);
      if (!passengers) {
        passengers = 1;
        if (peopleText) warnings.push(`# of people "${peopleText}" not understood; set to 1`);
      }
      passengers = Math.min(99, passengers);

      let status: JobStatus = past ? "completed" : "confirmed";
      let operator: string | null = null;
      const driverName = text(at(row, "driver"));
      let driver = matchDriver(driverName);
      if (driver === undefined) {
        if (/cancel/i.test(driverName)) { status = "cancelled"; driver = null; }
        else if (isOperator(driverName)) { operator = driverName.slice(0, 80); driver = null; }
        else if (/invoice|account/i.test(driverName)) driver = null; // a payment note in the wrong column
        else if (/^(van|car|wagon|hiace|bus|suv)$/i.test(driverName)) driver = null; // a vehicle in the wrong column; read below
        else if (driverName.split(/\s+/).length > 2) {
          driver = null; // a note in the wrong column ("Need name display - old couple")
          notes.push(driverName);
        } else {
          warnings.push(`Driver "${driverName}" isn't on the Team page, so it comes in as TBC`);
          notes.push(`Driver: ${driverName}`); // keep who drove it, even without a login
        }
      }

      // A vehicle written in the Driver column counts when the Vehicle column is empty.
      const vehicleName = text(at(row, "vehicle")) || (/^(van|car|wagon|hiace|bus|suv)$/i.test(driverName) ? driverName : "");
      let vehicle = matchVehicle(vehicleName);
      if (vehicle === undefined && isOperator(vehicleName) && !driver) {
        operator = vehicleName.slice(0, 80); // "Quick Shuttle" written in the Vehicle column
        vehicle = null;
      }
      if (vehicle === undefined) warnings.push(`Vehicle "${vehicleName}" isn't on the Vehicles page; add it there and re-import, or set it after`);

      let phone = text(at(row, "phone")).replace(/^'+|'+$/g, "").replace(/\s*\/\s*'?/g, " / ");
      let email = text(at(row, "email"));
      if (EMAIL.test(phone)) {
        email ||= phone.match(EMAIL)![0];
        phone = "";
      }
      if (/^(tbc|-|n\/?a|none)$/i.test(phone)) phone = "";

      const price = amountOf(at(row, "charges"));
      if (price === null) warnings.push("No charge on this row");
      let driverPay = amountOf(at(row, "driverPay"));
      // A typed-in Trekway Pay that isn't charge − driver pay: the rest went to the driver.
      const trekway = amountOf(at(row, "trekwayPay"));
      if (trekway !== null && !formulaOf(row, "trekwayPay") && price !== null && (driverPay ?? 0) === 0 && trekway < price) {
        driverPay = Math.round((price - trekway) * 100) / 100;
      }
      const chargeFormula = formulaOf(row, "charges");
      const shared = /\/\s*\d/.test(chargeFormula);
      if (shared) notes.push(`Charge split: ${chargeFormula.replace(/^=/, "")}`);

      const moreInfo = text(at(row, "moreInfo"));
      const flightText = text(at(row, "flight"));
      const refText = text(at(row, "ref"));

      // Old tabs had no Driver column; the driver's name went under More Info.
      if (!header.cols.has("driver")) {
        const fromInfo = matchDriver(moreInfo.split(/[\s,-]+/)[0] ?? "");
        if (fromInfo) driver = fromInfo;
      }
      driverPay ??= driverPayFrom(`${moreInfo} ${refText} ${flightText}`, price ?? 0);
      if (/^cancel/i.test(moreInfo)) status = "cancelled";
      const op = operatorFrom(`${moreInfo} ${refText} ${flightText}`);
      if (op && !driver) {
        operator = op.name;
        if (!driverPay) driverPay = op.cost; // what we pay them
      }

      // More Info: usually how it's being paid.
      const pay = paymentFrom(moreInfo, { date, past, price: price ?? 0 });
      // Older tabs sometimes say how it was paid under Booking Reference or Flight Information.
      const payFromRef = pay.recognised ? null : paymentFrom(refText, { date, past, price: price ?? 0 });
      const payFromFlight = pay.recognised || payFromRef?.recognised ? null : paymentFrom(flightText, { date, past, price: price ?? 0 });
      const payment = payFromRef?.recognised ? payFromRef : payFromFlight?.recognised ? payFromFlight : pay;
      if (!pay.recognised && !payment.recognised && past && !header.cols.has("driverPay")) {
        // Old tabs: a finished trip with nothing said about money was paid on the day.
        Object.assign(payment, { status: "paid", method: "cash", paidOn: date });
      }
      const returnBooked = /return(ed)? booked/i;
      if (returnBooked.test(moreInfo)) notes.push("Return booked");
      else if (moreInfo && !pay.recognised && !(driver && !header.cols.has("driver"))) notes.push(moreInfo);
      else if (pay.recognised && /paid to|given to|cash ?- ?\w/i.test(moreInfo)) notes.push(moreInfo);

      // Flight Information: a flight number, or whatever else they wrote there.
      let flight: string | null = null;
      let ref: string | null = null;
      if (flightText) {
        if (FLIGHT.test(flightText)) flight = flightText.replace(/\s+/g, "").toUpperCase();
        else if (REF_IN.test(flightText) && !/\s/.test(flightText)) ref = flightText;
        else if (returnBooked.test(flightText)) {
          if (!notes.includes("Return booked")) notes.push("Return booked");
        } else notes.push(`Flight info: ${flightText}`);
      }

      // Booking Reference: their reference, how it came in, or the customer's email.
      let source: BookingSource = "other";
      if (refText) {
        const found = REF_IN.exec(refText)?.[0];
        if (found) {
          ref = found;
          if (/^tw-/i.test(found)) source = "website";
          const rest = refText.replace(found, "").replace(/booking ref:?|#/gi, "").trim();
          if (rest && !payFromRef?.recognised) notes.push(rest);
        } else if (EMAIL.test(refText)) {
          email ||= refText.match(EMAIL)![0];
          source = "email";
        } else if (/^cancel/i.test(refText)) {
          status = "cancelled";
        } else {
          const s = sourceFrom(refText);
          if (s) source = s;
          if (!payFromRef?.recognised && !(s && /^[a-z ]+$/i.test(refText) && refText.length < 30)) notes.push(refText);
        }
      }
      if (source === "other") source = sourceFrom(moreInfo) ?? (ref && /^tw-/i.test(ref) ? "website" : "other");

      // Any other filled-in column (the sheet sometimes has an email or "Paid Shef" off to the side).
      let settled: string | null = null;
      for (const c of header.extra) {
        const v = text(raw(row.getCell(c).value));
        if (!v) continue;
        if (EMAIL.test(v) && !email) email = v.match(EMAIL)![0];
        else if (/^paid\s+\w+/i.test(v) && past) settled = date; // "Paid Shef": the driver's been paid for it
      }

      const leg = ref && /-out$/i.test(ref) ? "out" : ref && /-ret$/i.test(ref) ? "ret" : null;
      const where = `${pickup} ${dropoff}`;
      const amountPaid = Math.min(payment.amountPaid, price ?? 0);

      result.bookings.push({
        sheet: ws.name,
        row: r,
        refBase: ref ? ref.replace(/-(out|ret)$/i, "") : null,
        leg,
        settledOn: settled,
        warnings,
        input: {
          booking_ref: ref ? ref.slice(0, 60) : null,
          status,
          service_type: serviceFor(where),
          pickup_date: date,
          pickup_time: time,
          duration_min: durationFor(where),
          pickup_address: (pickup || "Not given").slice(0, 300),
          dropoff_address: (dropoff || "Not given").slice(0, 300),
          passengers,
          luggage: 0,
          flight_no: flight,
          customer_name: (name || "No name").slice(0, 120),
          customer_phone: phone.slice(0, 60) || null,
          customer_email: email ? email.slice(0, 120) : null,
          booking_source: source,
          driver_id: driver ? driver.user_id : null,
          vehicle_id: vehicle ? vehicle.id : null,
          linked_job_id: null,
          is_shared: shared,
          driver_pay: Math.max(0, Math.min(driverPay ?? 0, price ?? driverPay ?? 0)),
          notes: notes.join(". ").slice(0, 1000) || null,
          distance_km: null,
          operator,
          children: 0,
          infants: 0,
          // when it was booked, if the reference says; otherwise not known
          booked_on: ref ? bookedFromRef(ref, date) : null,
        },
        money: {
          price: price ?? 0,
          fuel_cost: 0,
          tolls_parking: 0,
          other_cost: 0,
          payment_status: payment.status,
          payment_method: payment.status === "paid" ? payment.method : null,
          paid_on: payment.status === "paid" ? payment.paidOn : null,
          amount_paid: payment.status === "paid" ? 0 : amountPaid,
          invoice_no: payment.invoiceNo,
          bill_to: payment.billTo,
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
