# Shuttle bookings (Trekway Shuttle)

Bookings, dispatch, a shared team calendar and a business dashboard for a
shuttle business, built to replace the monthly booking spreadsheet
(`Booking.xlsx`: one tab per month, Date | Pick up | Drop off | Time |
# of People | Driver | Vehicle | Name | Phone # | Charges | Trekway Pay |
Driver Pay | More Info | Flight Information | Booking Reference).

- **Bookings** are entered the way the sheet has them. A driver of **TBC**
  puts a booking on the list of jobs to give out; one click assigns a driver
  and vehicle (Car, Van), with anyone busy or off flagged.
- **Money follows the sheet**: Charge − Driver pay = **Trekway pay**. Optional
  fuel, tolls and other expenses give profit if you want it.
- **Payments**: Pay on the day, Paid (online / cash / card / bank, with the
  date), Invoiced or Not paid yet. For pay-on-the-day bookings the driver sees
  "Collect $X" and records cash or card when they finish, which marks the
  booking paid.
- **Job card**: every booking has the sheet's "Driver" tab as text
  (`Date-…`, `Pick up-…`, `Time-…`) with **Copy** and **Send on WhatsApp**.
- **Return trips** (the -OUT / -RET legs) are linked; **shared rides** can run
  together in one vehicle without being flagged as a clash.
- **Drivers** sign in on their phone and see only their own jobs: where to go,
  big Call / Text / directions buttons, what to collect, their pay, and
  "Mark done". The site can be added to the home screen and opens like an app.
- **Built for phones**: bottom menu, the calendar and bookings become simple
  lists on a small screen, filters fold away.
- **Help** (`/guide`): how to use the app, by role. Drivers see only their part.
- **Totals** (`/totals`): bookings and total booking $ month by month and week
  by week for any year, past or future, against an optional **weekly target**
  (Settings, owner only, never shown to drivers). The booking form shows the
  month's and week's running total as you type.
- **Repeat customers**: matched on phone number (021… and +64 21… are the
  same), else name. Marked ★ in lists, on the booking (with their other
  bookings), in the form, on the job card and on the driver's job.
- **Team calendar** (like Teamup): a colour per person. Day timeline per
  driver, Week dispatch board (drivers × days), Month overview. Time off shows
  on it. `$` marks jobs where the driver collects payment.
