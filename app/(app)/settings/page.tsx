import type { Metadata } from "next";
import { clearSampleData, saveSettings, saveTarget } from "@/app/(app)/setup-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { requireOwner } from "@/lib/auth";
import { hasSampleData } from "@/lib/store/demo";

export const metadata: Metadata = { title: "Settings" };

const ZONES = ["Pacific/Auckland", "Pacific/Chatham", "Australia/Sydney", "Australia/Melbourne", "Australia/Brisbane", "Australia/Adelaide", "Australia/Perth", "Pacific/Fiji", "Europe/London", "America/New_York", "America/Los_Angeles", "Asia/Singapore"];

export default async function SettingsPage() {
  const { store } = await requireOwner();
  const [s, target] = await Promise.all([store.settings(), store.weeklyTarget()]);
  const zones = ZONES.includes(s.timezone) ? ZONES : [s.timezone, ...ZONES];

  return (
    <>
      <PageHeader title="Settings" />
      <section className="card max-w-xl p-4">
        <ActionForm action={saveSettings} submitLabel="Save settings" className="flex flex-col gap-4">
          <div>
            <label htmlFor="business_name" className="field-label">Business name</label>
            <input id="business_name" name="business_name" required maxLength={80} defaultValue={s.business_name} className="field" />
            <p className="field-hint">Shown in the top bar.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="currency" className="field-label">Currency</label>
              <input id="currency" name="currency" required maxLength={3} defaultValue={s.currency} className="field uppercase" />
              <p className="field-hint">NZD, AUD, USD…</p>
            </div>
            <div>
              <label htmlFor="timezone" className="field-label">Time zone</label>
              <select id="timezone" name="timezone" defaultValue={s.timezone} className="field">
                {zones.map((z) => <option key={z} value={z}>{z.replace("_", " ")}</option>)}
              </select>
              <p className="field-hint">Decides what &ldquo;today&rdquo; is.</p>
            </div>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="gst_registered" defaultChecked={s.gst_registered} className="mt-0.5 size-4" />
            <span>
              <b>GST registered, prices include GST</b>
              <span className="block text-muted">Shows the GST in each month&rsquo;s charges (3/23 of the total) on Totals and in the Excel download.</span>
            </span>
          </label>
        </ActionForm>
      </section>

      <section id="target" className="card mt-4 max-w-xl scroll-mt-4 p-4">
        <h2 className="font-bold">Weekly target</h2>
        <p className="mt-1 mb-3 text-sm text-muted">
          Total booking $ you aim for each Monday-to-Sunday week. Totals and the dashboard show every week against it. Drivers never see it.
        </p>
        <ActionForm action={saveTarget} submitLabel="Save target" className="flex flex-col gap-3">
          <div className="max-w-56">
            <label htmlFor="weekly_target" className="field-label">Target per week ({s.currency})</label>
            <input id="weekly_target" name="weekly_target" inputMode="decimal" defaultValue={target ?? ""} placeholder="e.g. 5000" className="field" />
            <p className="field-hint">Leave empty for no target.</p>
          </div>
        </ActionForm>
      </section>

      {store.mode === "demo" && hasSampleData() ? (
        <section className="card mt-4 max-w-xl p-4">
          <h2 className="font-bold">Sample data</h2>
          <p className="mt-1 mb-3 text-sm text-muted">
            Demo mode started with made-up bookings, drivers and time off. Remove them to keep only the bookings you imported or typed in.
            The sample team is replaced by a single &ldquo;Owner&rdquo; login.
          </p>
          <ActionForm action={clearSampleData} submitLabel="Remove sample data" pendingLabel="Removing…" submitClass="btn btn-danger" />
        </section>
      ) : null}
    </>
  );
}
