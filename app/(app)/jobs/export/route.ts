import { NextResponse, type NextRequest } from "next/server";
import { isOffice } from "@/lib/auth";
import { PAYMENT_LABEL, SERVICE_LABEL, SOURCE_LABEL, STATUS_LABEL } from "@/lib/constants";
import { isIsoDate } from "@/lib/dates";
import { jobRef, profit, totalCost } from "@/lib/format";
import { hit } from "@/lib/rate-limit";
import { getStore } from "@/lib/store";

// Jobs with their money as a spreadsheet-friendly CSV, for the accountant.
export async function GET(request: NextRequest) {
  const store = await getStore();
  const viewer = await store.viewer();
  if (!viewer || !viewer.is_active || !isOffice(viewer.role)) return new NextResponse("Not allowed", { status: 403 });
  if (!hit(`export:${viewer.user_id}`, 30, 300).ok) return new NextResponse("Too many downloads. Wait a few minutes.", { status: 429 });

  const sp = request.nextUrl.searchParams;
  const from = isIsoDate(sp.get("from") ?? "") ? sp.get("from")! : undefined;
  const to = isIsoDate(sp.get("to") ?? "") ? sp.get("to")! : undefined;
  const [jobs, people, vehicles] = await Promise.all([store.jobs({ from, to }), store.people(), store.vehicles()]);
  const name = new Map(people.map((p) => [p.user_id, p.display_name]));
  const vname = new Map(vehicles.map((v) => [v.id, v.name]));

  const header = [
    "Job", "Status", "Date", "Time", "Minutes", "Service", "Pickup", "Drop-off", "Passengers", "Bags", "Flight", "Km",
    "Customer", "Phone", "Email", "Booked by", "Driver", "Vehicle", "Price", "Driver pay", "Fuel & running",
    "Tolls & parking", "Other costs", "Total costs", "Profit", "Payment", "Notes", "Driver notes",
  ];
  const rows = jobs.map((j) => [
    jobRef(j.job_no), STATUS_LABEL[j.status], j.pickup_date, j.pickup_time, j.duration_min, SERVICE_LABEL[j.service_type],
    j.pickup_address, j.dropoff_address, j.passengers, j.luggage, j.flight_no, j.distance_km,
    j.customer_name, j.customer_phone, j.customer_email, SOURCE_LABEL[j.booking_source],
    j.driver_id ? name.get(j.driver_id) : "", j.vehicle_id ? vname.get(j.vehicle_id) : "",
    j.money?.price, j.money?.driver_cost, j.money?.fuel_cost, j.money?.tolls_parking, j.money?.other_cost,
    j.money ? totalCost(j.money).toFixed(2) : "", j.money ? profit(j.money).toFixed(2) : "",
    j.money ? PAYMENT_LABEL[j.money.payment_status] : "", j.notes, j.driver_notes,
  ]);

  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const filename = `jobs${from ? `-${from}` : ""}${to ? `-to-${to}` : ""}.csv`;
  // BOM so Excel reads it as UTF-8.
  return new NextResponse("﻿" + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function cell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = String(v);
  // Stop spreadsheet apps treating typed text as a formula.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