- **Dashboard**: bookings, charges, driver pay, Trekway pay, average booking
  and passengers against the previous period; **month by month** (including
  what's booked so far for coming months) and **week by week** tables of
  number of bookings and total booking $; bookings by channel (website,
  WhatsApp, text, Messenger, email…) and service; busiest days and times;
  lead time, cancellations, returns and shared rides; per-driver and
  per-vehicle totals; every booking laid out like the sheet.
- **Import** the existing spreadsheet (Bookings → Import) and **download**
  any range back out in the sheet's column order for Excel.
- **Everything else the 2025 workbook tracked** (see "From the 2025 workbook"
  below): driver pay runs, invoices and deposits, other operators, flags,
  repeating runs, children/infants, vehicle COF / rego / service dates, daily
  leads, monthly running costs, bookings taken per month, how each month was
  paid, GST, and a contract-run calculator.

## From the 2025 workbook

`2025 Booking.xlsx` had more than the monthly tabs. Where each part lives now:

| In the workbook | In the app |
|---|---|
| Monthly tabs Aug-2025 → Jul-2027 (all three layouts) | Bookings → Import. Older tabs without Driver / Driver Pay columns, the driver named under More Info, "Online Payment", "On account", "Invoice # INV-0092", "Customer Paid Direct", tours dated "06 to 13", costs typed as negative rows, "500 to Quick Shuttle", "Trekway to pay $280" are all read |
| `Q1 =SUM(K:K)` month totals; Driver tab Month list | Totals: month by month, year total |
| Driver tab "New booking for month" / "total before the month" | Totals → Each month in detail → Booked before the month / Booked during the month / Sales this month (from the booked-on day; imports read it from TW-ddmmyyyy / TW-yyyymmdd / TSM-…-ddmmyy references) |
| Driver tab "Week Ending" sales | Totals → Sales week by week; dashboard week table "Sales that week"; new-booking form "Sales this week" |
| Sunday: hand next week's jobs to drivers | Bookings → Driver TBC → Next week |
| "Paid Shef" beside rows | Driver pay: pay runs per driver, less cash they hold; imported "Paid Shef" rows come in as paid out |
| Summary earning (per driver Earning / Driver Pay / Trekway) | Dashboard → Drivers and vehicles |
| More Info invoice numbers, "On account", "Charge Hotel", tours "Paid 3000" | Booking form: Invoice #, Bill to, Paid so far; Invoices page |
| Online Payment / Cash / person totals (`SUMIF`) | Totals → How each month was paid |
| Quick Shuttle, Maxcare in Driver / Vehicle | Driver: "Another operator…" (what we pay them = driver pay) |
| Yellow / red highlighted rows | Flag for attention; Flagged tab; dashboard |
| Shared one off (TSM-SS, Ad / Ch / Inf) | Shared ride tick, children and infants on the booking |
| Lead Record | Leads page (enquiries a day, conversion) |
| Build up JD: marketing costs, contract run sums | Costs page: monthly running costs, marketing per booking, run calculator |
| Plan: GST reconciliations, vehicle servicing | GST setting (Totals, Excel download); vehicle COF / rego / service due dates with reminders |
| Plan, Build up JD job descriptions | Not in the app (people's responsibilities, not booking data) |

To try the app on a whole workbook without a database:

```bash
npx tsx --conditions=react-server scripts/demo-from-workbook.ts "C:/path/2025 Booking.xlsx" Shef,Ali,Mo,Sunny
```

(it overwrites `.demo-data/state.json`; copy that file first to keep it).

## Try it now (demo mode)

```bash
npm install
npm run dev -- --port 4420
```

Open http://localhost:4420. With no database configured it starts with sample
data (26 weeks back, four months ahead). Pick anyone on the sign-in screen:
Alex (owner), Priya (office) or one of the drivers. A yellow banner shows
you're in demo mode.

Demo data is saved to `.demo-data/state.json` (git-ignored, stays on this
computer), so imports and edits survive a restart. **Settings → Remove sample
data** deletes the made-up bookings, team and time off and keeps only what you
imported or typed in (the sample team becomes a single "Owner" login). Delete
`.demo-data/` to start over with the sample data.

## Go live

Stack: Next.js 16 (App Router), Supabase (Postgres, Auth, row-level
security), Tailwind 4. Runs on Vercel's free tier with a free Supabase project.

1. **Create a Supabase project** (supabase.com, free plan). Pick the Sydney
   region.
2. **Create the tables.** Supabase → SQL editor → paste all of
   `supabase/all-migrations.sql` → Run. **Already live?** Run only the
   migration files in `supabase/migrations/` that are newer than your last
   one, oldest first (`20260930000100_totals_repeat.sql` for totals,
   targets and repeat customers; `20261006000100_excel_parity.sql` for driver
   pay, invoices, leads, costs and the rest). Running the whole file again fails, because
   the tables already exist.
3. **Turn off public sign-ups.** Authentication → Sign In / Providers → Email:
   leave Email on, turn *Allow new users to sign up* off. Only people you add
   can get in.
4. **Set the URLs.** Authentication → URL Configuration: Site URL = your app's
   address; add `https://your-domain/**` and `http://localhost:4420/**` to
   Redirect URLs.
5. **Environment variables.** Copy `.env.example` to `.env.local` and fill in
   `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   (Project Settings → API), `SUPABASE_SERVICE_ROLE_KEY` (same page; server
   only, never commit it) and `NEXT_PUBLIC_APP_URL`.
6. **Create the owner account.** Authentication → Users → Add user → your
   email and a password, tick *Auto confirm*. **The first account ever created
   becomes the owner** automatically; everyone after that starts as a driver.
7. Sign in, then: **Settings** (business name "Trekway Shuttle", NZD,
   Pacific/Auckland) → **Vehicles** (Car, Van) → **Team** (add each driver with
   their mobile; each gets a one-time link to set their password, send it by
   text or WhatsApp).
8. **Import the spreadsheet**: Bookings → Import → choose the .xlsx → Check
   the file → Import. Add drivers and vehicles first so their names match.
9. **Deploy.** Push this folder to a private GitHub repo, import it in Vercel,
   and add the same four environment variables.

### Roles

| Role | Can do |
|---|---|
| Owner | Everything, including team, settings and roles |
| Office | Bookings, assigning, calendar, dashboard, money, vehicles, import/export, everyone's time off |
| Driver | Their own jobs only: addresses, customer contact, their own pay and what to collect. Never charges, Trekway pay or other drivers' work. Mark done / no-show / collected, their own time off |

All of this is enforced in the database with row-level security, not just
hidden in the screens. The charge, expenses and payment records live in a
separate table (`job_money`) that drivers cannot read at all.

## How the numbers work

- **Bookings** = confirmed + completed + no-show (they tie up a driver and are
  charged). Enquiries and cancellations are counted separately.
- **Charges** = what customers pay. **Driver pay** = what the driver gets for
  the job. **Trekway pay** = Charges − Driver pay (the label follows the
  business name in Settings). Expenses, if recorded, come off that for profit.
- **Driver busy for** blocks the driver's calendar, including the drive back
  (Hamilton run 4 h, Rotorua or Tauranga run 7 h). Clash warnings use it.
- **Totals and targets** count bookings and their charges by pick-up date, so
  a December trip booked in October counts in December. The weekly target is
  compared with each week's total booking $.
- **Repeat customer** = an earlier booking (not cancelled or an enquiry) with
  the same phone number, or the same name when there's no phone. A trip
  there and back counts once.
- Weeks run Monday to Sunday. Dates and times are the local wall-clock time
  of the business; the time-zone setting only decides what "today" is.

## Importing the spreadsheet

The importer reads every tab with a header row containing Date, Pick up and
Name (the monthly tabs); blank days are ignored and nothing is saved until you
confirm the preview.

| Sheet | Becomes |
|---|---|
| Driver "TBC" / a name | Driver TBC / the matching person on the Team page (else TBC, with a warning) |
| Vehicle "Car" / "Van" | The vehicle of that name |
| Time "06:30am", "1:30am", 14:00 | Pickup time |
| # of People "1+1" | 2 people, "People: 1+1" in the notes |
| Charges (incl. `=1150/2`) | Charge; a split formula marks the booking as a shared ride |
| Driver Pay | Driver pay (Trekway Pay is recalculated) |
| More Info "Paid online 16.08.2026" / "Pay on the day" / "Cash" | Paid online on that date / pay on the day (driver collects) |
| Flight Information "NZ175", "QF 143" | Flight; other text goes to the notes |
| Booking Reference TW-… / TSM-… / WhatsApp / text / Messenger / an email | Your reference / how it was booked / the customer's email |
| References ending -OUT and -RET | Linked as a return trip |

Past dates come in as completed, future ones as confirmed. Bookings already
in the app (same day, time and customer) are skipped, so re-importing is safe.
To see what a file would produce without a database:

```bash
npm run check:import -- "C:/path/Booking.xlsx"
```

## Project layout

| Path | What |
|---|---|
| `app/(app)/dashboard` | Dashboard |
| `app/(app)/jobs` | Bookings list (TBC / Upcoming / Pay on the day / …), booking form, booking page with job card, Excel export, actions |
| `app/(app)/import` | Spreadsheet import (preview, then import) |
| `app/(app)/calendar` | Team calendar (day / week / month) |
| `app/(app)/my-jobs` | Driver home |
| `app/(app)/{team,vehicles,time-off,settings,account}` | Setup pages |
| `lib/store/` | Data access: `supabase.ts` (live) and `demo.ts` (sample data), same interface |
| `lib/import-sheet.ts` | Reads the booking workbook |
| `lib/job-card.ts` | Job card text |
| `lib/metrics.ts` | Dashboard maths |
| `supabase/migrations/` | Schema, security, functions |
| `scripts/test-sql.mjs` | Runs the migrations in an in-process Postgres and checks every access rule |

## Checks

```bash
npm run test:sql   # database security rules (49 checks)
npx tsc --noEmit   # types
npm run lint
npm run build
```

## Not included yet

- Customer-facing online booking form (bookings are entered by the office or imported).
- Automatic emails/SMS to customers or drivers (the job card is sent by hand on WhatsApp).
- Invoices/GST. Charges are recorded as charged; the Excel export feeds your
  accounting software.
- Backups: the free Supabase plan has none. Upgrade to Pro, or schedule a
  nightly `pg_dump`, before relying on it.
