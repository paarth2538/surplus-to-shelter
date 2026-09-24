# Surplus2Shelter Project Memory

## Purpose

This file is the persistent handoff log for the Surplus2Shelter project. Update it after every project task, bug fix, database change, test run, or deployment-related action. The update must be committed and pushed to `https://github.com/paarth2538/surplus-to-shelter` with the related work.

## Update Protocol

1. Read this file before starting a task.
2. Add a dated entry after the task with the goal, files changed, validation, and remaining work.
3. Record blockers and external actions required from the developer, especially Supabase Dashboard actions.
4. Never store passwords, access tokens, service-role keys, private keys, or `.env.local` values here.
5. Run the relevant checks before committing.
6. Commit `memory.md` together with the task changes and push to `origin/main` unless the task explicitly uses another branch.

## Project Snapshot

- **Product:** Surplus2Shelter, a surplus-food rescue and direct-care logistics platform.
- **Frontend:** React 19 with Vite 8, JavaScript/JSX, Three.js, and Oxlint.
- **Current UI:** Existing landing experience with live-impact telemetry, dispatch cards, shelter wishlists, 3D courier visualization, pickup modal, authentication modal, profile menu, and role dashboard states.
- **Supabase client:** `src/lib/supabase.js` uses `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` only.
- **Secrets:** `.env.local` is ignored and must never be committed. Never use a Supabase service-role key in frontend code.
- **Repository:** `https://github.com/paarth2538/surplus-to-shelter`
- **Default branch:** `main`

## Current Architecture

- `src/main.jsx` mounts `App` inside `AuthProvider`.
- `src/context/AuthContext.jsx` owns Supabase session restoration, `getSession()`, `onAuthStateChange()`, profile loading, signup, login, logout, and profile refresh.
- `src/components/AuthModal.jsx` provides the existing styled login/signup UI with donor, shelter, and driver role selection.
- `src/components/ProtectedRoute.jsx` guards role paths.
- `src/components/RoleDashboard.jsx` provides minimal role-aware dashboard states for Phase 2.
- `src/App.jsx` keeps the existing home page and uses lightweight history-based navigation for `/login`, `/dashboard`, `/donor`, `/shelter`, `/driver`, and `/admin`.
- `src/components/ThreeCanvas.jsx` owns the direct Three.js scene and simulated telemetry.
- `supabase/schema.sql` contains the Phase 1 application schema, RLS, helper functions, profile role protection, and `auth.users` profile creation trigger.

## Database State

An earlier Supabase production inspection showed no application tables or views in the public schema. The latest task context states that the Phase 1 schema is now deployed; this was not independently re-verified during the Phase 4 implementation.

Expected application tables:

- `profiles`
- `donations`
- `shelters`
- `drivers`
- `pickups`
- `impact`
- Existing frontend table: `pickup_requests`

The profile relationship is `auth.users.id = profiles.id`. Normal signup roles are `donor`, `shelter`, and `driver`; `admin` must be provisioned separately.

## Authentication State

- Signup calls `supabase.auth.signUp()` once from the form submit handler.
- Signup passes `name`, `phone`, and `role` through `options.data`.
- The database trigger `handle_new_user()` is intended to create the profile.
- Login calls `supabase.auth.signInWithPassword()` and verifies that a profile exists.
- Logout calls `supabase.auth.signOut()`.
- The UI prevents duplicate submission and applies a 60-second client backoff after Supabase rate-limit responses.
- Safe auth diagnostics log only message, code, status, name, and details. Passwords and tokens are never logged.

## Known Supabase Issue

A real signup probe returned:

- `message`: `email rate limit exceeded`
- `code`: `over_email_send_rate_limit`
- `status`: `429`
- `name`: `AuthApiError`

The issue is Supabase email provider throttling, not duplicate frontend submission. Later runtime output also showed `public.profiles` missing from the Supabase schema cache, confirming that the local schema migration still needs to be run in the Supabase SQL Editor.

Required external action:

1. Run the latest `supabase/schema.sql` in the Supabase SQL Editor.
2. Check Authentication email provider settings and SMTP configuration.
3. Wait for the email rate limit to reset.
4. Test with a fresh email address.
5. Confirm one `auth.users` row and one matching `profiles` row.

Do not claim the database is fixed until those checks succeed in Supabase.

## Validation History

- `npm run build`: passing after the authentication work.
- `npm run lint`: passing with non-blocking warnings from the existing Three.js component, the combined auth context exports, and one navigation effect.
- Browser smoke checks: the existing home UI remains available, `/login` opens the styled auth modal, and unauthenticated protected paths redirect to login.
- Auth response verification: duplicate email and invalid login responses now reach the frontend and map to friendly messages.
- Latest GitHub commit before this memory file: `11b67e5`.

