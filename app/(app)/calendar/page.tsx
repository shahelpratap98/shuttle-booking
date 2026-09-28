import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { PersonDot } from "@/components/chips";
import { isOffice, requireViewer } from "@/lib/auth";
import { NO_DRIVER, UNASSIGNED_COLOUR, STATUS_LABEL } from "@/lib/constants";
import {
  addDays, addMonths, eachDay, fmtDay, fmtLong, fmtMonth, fmtRange, fmtTime, isIsoDate, minutesOf, nowTimeIn, startOfMonth, startOfWeek, timeFromMinutes, todayIn, WEEKDAYS,
} from "@/lib/dates";
import { bookingRef } from "@/lib/format";
import type { Job, Profile, TimeOff } from "@/lib/types";

export const metadata: Metadata = { title: "Calendar" };

// A shared, colour-coded team calendar (like Teamup): every person has a
// colour, and three views answer the owner's questions:
//   Day   – a timeline per driver: who is free at 3 pm?
//   Week  – the dispatch board: drivers down the side, days across.
//   Month – the big picture, one colour per driver.

type View = "day" | "week" | "month";
const VIEWS: Record<View, string> = { day: "Day", week: "Week", month: "Month" };
const NONE = "none"; // the "driver TBC" lane

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { viewer, store } = await requireViewer();
  const q = await searchParams;
  const s = (k: string) => (typeof q[k] === "string" ? (q[k] as string) : "");
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const office = isOffice(viewer.role);

  const view: View = s("view") in VIEWS ? (s("view") as View) : "week";
  const date = isIsoDate(s("date")) ? s("date") : today;
  const hidden = new Set(s("hide").split(",").filter(Boolean));
  const showCancelled = s("cancelled") === "1";

  let from: string, to: string, prev: string, next: string, title: string;
  if (view === "day") {
    from = to = date;
    prev = addDays(date, -1);
    next = addDays(date, 1);
    title = fmtLong(date);
  } else if (view === "week") {
    from = startOfWeek(date);
    to = addDays(from, 6);
    prev = addDays(from, -7);
    next = addDays(from, 7);
    title = fmtRange(from, to);
  } else {
    from = startOfWeek(startOfMonth(date));
    to = addDays(from, 41);
    prev = addMonths(date, -1);
    next = addMonths(date, 1);
    title = fmtMonth(date);
  }

  const [allJobs, people, timeOff] = await Promise.all([store.jobs({ from, to }), store.people(), store.timeOff(from, to)]);

  // Lanes: active people who drive or have jobs here, plus "no driver yet" for the office.
  const withJobs = new Set(allJobs.map((j) => j.driver_id));
  const lanes: Profile[] = people
    .filter((p) => p.role === "driver" ? p.is_active || withJobs.has(p.user_id) : withJobs.has(p.user_id))
    .sort((a, b) => Number(a.role !== "driver") - Number(b.role !== "driver") || a.display_name.localeCompare(b.display_name));
  if (!office && !lanes.some((p) => p.user_id === viewer.user_id)) lanes.push(viewer);

  const visibleLane = (id: string | null) => !hidden.has(id ?? NONE);
  const jobs = allJobs.filter((j) => (showCancelled || (j.status !== "cancelled" && j.status !== "no_show")) && visibleLane(j.driver_id));
  const off = timeOff.filter((t) => visibleLane(t.user_id));
  const colourOf = new Map(people.map((p) => [p.user_id, p.colour]));
  const nameOf = new Map(people.map((p) => [p.user_id, p.display_name]));

  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, date, ...(hidden.size ? { hide: [...hidden].join(",") } : {}), ...(showCancelled ? { cancelled: "1" } : {}), ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/calendar?${p}`;
  };
  const toggle = (id: string) => {
    const h = new Set(hidden);
    if (h.has(id)) h.delete(id);
    else h.add(id);
    return href({ hide: [...h].join(",") });
  };

  const unassignedCount = allJobs.filter((j) => !j.driver_id && (j.status === "confirmed" || j.status === "enquiry")).length;
  const shownLanes = lanes.filter((p) => visibleLane(p.user_id));

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold sm:text-[28px]">{title}</h1>
        <div className="flex items-center gap-1 print:hidden">
          <Link href={href({ date: prev })} className="btn btn-quiet btn-sm" aria-label="Previous">‹</Link>
          <Link href={href({ date: today })} className="btn btn-quiet btn-sm">Today</Link>
          <Link href={href({ date: next })} className="btn btn-quiet btn-sm" aria-label="Next">›</Link>
        </div>
        <nav aria-label="Calendar view" className="flex rounded-lg border border-line bg-surface p-0.5 print:hidden">
          {(Object.keys(VIEWS) as View[]).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={v === view ? "page" : undefined}
              className={`rounded-md px-3 py-1 text-sm font-semibold ${v === view ? "bg-ink text-on-ink" : "text-muted hover:text-text"}`}
            >
              {VIEWS[v]}
            </Link>
          ))}
        </nav>
        {office ? <Link href={`/jobs/new?date=${view === "day" ? date : from > today ? from : today}`} className="btn btn-accent btn-sm print:hidden">New job</Link> : null}
      </div>

      {/* sub-calendars: tap a person to hide or show them */}
      {office ? (
        <div className="mb-4 flex flex-wrap items-center gap-1.5 print:hidden" aria-label="Show or hide people">
          {lanes.map((p) => (
            <FilterChip key={p.user_id} href={toggle(p.user_id)} on={visibleLane(p.user_id)} colour={p.colour} label={p.display_name} />
          ))}
          <FilterChip href={toggle(NONE)} on={visibleLane(null)} colour={UNASSIGNED_COLOUR} label={`${NO_DRIVER}${unassignedCount ? ` (${unassignedCount})` : ""}`} dashed />
          <Link href={href({ cancelled: showCancelled ? "" : "1" })} className="ml-1 text-sm font-semibold text-muted underline-offset-4 hover:text-text hover:underline">
            {showCancelled ? "Hide cancelled" : "Show cancelled"}
          </Link>
        </div>
      ) : null}

      {view === "day" ? (
        <DayTimeline date={date} lanes={shownLanes} showUnassigned={office && visibleLane(null)} jobs={jobs} off={off} office={office} today={today} now={nowTimeIn(settings.timezone)} />
      ) : view === "week" ? (
        <WeekBoard days={eachDay(from, to)} lanes={shownLanes} showUnassigned={office && visibleLane(null)} jobs={jobs} off={off} office={office} today={today} dayHref={(d) => href({ view: "day", date: d })} />
      ) : (
        <MonthGrid
          days={eachDay(from, to)}
          month={date.slice(0, 7)}
          jobs={jobs}
          off={off}
          office={office}
          today={today}
          colourOf={colourOf}
          nameOf={nameOf}
          dayHref={(d) => href({ view: "day", date: d })}
        />
      )}

      <Key />
    </>
  );
}

// ------------------------------------------------------------------ pieces

function FilterChip({ href, on, colour, label, dashed }: { href: string; on: boolean; colour: string; label: string; dashed?: boolean }) {
  return (
    <Link
      href={href}
      aria-pressed={on}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold transition-colors ${
        on ? "border-line-2 bg-surface text-text" : "border-transparent bg-surface-2 text-muted line-through"
      }`}
    >
      <span
        aria-hidden="true"
        className={`inline-block size-3 rounded-full ${dashed ? "border-2 border-dashed" : ""}`}
        style={dashed ? { borderColor: colour } : { background: on ? colour : "transparent", boxShadow: on ? undefined : `inset 0 0 0 2px ${colour}` }}
      />
      {label}
    </Link>
  );
}

