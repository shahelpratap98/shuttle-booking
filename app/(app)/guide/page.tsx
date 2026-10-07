import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { isOffice, isOwner, requireViewer } from "@/lib/auth";
import { NO_DRIVER, ROLE_LABEL } from "@/lib/constants";
import { shareLabel } from "@/lib/format";

export const metadata: Metadata = { title: "How to use the app" };

// One page for everyone. Drivers get the parts that apply to them; the owner
// and office see every part, so they can walk a new driver through theirs.
export default async function GuidePage() {
  const { viewer, store } = await requireViewer();
  const settings = await store.settings();
  const office = isOffice(viewer.role);
  const owner = isOwner(viewer.role);
  const share = shareLabel(settings.business_name);

  const parts = [
    { id: "phone", title: "Put the app on your phone" },
    ...(office ? [{ id: "office", title: "Bookings and dispatch" }, { id: "owner", title: "Owner: team and settings" }] : []),
    { id: "driver", title: office ? "What drivers do" : "Your jobs" },
    { id: "help", title: "Sign-in problems" },
  ];

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="How to use the app"
        intro={<>You&rsquo;re signed in as <b>{viewer.display_name}</b> ({ROLE_LABEL[viewer.role]}).{office ? " You can see every part of this guide." : ""}</>}
      />

      <nav aria-label="On this page" className="mb-6 flex flex-wrap gap-2">
        {parts.map((p) => (
          <a key={p.id} href={`#${p.id}`} className="rounded-full border border-line-2 bg-surface px-3 py-1.5 text-sm font-semibold hover:bg-surface-2">
            {p.title}
          </a>
        ))}
      </nav>

      <div className="flex flex-col gap-5">
        <Part id="phone" title="Put the app on your phone">
          <p>It works in the phone&rsquo;s web browser, nothing to download. Add it to your home screen once and it opens like any other app.</p>
          <h3>iPhone</h3>
          <Steps>
            <li>Open this site in <b>Safari</b> and sign in.</li>
            <li>Tap the <b>Share</b> button (the square with an arrow).</li>
            <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
          </Steps>
          <h3>Android</h3>
          <Steps>
            <li>Open this site in <b>Chrome</b> and sign in.</li>
            <li>Tap the <b>⋮</b> menu at the top right.</li>
            <li>Tap <b>Add to Home screen</b> (or <b>Install app</b>), then <b>Install</b>.</li>
          </Steps>
          <p>
            On a phone the menu is along the bottom of the screen. <b>More</b> has the rest: your account, this guide and sign out.
          </p>
        </Part>

        {office ? (
          <>
            <Part id="office" title="Bookings and dispatch" who="Owner and Office">
              <h3>Take a booking</h3>
              <Steps>
                <li>Go to <b>Bookings</b> and tap <b>New booking</b> (or <b>+ Add</b> on a day in the Calendar).</li>
                <li>Fill in the date, pick-up time, from and to, number of people, and the customer&rsquo;s name and phone.</li>
                <li>
                  Put in the <b>Charge</b> and the <b>Driver pay</b>. {share} is worked out for you (charge minus driver pay).
                </li>
                <li>
                  Choose how they&rsquo;re paying: <b>Paid</b> (with how and when), <b>Pay on the day</b> (the driver collects it),{" "}
                  <b>Invoiced</b> or <b>Not paid yet</b>.
                </li>
                <li>Leave the driver as <b>{NO_DRIVER}</b> if you haven&rsquo;t decided yet, and save.</li>
              </Steps>
              <Tip>
                On a saved booking, <b>Add return trip</b> makes the trip back with the addresses swapped, linked to the first one. <b>Copy</b> starts a
                new booking with the same details. Tick <b>Shared ride</b> when several bookings go in one vehicle, so they aren&rsquo;t flagged as a clash.
              </Tip>
              <ul className="list-disc pl-5">
                <li><b>Children and infants</b>: put how many of the people are children or babies; infants remind you to fit a baby seat.</li>
                <li><b>Deposit</b>: if they&rsquo;ve paid part (a tour deposit), put it in <b>Paid so far</b>. The rest shows as owed, and on a pay-on-the-day job the driver collects only the rest.</li>
                <li><b>Invoice # and Bill to</b>: for invoiced work and account customers (a hotel, school or company), so Invoices groups them.</li>
                <li><b>Another operator</b>: if Quick Shuttle or another company does the job, choose <b>Another operator…</b> as the driver, type their name, and put what we pay them under Cost.</li>
                <li><b>Repeat this booking</b> (on a saved booking): the same trip on the days you tick until a date, for contract and school runs.</li>
                <li><b>Flag for attention</b> (on a saved booking): a note like &ldquo;look after this client&rdquo; or &ldquo;check the address&rdquo;. Flagged bookings show on the dashboard and under the Flagged tab until someone clears the flag.</li>
                <li>The booking page warns you about a <b>possible double booking</b> (same customer, same day) and a vehicle whose COF or rego runs out first.</li>
              </ul>

              <h3>Give out the jobs</h3>
              <Steps>
                <li>
                  <b>Bookings</b> opens on <b>{NO_DRIVER}</b>: every upcoming booking with no driver yet. The number on the menu shows how many are left.
                </li>
                <li>Pick a driver and a vehicle next to the booking and tap <b>Assign</b>. Anyone off or already busy then is labelled in the list.</li>
                <li>
                  On the booking page, the <b>Job card</b> has the details in the same layout as the old Driver sheet. Tap <b>Send on WhatsApp</b> to
                  send it to the driver, or <b>Copy</b> it. The driver also sees it straight away under My jobs.
                </li>
              </Steps>

              <h3>Keep track</h3>
              <ul className="list-disc pl-5">
                <li>
                  <b>Bookings</b> tabs: <b>By day</b> (every job on one day, with ‹ › to move a day and the day&rsquo;s total), Upcoming and All (grouped by
                  day, with each day&rsquo;s number of bookings and $), Pay on the day (money drivers will collect), Waiting for payment, Past. Search and
                  filters are under the tabs.
                </li>
                <li>
                  <b>Totals</b>: what&rsquo;s been booked month by month and week by week for any year, past or future (future months show what&rsquo;s
                  booked so far), with the year&rsquo;s total. Tap a month or week to see its bookings. If the owner has set a weekly target, each week
                  shows how close it got.
                </li>
                <li>
                  While you enter a booking, the form shows that month&rsquo;s total so far and what it will be with this booking, plus the week against the
                  target. After saving, the green message gives the month&rsquo;s new total.
                </li>
                <li>
                  <b>★ Repeat customer</b>: someone who has booked before (same phone number, or the same name if there&rsquo;s no phone) is marked in the
                  lists, on the booking, and on the driver&rsquo;s job. The booking page lists their other bookings, and the form tells you as you type their
                  name or number.
                </li>
                <li><b>Calendar</b>: everyone&rsquo;s jobs in their own colour. Day shows who is free when, Week is the dispatch board, Month is the big picture. Tap a name to hide or show that person. On a phone it shows as a list, day by day.</li>
                <li><b>Status</b> on a booking: Confirm an enquiry, Mark done, Mark no-show or Cancel. Cancel rather than delete, so it still counts in the numbers.</li>
                <li><b>Time off</b>: add anyone&rsquo;s days off. They show on the calendar and in the Assign list.</li>
                <li><b>Dashboard</b>: bookings, charges, driver pay and {share} for any period, month by month and week by week, where bookings come from, busiest days and times, and totals per driver and vehicle.</li>
                <li><b>Vehicles</b>: add or retire vehicles, with rego, seats and the COF, rego and service due dates. The dashboard reminds you a month ahead.</li>
              </ul>

              <h3>Money</h3>
              <ul className="list-disc pl-5">
                <li>
                  <b>Driver pay</b>: each week, what every driver (and other operator) is owed for finished jobs, less any cash they collected from customers.
                  Pay them, then <b>Mark paid out</b>. Drivers see &ldquo;paid to you&rdquo; on their jobs. Wrong one? <b>Undo</b> under Paid out recently.
                </li>
                <li><b>Invoices</b>: money still owed for trips (invoiced, on account, part-paid), oldest first, grouped by invoice or customer. <b>Mark all paid</b> when it arrives.</li>
                <li><b>Costs</b>: running costs each month (Google and Facebook ads, staff, fuel cards…) and what&rsquo;s left after them. <b>Copy last month&rsquo;s costs</b> saves typing. The <b>run calculator</b> works out what a contract or daily shuttle brings in.</li>
                <li><b>Leads</b>: how many enquiries came in each day, and how many bookings were taken, so you can see how many turn into bookings.</li>
                <li><b>Totals → Each month in detail</b>: the month&rsquo;s trips split into what was already booked before the month started and what was booked during it, sales taken that month (any trip date), GST, running costs and what&rsquo;s left.</li>
                <li><b>Totals → Sales week by week</b>: what was booked each week, whatever the trip date (the old &ldquo;Week Ending&rdquo; table). The dashboard week table and the new-booking form show it too: &ldquo;Sales this week&rdquo; goes up as you enter a booking.</li>
                <li><b>Bookings → Driver TBC → Next week</b>: on Sunday, open next week&rsquo;s jobs with no driver and assign them one by one.</li>
                <li><b>Totals → How each month was paid</b> splits it by online, cash, card, bank and invoice.</li>
              </ul>

              <h3>Spreadsheets</h3>
              <ul className="list-disc pl-5">
                <li><b>Bookings → Import</b> reads the monthly booking sheet (.xlsx). It shows what it found first; nothing is saved until you confirm. Bookings already in the app are skipped, so importing the same file twice is safe.</li>
                <li><b>Download for Excel</b> gives you any range of bookings in the sheet&rsquo;s column order, for your accounts.</li>
              </ul>
            </Part>

            <Part id="owner" title="Owner: team and settings" who="Owner only">
              <h3>Add a driver or office person</h3>
              <Steps>
                <li>Go to <b>Team</b> (under More on a phone).</li>
                <li>Under <b>Add someone</b>, enter their name, email (their login) and mobile, and choose a role.</li>
                <li>You get a one-time link. Send it to them by text or WhatsApp; they open it and choose their own password.</li>
              </Steps>
              <ul className="list-disc pl-5">
                <li><b>Owner</b>: everything, including Team and Settings. <b>Office</b>: bookings, calendar, money, vehicles, import and export. <b>Driver</b>: only their own jobs, never charges or {share}.</li>
                <li>To change someone&rsquo;s role, colour or mobile, edit their card and <b>Save</b>. Untick <b>Active</b> when someone leaves: they can&rsquo;t sign in, but their past jobs stay.</li>
                <li>Someone locked out? Open their card, <b>Make a new sign-in link</b>, and send it to them.</li>
                <li><b>Settings</b>: business name, currency and time zone (the time zone decides what &ldquo;today&rdquo; is).</li>
                <li><b>Settings → Weekly target</b>: the total booking $ you aim for each week. Totals and the dashboard show every week against it. Drivers never see it.</li>
                <li><b>Settings → GST registered</b>: tick it and Totals and the Excel download show the GST inside your charges (3/23 of the total).</li>
              </ul>
            </Part>
          </>
        ) : null}

        <Part id="driver" title={office ? "What drivers do" : "Your jobs"} who={office ? "Drivers" : undefined}>
          <h3>Before the job</h3>
          <Steps>
            <li><b>My jobs</b> is your home page: today&rsquo;s jobs first, then the next three weeks, day by day.</li>
            <li>Each job shows the pick-up time, where from and to, the customer, passengers, bags, flight and vehicle.</li>
            <li>
              A blue <b>Collect $…</b> means the customer pays you on the day. <b>Nothing to collect</b> means it&rsquo;s already paid. <b>Your pay</b>{" "}
              is what you get for the job.
            </li>
            <li>
              <b>★ Repeat customer</b> on a job means they&rsquo;ve travelled with us before.
            </li>
            <li>
              Use the buttons on the job: <b>Call</b> or <b>Text</b> the customer, <b>To pick-up</b> for directions from where you are, <b>Full route</b>{" "}
              for pick-up to drop-off.
            </li>
          </Steps>
          <h3>After the job</h3>
          <Steps>
            <li>Scroll to the bottom of the job (on My jobs or on the job itself).</li>
            <li>If there was money to collect, choose <b>Paid cash</b>, <b>Paid by card</b> or <b>Not paid yet</b>.</li>
            <li>Add the km driven and any notes for the office (flight late, extra stop, parking paid).</li>
            <li>Tap <b>Mark done</b>, or <b>Customer no-show</b> if they didn&rsquo;t turn up.</li>
          </Steps>
          <Tip>
            Tapped the wrong one? Open the job and tap <b>Undo: not done yet</b>. Jobs from earlier days that aren&rsquo;t marked done stay at the top of My
            jobs until you finish them. You can only mark a job done on the day or after.
          </Tip>
          <h3>Days off and your calendar</h3>
          <ul className="list-disc pl-5">
            <li><b>Time off</b>: add the first and last day you can&rsquo;t drive. The office sees it and won&rsquo;t give you jobs then.</li>
            <li><b>Calendar</b>: your jobs as a list, day by day. Day, Week and Month change how far ahead you see.</li>
          </ul>
        </Part>

        <Part id="help" title="Sign-in problems">
          <ul className="list-disc pl-5">
            <li>Forgot your password? On the sign-in page tap <b>Forgot your password?</b> and follow the email.</li>
            <li>Want a new password? <b>More → My account → Change password</b>.</li>
            <li>Link expired or still stuck? Ask the owner for a new sign-in link.</li>
          </ul>
          {!office ? (
            <p className="text-muted">Something wrong with a job (wrong address, time or amount)? Call or message the office; only they can change bookings.</p>
          ) : null}
        </Part>
      </div>

      {owner ? (
        <p className="mt-6 text-sm text-muted">
          Drivers see only the &ldquo;Your jobs&rdquo;, phone and sign-in parts of this page. Send them the link: <Link href="/guide" className="link">/guide</Link>.
        </p>
      ) : null}
    </div>
  );
}

function Part({ id, title, who, children }: { id: string; title: string; who?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-4 p-4 sm:p-6">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h2 className="text-xl font-bold">{title}</h2>
        {who ? <span className="chip bg-surface-2 text-muted">{who}</span> : null}
      </div>
      <div className="flex flex-col gap-3 text-[15px] leading-relaxed [&_h3]:mt-2 [&_h3]:font-bold">{children}</div>
    </section>
  );
}

function Steps({ children }: { children: ReactNode }) {
  return <ol className="flex list-decimal flex-col gap-1.5 pl-5 marker:font-bold marker:text-muted">{children}</ol>;
}

function Tip({ children }: { children: ReactNode }) {
  return <p className="rounded-lg bg-info-bg px-3 py-2 text-sm text-info">{children}</p>;
}
