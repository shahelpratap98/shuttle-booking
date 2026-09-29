import { mapsLink, navigateLink } from "@/lib/format";

// The buttons a driver needs with one thumb: ring or text the customer, and
// get directions. Big enough to hit in a moving day.
export function TripActions({ phone, pickup, dropoff }: { phone: string | null; pickup: string; dropoff: string }) {
  const tel = phone?.replace(/[^\d+]/g, "");
  return (
    <div className="grid grid-cols-2 gap-2 print:hidden">
      {tel ? (
        <>
          <a href={`tel:${tel}`} className="btn btn-primary">
            <Icon d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z" />
            Call
          </a>
          <a href={`sms:${tel}`} className="btn btn-quiet">
            <Icon d="M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H8l-4 4V5a1 1 0 0 1 1-1z" />
            Text
          </a>
        </>
      ) : null}
      <a href={navigateLink(pickup)} target="_blank" rel="noreferrer" className="btn btn-quiet">
        <Icon d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z" />
        To pick-up
      </a>
      <a href={mapsLink(pickup, dropoff)} target="_blank" rel="noreferrer" className="btn btn-quiet">
        <Icon d="M3 17l6-6 4 4 8-8M15 7h6v6" stroke />
        Full route
      </a>
    </div>
  );
}

function Icon({ d, stroke }: { d: string; stroke?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px] shrink-0" {...(stroke ? { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } : { fill: "currentColor" })}>
      <path d={d} />
    </svg>
  );
}
