import { METHOD_LABEL, PAYMENT_LABEL } from "@/lib/constants";
import { fmtDate, fmtTime } from "@/lib/dates";
import { bookingRef, money } from "@/lib/format";
import type { Job, Profile, Vehicle } from "@/lib/types";

// The job card text, laid out like the booking sheet's Driver tab
// ("Date-…", "Pick up-…"). It carries what the driver needs, including their
// pay and anything to collect, but not the business's share.
export function jobCardText(j: Job, opts: { businessName: string; currency: string; driver?: Profile | null; vehicle?: Vehicle | null }): string {
  const cur = (n: number) => money(n, opts.currency, { cents: n % 1 !== 0 });
  const weekday = new Intl.DateTimeFormat("en-NZ", { weekday: "long", timeZone: "UTC" }).format(new Date(j.pickup_date + "T00:00:00Z"));

  let payment = "";
  if (j.collect_amount > 0 && !j.collected_via) payment = `Collect ${cur(j.collect_amount)} on the day`;
  else if (j.collected_via) payment = `Collected ${cur(j.collect_amount)} (${METHOD_LABEL[j.collected_via].toLowerCase()})`;
  else if (j.money?.payment_status === "paid") {
    const how = j.money.payment_method ? ` ${METHOD_LABEL[j.money.payment_method].toLowerCase()}` : "";
    const when = j.money.paid_on ? ` ${j.money.paid_on.split("-").reverse().join(".")}` : "";
    payment = `Paid${how}${when}`;
  } else if (j.money) payment = PAYMENT_LABEL[j.money.payment_status];

  const lines: [string, string | number | null | undefined][] = [
    ["Date", fmtDate(j.pickup_date)],
    ["Day", weekday],
    ["Pick up", j.pickup_address],
    ["Drop off", j.dropoff_address],
    ["Time", fmtTime(j.pickup_time)],
    ["# of People", j.passengers],
    ["Bags", j.luggage || null],
    ["Driver", opts.driver?.display_name ?? "TBC"],
    ["Vehicle", opts.vehicle?.name],
    ["Name", j.customer_name],
    ["Phone #", j.customer_phone],
    ["Total Charge", j.money ? cur(j.money.price) : null],
    ["Driver Pay", j.driver_pay ? cur(j.driver_pay) : null],
    ["Payment", payment || null],
    ["More Info", [j.is_shared ? "Shared ride" : "", j.notes ?? ""].filter(Boolean).join(". ") || null],
    ["Flight Information", j.flight_no],
    ["Booking Reference", bookingRef(j)],
  ];

  return [`${opts.businessName} Job Card`, ...lines.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => `${k}-${v}`)].join("\n");
}
