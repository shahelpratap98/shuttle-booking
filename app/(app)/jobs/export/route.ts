import { NextResponse, type NextRequest } from "next/server";
import { isOffice } from "@/lib/auth";
import { METHOD_LABEL, PAYMENT_LABEL, SERVICE_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { fmtTime, isIsoDate } from "@/lib/dates";
import { businessPay, charge, expenses, jobRef } from "@/lib/format";
import { hit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";
import type { Job } from "@/lib/types";

// Bookings as a CSV that opens in Excel with the same columns, in the same
// order, as the monthly booking sheet, then a few extra columns after.
export async function GET(request: NextRequest) {
  const store = await getStore();
  const viewer = await store.viewer();
  if (!viewer || !viewer.is_active || !isOffice(viewer.role)) return new NextResponse("Not allowed", { status: 403 });
  if (!hit(`export:${viewer.user_id}`, 30, 300).ok) return new NextResponse("Too many downloads. Wait a few minutes.", { status: 429 });

  const sp = request.nextUrl.searchParams;
  const from = isIsoDate(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  const to = isIsoDate(sp.get("to") ?? "") ? sp.get("to")! : undefined;
  const [jobs, people, vehicles, settings] = await Promise.all([store.jobs({ from, to }), store.people(), store.vehicles(), store.settings()]);
  const name = new Map(people.map((p) => [p.user_id, p.display_name]));
  const vname = new Map(vehicles.map((v) => [v.id, v.name]));
  const firstWord = settings.business_name.trim().split(/\s+/)[0] || "Business";

  const header = [
    "Date", "Day", "Pick up", "Drop off", "Time", "# of People", "Driver", "Vehicle", "Name", "Phone #",
    "Charges", `${firstWord} Pay`, "Driver Pay", "More Info", "Flight Information", "Booking Reference",
    // extras
    "Status", "Email", "Booked through", "Service", "Payment", "Shared", "Bags", "Expenses", "Driver notes", "Job",
  ];
  const rows = jobs.map((j) => [
    j.pickup_date,
    new Intl.DateTimeFormat("en-NZ", { weekday: "long", timeZone: "UTC" }).format(new Date(j.pickup_date + "T00:00:00Z")),
    j.pickup_address,
    j.dropoff_address,
    fmtTime(j.pickup_time),
    j.passengers,
    j.driver_id ? name.get(j.driver_id) : "TBC",
    j.vehicle_id ? vname.get(j.vehicle_id) : "",
    j.customer_name,
    j.customer_phone,
    j.money ? charge(j) : "",
    j.money ? businessPay(j) : "",
    j.driver_pay,
    [paymentNote(j), j.notes].filter(Boolean).join(". "),
    j.flight_no,
    j.booking_ref,
    STATUS_LABEL[j.status],
    j.customer_email,
    SOURCE_LABEL[j.booking_source],
    SERVICE_LABEL[j.service_type],
    j.money ? PAYMENT_LABEL[j.money.payment_status] : "",
    j.is_shared ? "Yes" : "",
    j.luggage || "",
    j.money && expenses(j) ? expenses(j) : "",
    j.driver_notes,
    jobRef(j.job_no),
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const filename = `bookings${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  // BOM so Excel reads it as UTF-8.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

// "Paid online 16.08.2026", "Pay on the day", "Collected cash" – the way the sheet's More Info column reads.
function paymentNote(j: Job): string {
  const m = j.money;
  if (!m) return "";
  if (m.payment_status === "paid") {
    const how = j.collected_via ? `Collected ${j.collected_via}` : `Paid${m.payment_method ? ` ${METHOD_LABEL[m.payment_method].toLowerCase()}` : ""}`;
    return `${how}${m.paid_on ? ` ${m.paid_on.split("-").reverse().join(".")}` : ""}`;
  }
  return PAYMENT_LABEL[m.payment_status];
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps treating typed text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
