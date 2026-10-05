import type { Metadata } from "next";
import { saveVehicle } from "@/app/(app)/setup-actions";
import { ActionForm } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { todayIn } from "@/lib/dates";
import type { Vehicle } from "@/lib/types";
import { vehicleAlerts } from "@/lib/vehicles";

export const metadata: Metadata = { title: "Vehicles" };

export default async function VehiclesPage() {
  const { store } = await requireOffice();
  const [vehicles, settings] = await Promise.all([store.vehicles(), store.settings()]);
  const alerts = vehicleAlerts(vehicles, todayIn(settings.timezone));

  return (
    <>
      <PageHeader title="Vehicles" intro="Car, Van, or each vehicle by name. Seats warn you when a booking has more people than fit; COF, rego and service dates remind you a month ahead." />
      {alerts.length ? (
        <ul role="alert" className="mb-4 flex flex-col gap-1 rounded-lg border border-warn/40 bg-warn-bg px-4 py-3 text-sm font-semibold text-warn">
          {alerts.map((a) => <li key={`${a.vehicle.id}-${a.what}`} className={a.overdue ? "text-bad" : ""}>{a.text}</li>)}
        </ul>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-3">
          {vehicles.length === 0 ? <p className="card p-4 text-sm text-muted">No vehicles yet. Add your first one.</p> : null}
          {vehicles.map((v) => (
            <section key={v.id} className={`card p-4 ${v.is_active ? "" : "opacity-70"}`}>
              <h2 className="mb-3 font-bold">{v.name}{v.is_active ? "" : " (not in use)"}</h2>
              <ActionForm action={saveVehicle} submitLabel="Save" submitClass="btn btn-sm btn-quiet" className="flex flex-col gap-3">
                <input type="hidden" name="id" value={v.id} />
                <VehicleFields v={v} />
                <label className="inline-flex items-center gap-2 text-sm font-semibold">
                  <input type="checkbox" name="is_active" defaultChecked={v.is_active} className="size-4" /> In use
                </label>
              </ActionForm>
            </section>
          ))}
        </div>
        <section className="card h-fit p-4">
          <h2 className="mb-3 font-bold">Add a vehicle</h2>
          <ActionForm action={saveVehicle} submitLabel="Add vehicle" pendingLabel="Adding…" resetOnSuccess className="flex flex-col gap-3">
            <VehicleFields />
          </ActionForm>
        </section>
      </div>
    </>
  );
}

function VehicleFields({ v }: { v?: Vehicle }) {
  const k = v?.id ?? "new";
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2">
        <label htmlFor={`name-${k}`} className="field-label">Name</label>
        <input id={`name-${k}`} name="name" required maxLength={60} defaultValue={v?.name} className="field" placeholder="Van" />
      </div>
      <div>
        <label htmlFor={`rego-${k}`} className="field-label">Registration</label>
        <input id={`rego-${k}`} name="registration" maxLength={20} defaultValue={v?.registration ?? ""} className="field uppercase" />
      </div>
      <div>
        <label htmlFor={`seats-${k}`} className="field-label">Passenger seats</label>
        <input id={`seats-${k}`} name="seats" type="number" min={1} max={99} defaultValue={v?.seats ?? ""} className="field" />
      </div>
      <div className="col-span-2 grid grid-cols-3 gap-2">
        <div>
          <label htmlFor={`cof-${k}`} className="field-label">COF due</label>
          <input id={`cof-${k}`} name="cof_due" type="date" defaultValue={v?.cof_due ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`rego-due-${k}`} className="field-label">Rego due</label>
          <input id={`rego-due-${k}`} name="rego_due" type="date" defaultValue={v?.rego_due ?? ""} className="field" />
        </div>
        <div>
          <label htmlFor={`service-${k}`} className="field-label">Service due</label>
          <input id={`service-${k}`} name="service_due" type="date" defaultValue={v?.service_due ?? ""} className="field" />
        </div>
      </div>
      <div className="col-span-2">
        <label htmlFor={`notes-${k}`} className="field-label">Notes</label>
        <input id={`notes-${k}`} name="notes" maxLength={500} defaultValue={v?.notes ?? ""} className="field" placeholder="Toyota Hiace, fuel card 1234" />
      </div>
    </div>
  );
}