// How a job looks on the calendar. The driver's colour fills it; a job with no
// driver is an outline, an enquiry is striped, done jobs get a tick.
function pillStyle(j: Job, colour: string | undefined): { className: string; style: CSSProperties } {
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

function JobPill({ job, colour, children, className = "", style }: { job: Job; colour?: string; children: ReactNode; className?: string; style?: CSSProperties }) {
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

const Tick = ({ job }: { job: Job }) => (job.status === "completed" ? <span aria-label="done">✓ </span> : job.status === "enquiry" ? <span aria-label="enquiry">? </span> : null);

function OffBlock({ t, compact }: { t: TimeOff; compact?: boolean }) {
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

const isOff = (t: TimeOff, userId: string, d: string) => t.user_id === userId && t.starts_on <= d && t.ends_on >= d;
const byTime = (a: Job, b: Job) => a.pickup_time.localeCompare(b.pickup_time);

// ------------------------------------------------------------------ week board

function WeekBoard({
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

// ------------------------------------------------------------------ day timeline

function DayTimeline({
  date, lanes, showUnassigned, jobs, off, office, today, now,
}: {
  date: string; lanes: Profile[]; showUnassigned: boolean; jobs: Job[]; off: TimeOff[]; office: boolean; today: string; now: string;
}) {
  const dayJobs = jobs.filter((j) => j.pickup_date === date).sort(byTime);
  // Show 5 am – 11 pm, stretched to fit any earlier or later jobs.
  const first = Math.min(5 * 60, ...dayJobs.map((j) => minutesOf(j.pickup_time)));
  const last = Math.max(23 * 60, ...dayJobs.map((j) => minutesOf(j.pickup_time) + j.duration_min));
  const start = Math.floor(first / 60) * 60;
  const end = Math.min(24 * 60 + 6 * 60, Math.ceil(last / 60) * 60);
  const span = end - start;
  const hours = Array.from({ length: span / 60 + 1 }, (_, i) => start + i * 60);
  const pos = (min: number) => `${((min - start) / span) * 100}%`;

  const rows: { id: string | null; name: string; colour: string }[] = [
    ...(showUnassigned ? [{ id: null, name: NO_DRIVER, colour: UNASSIGNED_COLOUR }] : []),
    ...lanes.map((p) => ({ id: p.user_id, name: p.display_name, colour: p.colour })),
  ];

  // Stack overlapping jobs within a lane onto separate tracks.
  const tracksFor = (list: Job[]) => {
    const tracks: Job[][] = [];
    for (const j of list) {
      const s0 = minutesOf(j.pickup_time);
      const t = tracks.find((tr) => {
        const lastJob = tr[tr.length - 1];
        return minutesOf(lastJob.pickup_time) + lastJob.duration_min <= s0;
      });
      if (t) t.push(j);
      else tracks.push([j]);
    }
    return tracks.length ? tracks : [[]];
  };

  const nowMin = date === today ? minutesOf(now) : null;

  return (
    <div className="card overflow-x-auto">
      <div className="min-w-[900px] pr-5">
        <div className="flex border-b border-line bg-surface-2">
          <div className="w-36 shrink-0 px-3 py-2 text-xs font-semibold text-muted uppercase">Driver</div>
          <div className="relative h-8 flex-1">
            {hours.map((h) => (
              <span key={h} className="absolute top-2 -translate-x-1/2 text-[11px] text-muted tabular" style={{ left: pos(h) }}>
                {fmtTime(timeFromMinutes(h)).replace(":00", "").replace(" ", "")}
              </span>
            ))}
          </div>
        </div>
        {rows.map((r) => {
          const laneJobs = dayJobs.filter((j) => j.driver_id === r.id);
          const tracks = tracksFor(laneJobs);
          const offToday = r.id ? off.find((t) => isOff(t, r.id!, date)) : undefined;
          return (
            <div key={r.id ?? "none"} className="flex border-b border-line last:border-0">
              <div className="w-36 shrink-0 px-3 py-2 text-sm font-semibold">
                <span className="flex items-center gap-2">
                  {r.id ? <PersonDot colour={r.colour} /> : <span aria-hidden="true" className="inline-block size-2.5 rounded-full border-2 border-dashed" style={{ borderColor: r.colour }} />}
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="text-xs font-normal text-muted">
                  {laneJobs.length} job{laneJobs.length === 1 ? "" : "s"}
                  {laneJobs.length ? ` · ${(laneJobs.reduce((a, j) => a + j.duration_min, 0) / 60).toFixed(1)} h` : ""}
                </span>
              </div>
              <div className="relative flex-1" style={{ minHeight: `${Math.max(1, tracks.length) * 44 + 8}px` }}>
                {hours.map((h) => (
                  <span key={h} aria-hidden="true" className="absolute inset-y-0 w-px bg-grid" style={{ left: pos(h) }} />
                ))}
                {nowMin !== null && nowMin >= start && nowMin <= end ? (
                  <span aria-hidden="true" className="absolute inset-y-0 z-10 w-0.5 bg-bad" style={{ left: pos(nowMin) }} />
                ) : null}
                {offToday ? (
                  <div className="absolute inset-1 flex items-center rounded-md px-3 text-sm font-semibold text-muted" style={{ background: "repeating-linear-gradient(45deg, var(--color-surface-2) 0 6px, var(--color-bg) 6px 12px)" }}>
                    Off all day{offToday.note ? `: ${offToday.note}` : ""}
                  </div>
                ) : null}
                {tracks.map((tr, ti) =>
                  tr.map((j) => {
                    const s0 = minutesOf(j.pickup_time);
                    return (
                      <JobPill
                        key={j.id}
                        job={j}
                        colour={r.colour}
                        className="absolute px-1.5 py-1 text-[12px] leading-tight"
                        style={{ left: pos(s0), width: `max(3.5rem, ${(j.duration_min / span) * 100}%)`, top: 4 + ti * 44, height: 40 }}
                      >
                        <span className="block truncate font-semibold tabular"><Tick job={j} />{fmtTime(j.pickup_time)} {j.customer_name}</span>
                        <span className="block truncate opacity-90">{j.pickup_address} → {j.dropoff_address}</span>
                      </JobPill>
                    );
                  }),
                )}
              </div>
            </div>
          );
        })}
      </div>
      {office && rows.length === 0 ? <p className="p-4 text-sm text-muted">Everyone is hidden. Tap a name above to show them.</p> : null}
    </div>
  );
}

// ------------------------------------------------------------------ month grid

function MonthGrid({
  days, month, jobs, off, office, today, colourOf, nameOf, dayHref,
}: {
  days: string[]; month: string; jobs: Job[]; off: TimeOff[]; office: boolean; today: string;
  colourOf: Map<string, string>; nameOf: Map<string, string>; dayHref: (d: string) => string;
}) {
  const MAX = 4;
  const initials = (id: string | null) => (id ? (nameOf.get(id) ?? "?").split(" ").map((w) => w[0]).join("").slice(0, 2) : "–");
  return (
    <div className="card overflow-x-auto">
      <div className="grid min-w-[760px] grid-cols-7">
        {WEEKDAYS.map((w) => <div key={w} className="border-b border-line bg-surface-2 px-2 py-1.5 text-xs font-semibold text-muted">{w}</div>)}
        {days.map((d, i) => {
          const cell = jobs.filter((j) => j.pickup_date === d).sort(byTime);
          const offs = off.filter((t) => t.starts_on <= d && t.ends_on >= d);
          const inMonth = d.startsWith(month);
          return (
            <div key={d} className={`group min-h-28 border-b border-line p-1 ${i % 7 ? "border-l" : ""} ${inMonth ? "" : "bg-surface-2/60"}`}>
              <div className="mb-1 flex items-center justify-between">
                <Link
                  href={dayHref(d)}
                  className={`inline-grid size-6 place-items-center rounded-full text-xs font-semibold ${d === today ? "bg-accent text-[#1b1300]" : inMonth ? "text-text hover:bg-surface-2" : "text-muted"}`}
                >
                  {Number(d.slice(8))}
                </Link>
                {office ? (
                  <Link href={`/jobs/new?date=${d}`} className="rounded px-1 text-xs font-semibold text-muted opacity-0 group-hover:opacity-100 hover:bg-surface-2 focus:opacity-100" aria-label={`New job on ${fmtDay(d)}`}>+</Link>
                ) : null}
              </div>
              <div className="flex flex-col gap-0.5">
                {offs.map((t) => (
                  <div key={t.id} className="truncate rounded px-1 text-[11px] font-semibold text-muted" style={{ background: "repeating-linear-gradient(45deg, var(--color-surface-2) 0 4px, var(--color-bg) 4px 8px)" }}>
                    {nameOf.get(t.user_id)?.split(" ")[0] ?? "Someone"} off
                  </div>
                ))}
                {cell.slice(0, MAX).map((j) => (
                  <JobPill key={j.id} job={j} colour={j.driver_id ? colourOf.get(j.driver_id) : undefined} className="truncate px-1 py-px text-[11px] leading-snug">
                    <span className="font-semibold tabular"><Tick job={j} />{fmtTime(j.pickup_time).replace(":00", "").replace(" ", "")}</span> {initials(j.driver_id)} · {j.customer_name}
                  </JobPill>
                ))}
                {cell.length > MAX ? (
                  <Link href={dayHref(d)} className="px-1 text-[11px] font-semibold text-muted hover:text-text hover:underline">+{cell.length - MAX} more</Link>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Key() {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted print:hidden">
      <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded bg-series-1" /> Booked (driver&rsquo;s colour)</li>
      <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded border-2 border-dashed" style={{ borderColor: UNASSIGNED_COLOUR }} /> {NO_DRIVER}</li>
      <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded border-2 border-series-1" style={{ background: "repeating-linear-gradient(135deg, var(--color-info-bg) 0 3px, var(--color-surface) 3px 6px)" }} /> ? Enquiry</li>
      <li>✓ Done</li>
      <li className="inline-flex items-center gap-1.5"><span className="inline-block h-3 w-5 rounded" style={{ background: "repeating-linear-gradient(45deg, var(--color-surface-2) 0 3px, var(--color-bg) 3px 6px)" }} /> Time off</li>
    </ul>
  );
}