## Completed Work Log

### 2026-09-24 - Project documentation

- Added `PRD.md`, `Architecture.md`, `rules.md`, `phases.md`, and `design.md`.
- Documented the current React/Vite implementation and proposed production architecture.

### 2026-09-24 - Supabase pickup integration

- Added `@supabase/supabase-js`.
- Added `src/lib/supabase.js`, `.env.example`, and the pickup request schema.
- Connected the existing pickup form to `pickup_requests` without changing its visual flow.

### 2026-09-24 - Phase 1 database design

- Added profiles, donations, shelters, drivers, pickups, impact, indexes, RLS, policies, role protection, and the profile creation trigger to `supabase/schema.sql`.
- No matching algorithm, AI, maps, routing, or driver dispatch was implemented.

### 2026-09-24 - Phase 2 authentication

- Added Supabase email/password signup, login, logout, session restoration, role selection, profile loading, protected role paths, and role-aware dashboard states.
- Normal signup cannot select admin.
- Existing home UI and design system were preserved.

### 2026-09-24 - GitHub publication

- Initialized the local Git repository and pushed the complete project to `paarth2538/surplus-to-shelter` on `main`.
- Excluded `.env.local`, `.env`, `node_modules`, and `dist`.

### 2026-09-24 - Phase 3 donation management started

- Added `src/components/DonationModal.jsx` with donor-owned Supabase inserts, field validation, loading state, duplicate-submit protection, success state, and safe error logging.
- Updated `src/components/RoleDashboard.jsx` to query real donor-owned donations from `public.donations`, newest first, with loading, empty, error, status, expiry, address, and created-date states.
- Updated `src/App.jsx` to connect the existing Donate Surplus action and refresh the donor history after a successful insert.
- Updated `src/App.css` for the donation form and responsive scrollable modal behavior.
- Verified the local donation form opens from the existing UI. Production database insertion was not completed in this task because it requires an authenticated donor session and a deployed Supabase schema.
- Phase 3 remains current and incomplete until a real donation row is confirmed in Supabase and after refresh/login in the donor workspace.

### 2026-09-24 - Phase 4 shelter requests and demand management started

- Added `public.shelter_requests` to `supabase/schema.sql` and created the safe rerunnable migration `supabase/migrations/002_shelter_requests.sql`.
- Added request indexes, status/urgency constraints, shelter ownership RLS, and administrative-only shelter verification protection.
- Added `src/components/ShelterWorkspace.jsx` for real shelter profile, capacity, preferences, urgency, request creation, history, open-request editing, and cancellation.
- Updated `src/components/RoleDashboard.jsx`, `src/App.jsx`, and `src/App.css` to expose the shelter workflow while preserving donor behavior.
- No matching, dispatch, routing, realtime tracking, notifications, AI, or impact calculations were added.
- `npm run lint` and `npm run build` pass with existing non-blocking warnings.
- A real shelter profile/request was not created in Supabase during this task; the migration must be applied and tested with an authenticated shelter account.

### 2026-09-24 - Phase 5 smart matching engine started

- Confirmed existing columns: donations use `food_type`, `quantity`, `unit`, `expiry_time`, `latitude`, `longitude`, and `status`; shelter requests use `food_type`, `item_name`, `quantity`, `unit`, `urgency_level`, `needed_by`, and `status`.
- Confirmed no existing matches table or matching helper was present.
- Added `supabase/migrations/003_matching_engine.sql` with `public.matches`, indexes, RLS, Haversine distance, compatibility scoring, secure matching RPCs, accept/dismiss response RPC, and insert triggers for posted donations/open requests.
- Matching score weights are category compatibility 40, quantity coverage 25, proximity 20, expiry window 10, and urgency 5, normalized to 0-100.
- Added `src/lib/matching.js` and `src/components/MatchList.jsx` for manual Find Matches, ranked match metrics, and accept/dismiss actions on donor and shelter workspaces.
- Updated `src/components/RoleDashboard.jsx`, `src/components/ShelterWorkspace.jsx`, and `src/App.css` only for match rendering and controls.
- No driver dispatch, live tracking, maps, notifications, AI, or predictive logic was added.
- `npm run lint` and `npm run build` pass with non-blocking existing warnings.
- The user confirmed that the Phase 5 migration has now been executed remotely in Supabase. A real `public.matches` row has not been independently observed by this agent, so match-row verification remains an explicit follow-up check.

## Future Task Entry Template

### YYYY-MM-DD - Short task title

- **Goal:**
- **Files changed:**
- **Database/Supabase changes:**
- **Validation:**
- **External actions required:**
- **Remaining work:**
- **Commit:**

### 2026-09-24 - Phase 6 pickup, driver, and dispatch system

