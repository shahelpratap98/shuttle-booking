import Link from "next/link";
import { PaymentChip, PersonDot, RepeatChip } from "@/components/chips";
import { NO_DRIVER, STATUS_LABEL, UNASSIGNED_COLOUR } from "@/lib/constants";
import { fmtTime } from "@/lib/dates";
import { bookingRef, money } from "@/lib/format";
import type { Job, Profile } from "@/lib/types";

// The day's jobs, big and plain: time, who, where from and to, driver and
// vehicle, and what the driver collects. The first thing on the dashboard.
export function DayJobs({
  jobs, people, vehicleName, currency, repeats,
}: {
  jobs: Job[]; people: Map<string, Profile>; vehicleName: Map<string, string>; currency: string; repeats: Record<string, number>;
}) {
  if (jobs.length === 0) return <p className="rounded-xl border border-dashed border-line-2 px-4 py-6 text-center text-muted">No jobs on this day.</p>;
  return (
    <ul className="flex flex-col gap-2">
      {jobs.map((j) => {
        const driver = j.driver_id ? people.get(j.driver_id) : undefined;
        const gone = j.status === "cancelled" || j.status === "no_show";
        const collect = j.collect_amount > 0 && !j.collected_via;
        return (
          <li key={j.id}>
            <Link
              href={`/jobs/${j.id}`}
              className={`card flex flex-col gap-2 p-3 hover:border-line-2 hover:bg-surface-2 sm:flex-row sm:items-center sm:gap-4 sm:p-4 ${gone ? "opacity-60" : ""}`}
            >
              <span className="shrink-0 whitespace-nowrap text-2xl font-bold tabular sm:w-32 sm:text-[26px]">{fmtTime(j.pickup_time)}</span>
              <span className="min-w-0 flex-1">
                <span className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-semibold ${gone ? "line-through" : ""}`}>
                  {j.customer_name}
                  <span className="text-base font-normal text-muted">
                    {j.passengers} {j.passengers === 1 ? "person" : "people"}{j.luggage ? ` · ${j.luggage} bag${j.luggage === 1 ? "" : "s"}` : ""}
                  </span>
                  <RepeatChip earlier={repeats[j.id]} />
                  {j.status !== "confirmed" && j.status !== "completed" ? <span className="chip bg-surface-2 text-muted no-underline">{STATUS_LABEL[j.status]}</span> : null}
                </span>
                <span className="mt-0.5 block text-[15px]">
                  {j.pickup_address} <span className="text-muted">→</span> {j.dropoff_address}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                  <span className="font-semibold text-accent-text">{bookingRef(j)}</span>
                  {j.flight_no ? <span>Flight {j.flight_no}</span> : null}
                  {j.is_shared ? <span>Shared ride</span> : null}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2 sm:w-64 sm:flex-col sm:items-end">
                {driver ? (
                  <span className="inline-flex items-center gap-2 text-base font-semibold">
                    <PersonDot colour={driver.colour} className="size-3" />
                    {driver.display_name}
                    {j.vehicle_id ? <span className="font-normal text-muted">· {vehicleName.get(j.vehicle_id)}</span> : null}
                  </span>
                ) : j.operator ? (
                  <span className="text-base font-semibold">{j.operator}</span>
                ) : (
                  <span className="inline-flex items-center gap-2 rounded-full border-2 border-dashed px-2.5 py-0.5 text-sm font-bold text-bad" style={{ borderColor: UNASSIGNED_COLOUR }}>
                    {NO_DRIVER}
                  </span>
                )}
                {collect ? (
                  <span className="chip bg-info-bg text-info">Collect {money(j.collect_amount, currency)}</span>
                ) : j.money ? (
                  <PaymentChip status={j.money.payment_status} />
                ) : null}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
