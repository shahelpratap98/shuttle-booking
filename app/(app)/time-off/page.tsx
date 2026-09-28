import type { Metadata } from "next";
import { ActionForm } from "@/components/action-form";
import { PersonDot } from "@/components/chips";
import { EmptyState, PageHeader } from "@/components/page-header";
import { isOffice, requireViewer } from "@/lib/auth";
import { addDays, daysBetween, fmtDay, todayIn } from "@/lib/dates";
import { addTimeOff, removeTimeOff } from "./actions";

export const metadata: Metadata = { title: "Time off" };

export default async function TimeOffPage() {
  const { viewer, store } = await requireViewer();
  const settings = await store.settings();
  const today = todayIn(settings.timezone);
  const office = isOffice(viewer.role);
  const [list, people] = await Promise.all([store.timeOff(addDays(today, -30), addDays(today, 365)), store.people()]);
  const person = new Map(people.map((p) => [p.user_id, p]));
  const upcoming = list.filter((t) => t.ends_on >= today);
  const past = list.filter((t) => t.ends_on < today).reverse();

  return (
    <>
      <PageHeader
        title="Time off"
        intro={office ? "Days people can't drive. They show on the calendar and are flagged when you assign jobs." : "Let the office know the days you can't drive."}
      />
      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="card h-fit p-4">
          <h2 className="mb-3 font-bold">Add time off</h2>
          <ActionForm action={addTimeOff} submitLabel="Add" resetOnSuccess className="flex flex-col gap-3">
            {office ? (
              <div>
                <label htmlFor="user_id" className="field-label">Who</label>
                <select id="user_id" name="user_id" defaultValue={viewer.user_id} className="field">
                  {people.filter((p) => p.is_active).map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}
                </select>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="starts_on" className="field-label">First day</label>
                <input id="starts_on" name="starts_on" type="date" required min={today} className="field" />
              </div>
              <div>
                <label htmlFor="ends_on" className="field-label">Last day</label>
                <input id="ends_on" name="ends_on" type="date" min={today} className="field" />
                <p className="field-hint">Leave empty for one day</p>
              </div>
            </div>
            <div>
              <label htmlFor="note" className="field-label">Note (optional)</label>
              <input id="note" name="note" maxLength={200} className="field" placeholder="Holiday, appointment…" />
            </div>
          </ActionForm>
        </section>

        <section className="min-w-0">
          <h2 className="mb-2 font-bold">Coming up</h2>
          {upcoming.length === 0 ? (
            <EmptyState title="No time off booked." />
          ) : (
            <ul className="card divide-y divide-line">
              {upcoming.map((t) => {
                const p = person.get(t.user_id);
                const days = daysBetween(t.starts_on, t.ends_on) + 1;
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="inline-flex w-40 items-center gap-2 font-semibold">
                      <PersonDot colour={p?.colour ?? "#64748b"} /> {p?.display_name ?? "Someone"}
                    </span>
                    <span className="tabular">
                      {t.starts_on === t.ends_on ? fmtDay(t.starts_on) : `${fmtDay(t.starts_on)} – ${fmtDay(t.ends_on)}`}
                      <span className="text-muted"> · {days} day{days === 1 ? "" : "s"}</span>
                    </span>
                    {t.note ? <span className="text-muted">{t.note}</span> : null}
                    <ActionForm action={removeTimeOff} submitLabel="Remove" pendingLabel="Removing…" submitClass="btn btn-sm btn-danger" className="ml-auto">
                      <input type="hidden" name="id" value={t.id} />
                    </ActionForm>
                  </li>
                );
              })}
            </ul>
          )}
          {past.length ? (
            <p className="mt-3 text-sm text-muted">
              Recently: {past.map((t) => `${person.get(t.user_id)?.display_name.split(" ")[0] ?? "Someone"} ${fmtDay(t.starts_on)}`).join(", ")}.
            </p>
          ) : null}
        </section>
      </div>
    </>
  );
}
