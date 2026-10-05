import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requireOffice } from "@/lib/auth";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import spreadsheet" };
// A whole year's workbook is 1,000+ bookings: give the import time to finish.
export const maxDuration = 300;

export default async function ImportPage() {
  const { store } = await requireOffice();
  const [settings, people, vehicles] = await Promise.all([store.settings(), store.people(), store.vehicles()]);
  const drivers = people.filter((p) => p.is_active).map((p) => p.display_name.split(" ")[0]);

  return (
    <>
      <PageHeader
        title="Import from the booking spreadsheet"
        intro="Bring in the bookings you've been keeping in Excel. Nothing is saved until you've checked the preview."
      />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <ImportForm currency={settings.currency} />
        </div>
        <aside className="card h-fit p-4 text-sm">
          <h2 className="mb-2 font-bold">How it reads the sheet</h2>
          <ul className="flex list-disc flex-col gap-1.5 pl-4 text-muted">
            <li>Every tab with a header row of <b className="text-text">Date, Pick up, Drop off, Time, # of People, Driver, Vehicle, Name, Phone #, Charges, Driver Pay, More Info, Flight Information, Booking Reference</b> (the monthly tabs). Days with no booking are ignored.</li>
            <li><b className="text-text">Driver</b>: &ldquo;TBC&rdquo; stays TBC. Names are matched to the Team page{drivers.length ? ` (${drivers.join(", ")})` : ""}; anyone not there comes in as TBC.</li>
            <li><b className="text-text">Vehicle</b>: matched by name to the Vehicles page ({vehicles.map((v) => v.name).join(", ") || "none yet, add Car and Van first"}).</li>
            <li><b className="text-text">More Info</b>: &ldquo;Paid online 16.08.2026&rdquo; becomes paid online on that date; &ldquo;Pay on the day&rdquo; or &ldquo;Cash&rdquo; means the driver collects. Anything else goes into the notes.</li>
            <li><b className="text-text">Booking Reference</b>: TW-… and TSM-… are kept as your reference; WhatsApp, text, Messenger or an email address tell the app how it was booked.</li>
            <li>A charge like <b className="text-text">=1150/2</b> is marked as a shared ride. References ending -OUT and -RET are linked as a return trip.</li>
            <li>Bookings already in the app (same day, time and customer) are skipped, so importing the same file twice is safe.</li>
            <li>Past dates come in as completed, future ones as confirmed. How long the driver is busy is guessed from the town (Hamilton 4 h, Rotorua or Tauranga 7 h); change any that are off.</li>
          </ul>
        </aside>
      </div>
    </>
  );
}
