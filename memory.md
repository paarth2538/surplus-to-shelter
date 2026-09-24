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

The latest known Supabase production inspection showed no application tables or views in the public schema. The complete schema is prepared locally in `supabase/schema.sql` but has not been confirmed as executed successfully in Supabase.

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

## Future Task Entry Template

### YYYY-MM-DD - Short task title

- **Goal:**
- **Files changed:**
- **Database/Supabase changes:**
- **Validation:**
- **External actions required:**
- **Remaining work:**
- **Commit:**
