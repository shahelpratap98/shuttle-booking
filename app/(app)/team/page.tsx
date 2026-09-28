import type { Metadata } from "next";
import { savePerson, invitePerson, sendSignInLink } from "@/app/(app)/setup-actions";
import { ActionForm } from "@/components/action-form";
import { PersonDot } from "@/components/chips";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth";
import { COLOURS, ROLE_LABEL, ROLES } from "@/lib/constants";
import type { Profile } from "@/lib/types";

export const metadata: Metadata = { title: "Team" };

const ROLE_HELP = "Owner: everything. Office: jobs, calendar, money, vehicles (not team or settings). Driver: only their own jobs, no prices.";

export default async function TeamPage() {
  const { viewer, store } = await requireOwner();
  const [people, settings] = await Promise.all([store.people(), store.settings()]);
  const active = people.filter((p) => p.is_active);
  const inactive = people.filter((p) => !p.is_active);

  return (
    <>
      <PageHeader title="Team" intro={ROLE_HELP} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          {active.map((p) => <PersonCard key={p.user_id} p={p} self={p.user_id === viewer.user_id} currency={settings.currency} live={store.mode === "live"} />)}
          {inactive.length ? (
            <details className="card p-4">
              <summary className="cursor-pointer font-semibold">Inactive ({inactive.length})</summary>
              <div className="mt-3 flex flex-col gap-3">
                {inactive.map((p) => <PersonCard key={p.user_id} p={p} self={false} currency={settings.currency} live={store.mode === "live"} />)}
              </div>
            </details>
          ) : null}
        </div>

        <section className="card h-fit p-4">
          <h2 className="font-bold">Add someone</h2>
          <p className="mb-3 text-sm text-muted">
            {store.mode === "live"
              ? "Creates their login and gives you a one-time link to send them. They choose their own password."
              : "Demo mode: they appear straight away on the sign-in screen."}
          </p>
          <ActionForm action={invitePerson} submitLabel="Add to team" pendingLabel="Adding…" resetOnSuccess className="flex flex-col gap-3">
            <div>
              <label htmlFor="new-name" className="field-label">Name</label>
              <input id="new-name" name="display_name" required maxLength={80} className="field" />
            </div>
            <div>
              <label htmlFor="new-email" className="field-label">Email (their login)</label>
              <input id="new-email" name="email" type="email" required className="field" />
            </div>
            <div>
              <label htmlFor="new-phone" className="field-label">Mobile</label>
              <input id="new-phone" name="phone" type="tel" maxLength={40} className="field" />
            </div>
            <div>
              <label htmlFor="new-role" className="field-label">Role</label>
              <select id="new-role" name="role" defaultValue="driver" className="field">
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
              </select>
            </div>
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function PersonCard({ p, self, currency, live }: { p: Profile; self: boolean; currency: string; live: boolean }) {
  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <PersonDot colour={p.colour} className="size-3" />
        <h2 className="font-bold">{p.display_name}</h2>
        <span className="chip bg-surface-2 text-muted">{ROLE_LABEL[p.role]}</span>
        {self ? <span className="text-xs text-muted">(you)</span> : null}
        <span className="ml-auto text-sm text-muted">{p.email}</span>
      </div>
      <ActionForm action={savePerson} submitLabel="Save" submitClass="btn btn-sm btn-quiet" className="flex flex-col gap-3">
        <input type="hidden" name="user_id" value={p.user_id} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <label htmlFor={`n-${p.user_id}`} className="field-label">Name</label>
            <input id={`n-${p.user_id}`} name="display_name" defaultValue={p.display_name} required maxLength={80} className="field" />
          </div>
          <div>
            <label htmlFor={`ph-${p.user_id}`} className="field-label">Mobile</label>
            <input id={`ph-${p.user_id}`} name="phone" type="tel" defaultValue={p.phone ?? ""} maxLength={40} className="field" />
          </div>
          <div>
            <label htmlFor={`r-${p.user_id}`} className="field-label">Role</label>
            <select id={`r-${p.user_id}`} name="role" defaultValue={p.role} className="field">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`pr-${p.user_id}`} className="field-label">Pay per hour ({currency})</label>
            <input id={`pr-${p.user_id}`} name="pay_rate" inputMode="decimal" defaultValue={p.pay_rate ?? ""} className="field" placeholder="For cost suggestions" />
          </div>
        </div>
        <fieldset>
          <legend className="field-label">Calendar colour</legend>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...COLOURS, p.colour])].map((c) => (
              <label key={c} className="relative cursor-pointer">
                <input type="radio" name="colour" value={c} defaultChecked={c === p.colour} className="peer sr-only" />
                <span
                  className="block size-7 rounded-full ring-offset-2 ring-offset-surface peer-checked:ring-2 peer-checked:ring-text peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
                  style={{ background: c }}
                />
                <span className="sr-only">{c}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="inline-flex items-center gap-2 text-sm font-semibold">
          <input type="checkbox" name="is_active" defaultChecked={p.is_active} className="size-4" />
          Active (can sign in and be given jobs)
        </label>
      </ActionForm>
      {live && !self ? (
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold text-muted hover:text-text">Locked out? Make a new sign-in link</summary>
          <ActionForm action={sendSignInLink} submitLabel="Make link" pendingLabel="Making…" submitClass="btn btn-sm btn-quiet" className="mt-2">
            <input type="hidden" name="email" value={p.email} />
          </ActionForm>
        </details>
      ) : null}
    </section>
  );
}