- **Goal:** Complete driver pickup execution, dispatch management, donor/shelter visibility, shared tracking, realtime updates, notifications, and E2E test tooling.
- **Files changed:** Added dispatch, donor, shelter, shared tracking, driver wizard, proof capture, location, storage, realtime, notification, dispatch-data, tracking, and Phase 6 E2E script files; updated `App.jsx`, `RoleDashboard.jsx`, `index.css`, `App.css`, `useDriverPickups.js`, and `supabase/schema.sql`.
- **Database/Supabase changes:** Added delivery proof fields, notification events/RLS/trigger, admin driver-assignment RPC, pickup status trigger integration, and supporting dispatch policies.
- **Validation:** `npm run lint` and `npm run build` pass; lint retains only pre-existing warnings in `AuthContext.jsx`, `ThreeCanvas.jsx`, and the existing navigation effect. Static file, route, SQL, and diff checks pass. The E2E harness is available at `scripts/phase6-e2e-test.js`.
- **External actions required:** Run the latest `supabase/schema.sql`, create/configure the public `pickup-proofs` Storage bucket, enable Realtime for `pickups`, `drivers`, and `notification_events`, and run the E2E script with `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
- **Remaining work:** Live 12-step Supabase test, browser/mobile keyboard and screen-reader audit, and production console verification require configured external Supabase credentials and test accounts.
- **Commit:** `79e5259` (`Phase 6: Pickup, Driver & Dispatch System complete`).

### 2026-09-24 - Driver workspace relationship fix

- **Goal:** Fix the existing Driver Workspace error caused by querying nonexistent `drivers.user_id` without starting new Phase 6 work.
- **Files changed:** `src/components/driver/DriverDashboard.jsx` and `memory.md`.
- **Database/Supabase changes:** None; the existing `drivers.profile_id` relationship and `available` column are used.
- **Validation:** No `drivers.user_id` or driver-component `user_id` references remain; `npm run lint` and `npm run build` pass with existing non-blocking warnings.
- **External actions required:** Test with an authenticated driver account and confirm the owned `public.drivers` row and availability update in Supabase.
- **Remaining work:** Live driver-account verification only. No dispatch, assignment, tracking, maps, or notification changes were made.

### 2026-09-24 - Driver profile setup

- **Goal:** Fix the missing `public.drivers` row for authenticated users with `profiles.role = 'driver'`.
- **Files changed:** `src/components/driver/DriverDashboard.jsx`, `src/App.css`, and `memory.md`.
- **Database/Supabase changes:** None. Existing `drivers.profile_id` ownership and driver insert RLS are used; no `drivers.user_id` column or new table was added.
- **Behavior:** Missing driver rows now show a setup form prefilled from `profiles.name` and `profiles.phone`; the form requires name, phone, and vehicle type, inserts `profile_id = auth.uid()` with `available = false`, checks for an existing row first, and transitions into the existing workspace without logout.
- **Validation:** No driver-component `user_id` references remain; `npm run lint` and `npm run build` pass with existing non-blocking warnings.
- **External actions required:** Test with a real authenticated driver account and verify the row, ownership, availability toggle, refresh, logout, and login in Supabase.
- **Remaining work:** Live driver-account verification only; no dispatch or other Phase 6 workflow changes were made.

### 2026-09-25 - Phase 6 migration and Phase 7 live tracking & logistics

- **Goal:** Implement live GPS location tracking, Leaflet scoped logistics maps, driver location streaming, and Phase 6/7 database migrations.
- **Files changed:** `supabase/migrations/004_phase6_pickup_workflow.sql`, `supabase/migrations/005_phase7_live_tracking.sql`, `src/components/shared/PickupLogisticsMap.jsx`, `src/components/dispatch/LiveMapView.jsx`, `src/hooks/usePickupTracking.js`, `src/lib/realtime.js`, `src/App.jsx`, `memory.md`.
- **Database/Supabase changes:**
  - Added `004_phase6_pickup_workflow.sql` and `005_phase7_live_tracking.sql` for pickup transitions, GPS latitude/longitude streaming, and telemetry logs.
  - Aligned queries with schema foreign keys (`pickups.donation_id -> donations.id` and `donations.donor_id`).
- **Behavior:**
  - Added Leaflet interactive mapping for pickup origin, shelter destination, and active courier location.
  - Integrated `subscribeToDriver` and `subscribeToPickup` in `src/lib/realtime.js` for live position updates without polling.
  - Realtime state synchronizes driver markers, ETA, temperature, and route progress.
- **Validation:** `npm run lint` passes (0 errors, 7 non-blocking warnings). `npm run build` succeeds in 418ms.
- **Remaining work:** Apply migrations `004` and `005` in Supabase SQL editor and test end-to-end GPS position updates with an authenticated driver session.

