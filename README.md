# Shuttle bookings

Bookings, dispatch, a shared team calendar and a business dashboard for a
shuttle company. Replaces manual data entry (paper, spreadsheets, texts).

- **Owner / office** enter bookings, see which jobs are still **available**
  (no driver yet), assign drivers and vehicles, and track what every job earned
  and cost.
- **Drivers** sign in on their phone and see only their own jobs: where to go,
  who to call, directions, and a button to mark each job done.
- **Team calendar** (like Teamup): every person has a colour. Day view is a
  timeline per driver, Week is the dispatch board (drivers × days), Month is the
  big picture. Time off shows on it, and clashes are flagged when assigning.
- **Dashboard**: jobs, revenue, costs, profit and margin for any period against
  the one before; jobs per week; revenue/costs/profit per week; bookings by
  service and by source; busiest days and times; lead time and cancellation
  rate; per-driver and per-vehicle totals; and a per-job cost table
  (price, driver pay, fuel, tolls, other, profit, margin, payment). CSV export.

## Try it now (demo mode)

```bash
npm install
npm run dev -- --port 4420
```

Open http://localhost:4420. With no database configured it runs on six months
of sample data held in memory. Pick anyone on the sign-in screen: Alex (owner),
Priya (office) or one of the drivers. A yellow banner shows you're in demo
mode; restarting the server resets the data.

## Go live

Stack: Next.js 16 (App Router), Supabase (Postgres, Auth, row-level
security), Tailwind 4. Runs on Vercel's free tier with a free Supabase project.

1. **Create a Supabase project** (supabase.com, free plan). Pick the region
   closest to you (Sydney for NZ/AU).
2. **Create the tables.** Supabase → SQL editor → paste all of
   `supabase/all-migrations.sql` → Run.
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
7. Sign in, then: **Settings** (business name, currency, time zone) →
   **Vehicles** → **Team** (add drivers; each gets a one-time link to set their
   password; send it by text or WhatsApp).
8. **Deploy.** Push this folder to a private GitHub repo, import it in Vercel,
   and add the same four environment variables.

### Roles

| Role | Can do |
|---|---|
| Owner | Everything, including team, settings and roles |
| Office | Jobs, assigning, calendar, dashboard, money, vehicles, everyone's time off |
| Driver | Their own jobs (no prices, costs or other drivers' work), mark done / no-show, their own time off |

All of this is enforced in the database with row-level security, not just
hidden in the screens. Prices and costs live in a separate table
(`job_money`) that drivers cannot read at all.

## How the numbers work

- **Booked jobs** = confirmed + completed + no-show (they tie up a driver and
  are charged). Enquiries and cancellations are counted separately.
- **Revenue** = price of booked jobs. **Costs** = driver pay + fuel & running
  + tolls & parking + other. **Profit** = revenue − costs.
- The job form suggests **driver pay** (the driver's hourly rate × job time)
  and **fuel** (km × the vehicle's cost per km). Set rates under Team and
  Vehicles; you can always overwrite the suggestion.
- Weeks run Monday to Sunday. Dates and times are the local wall-clock time
  of the business; the time-zone setting only decides what "today" is.

## Project layout

| Path | What |
|---|---|
| `app/(app)/dashboard` | Dashboard |
| `app/(app)/jobs` | Jobs list (Available / Upcoming / …), job form, job page, CSV export, actions |
| `app/(app)/calendar` | Team calendar (day / week / month) |
| `app/(app)/my-jobs` | Driver home |
| `app/(app)/{team,vehicles,time-off,settings,account}` | Setup pages |
| `lib/store/` | Data access: `supabase.ts` (live) and `demo.ts` (sample data), same interface |
| `lib/metrics.ts` | Dashboard maths |
| `supabase/migrations/` | Schema, security, functions |
| `scripts/test-sql.mjs` | Runs the migrations in an in-process Postgres and checks every access rule |

## Checks

```bash
npm run test:sql   # database security rules (23 checks)
npx tsc --noEmit   # types
npm run lint
npm run build
```

## Not included yet

- Customer-facing online booking form (bookings are entered by the office).
- Automatic emails/SMS to customers or drivers.
- Invoices/GST. Prices are recorded as charged; the CSV export feeds your
  accounting software.
- Backups: the free Supabase plan has none. Upgrade to Pro, or schedule a
  nightly `pg_dump`, before relying on it.
