import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PersonDot } from "@/components/chips";
import { NO_DRIVER, STATUS_LABEL, UNASSIGNED_COLOUR } from "@/lib/constants";
import { fmtDay, fmtTime } from "@/lib/dates";
import { bookingRef } from "@/lib/format";
import type { Job, Profile, TimeOff } from "@/lib/types";

// The calendar's job pills and the week board (drivers down the side, days
// across), shared by the Calendar and the Driver TBC page.

// How a job looks on the calendar. The driver's colour fills it; a job with no
// driver is an outline, an enquiry is striped, done jobs get a tick.
export function pillStyle(j: Job, colour: string | undefined): { className: string; style: CSSProperties } {
  if (!j.driver_id) {
    return { className: "border-2 border-dashed bg-surface text-text", style: { borderColor: UNASSIGNED_COLOUR } };
  }
  const c = colour ?? UNASSIGNED_COLOUR;
  if (j.status === "enquiry") {
    return {
      className: "border-2 text-text",
      style: { borderColor: c, background: `repeating-linear-gradient(135deg, color-mix(in srgb, ${c} 14%, var(--color-surface)) 0 6px, var(--color-surface) 6px 12px)` },
    };
  }
  return { className: `text-white ${j.status === "cancelled" || j.status === "no_show" ? "line-through opacity-60" : ""}`, style: { background: c } };
}

export function JobPill({ job, colour, children, className = "", style }: { job: Job; colour?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
  const p = pillStyle(job, colour);
  const tip = [
    `${bookingRef(job)} · ${fmtTime(job.pickup_time)} · ${job.customer_name} · ${job.passengers} pax`,
    `${job.pickup_address} → ${job.dropoff_address}`,
    job.status !== "confirmed" ? STATUS_LABEL[job.status] : "",
    job.collect_amount > 0 && !job.collected_via ? "$ Driver collects payment" : "",
    job.is_shared ? "Shared ride" : "",
  ]
    .filter(Boolean)
    .join("\n");
  return (
    <Link href={`/jobs/${job.id}`} title={tip} className={`block overflow-hidden rounded-md text-left hover:brightness-110 ${p.className} ${className}`} style={{ ...p.style, ...style }}>
      {children}
    </Link>
  );
}

export const Tick = ({ job }: { job: Job }) => (job.status === "completed" ? <span aria-label="done">✓ </span> : job.status === "enquiry" ? <span aria-label="enquiry">? </span> : null);

export function OffBlock({ t, compact }: { t: TimeOff; compact?: boolean }) {
  return (
    <div
      className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-muted"
      style={{ background: "repeating-linear-gradient(45deg, var(--color-surface-2) 0 5px, var(--color-bg) 5px 10px)" }}
      title={t.note ?? "Time off"}
    >
      Off{!compact && t.note ? `: ${t.note}` : ""}
    </div>
  );
}

export const isOff = (t: TimeOff, userId: string, d: string) => t.user_id === userId && t.starts_on <= d && t.ends_on >= d;
export const byTime = (a: Job, b: Job) => a.pickup_time.localeCompare(b.pickup_time);

// The dispatch board: drivers down the side, days across.
export function WeekBoard({
  days, lanes, showUnassigned, jobs, off, office, today, dayHref,
}: {
  days: string[]; lanes: Profile[]; showUnassigned: boolean; jobs: Job[]; off: TimeOff[]; office: boolean; today: string; dayHref: (d: string) => string;
}) {
  const rows: { id: string | null; name: string; colour: string }[] = [
    ...(showUnassigned ? [{ id: null, name: NO_DRIVER, colour: UNASSIGNED_COLOUR }] : []),
    ...lanes.map((p) => ({ id: p.user_id, name: p.display_name, colour: p.colour })),
  ];
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[980px] table-fixed border-collapse text-sm">
        <colgroup>
          <col className="w-36" />
          {days.map((d) => <col key={d} />)}
        </colgroup>
        <thead>
          <tr className="border-b border-line bg-surface-2">
            <th className="th sticky left-0 z-10 bg-surface-2">Driver</th>
            {days.map((d) => (
              <th key={d} scope="col" className={`px-2 py-2 text-left text-xs font-semibold ${d === today ? "text-accent-text" : "text-muted"}`}>
                <Link href={dayHref(d)} className="hover:underline">{fmtDay(d)}</Link>
                {d === today ? <span className="ml-1 rounded bg-accent px-1 text-[10px] text-[#1b1300]">TODAY</span> : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id ?? "none"} className="border-b border-line align-top last:border-0">
              <th scope="row" className="sticky left-0 z-10 bg-surface px-3 py-2 text-left font-semibold">
                <span className="flex items-center gap-2">
                  {r.id ? <PersonDot colour={r.colour} /> : <span aria-hidden="true" className="inline-block size-2.5 rounded-full border-2 border-dashed" style={{ borderColor: r.colour }} />}
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="mt-0.5 block text-xs font-normal text-muted">
                  {jobs.filter((j) => j.driver_id === r.id).length} jobs
                </span>
              </th>
              {days.map((d) => {
                const cell = jobs.filter((j) => j.driver_id === r.id && j.pickup_date === d).sort(byTime);
                const offToday = r.id ? off.find((t) => isOff(t, r.id!, d)) : undefined;
                return (
                  <td key={d} className={`group border-l border-line px-1.5 py-1.5 ${d === today ? "bg-accent/5" : ""}`}>
                    <div className="flex flex-col gap-1">
                      {offToday ? <OffBlock t={offToday} /> : null}
                      {cell.map((j) => (
                        <JobPill key={j.id} job={j} colour={r.colour} className="px-1.5 py-1 text-[12px] leading-tight">
                          <span className="block font-semibold tabular"><Tick job={j} />{fmtTime(j.pickup_time)} · {j.passengers}p{j.collect_amount > 0 && !j.collected_via ? " · $" : ""}{j.is_shared ? " · shared" : ""}</span>
                          <span className="block truncate opacity-90">{j.customer_name}</span>
                        </JobPill>
                      ))}
                      {office ? (
                        <Link
                          href={`/jobs/new?date=${d}${r.id ? `&driver=${r.id}` : ""}`}
                          className="rounded-md py-0.5 text-center text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-2 focus:opacity-100 print:hidden"
                          aria-label={`New job on ${fmtDay(d)}${r.id ? ` for ${r.name}` : ""}`}
                        >
                          + Add
                        </Link>
                      ) : null}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
