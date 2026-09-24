# Architecture

## App / Website Flow

The product is a single-page React experience with a shared shell and several focused states rather than separate routes in the current prototype.

1. **Arrival and orientation:** The live-network banner and hero explain the service, show the primary value proposition, and offer Schedule a Pickup as the dominant action.
2. **Choose an intent:** A visitor can schedule a donation, request supplies, explore causes, read the story, or inspect live dispatches.
3. **Understand the operating model:** The how-it-works content explains pickup, route coordination, and delivery verification.
4. **Inspect network activity:** Dispatch cards and category filters show what is moving now. Selecting a tracking action switches the 3D scene and tracking state.
5. **Review needs:** Shelter wishlists show where specific goods can make an immediate difference.
6. **Convert or return:** Calls to action reopen the pickup/request modal, while footer navigation returns users to the dispatch or story content.

### Primary User Journeys

- **Donor:** Hero or banner -> Schedule a Pickup -> enter business, category, crate count, and address -> receive confirmation -> production status page.
- **Dispatcher:** Track & Dispatches -> filter active deliveries -> inspect ETA, cargo, and temperature status -> update or verify a route.
- **Shelter coordinator:** Request Supplies -> describe the organization and need -> set urgency -> receive a request status and matching donor activity.
- **Supporter:** Explore Causes or Our Story -> read impact and community context -> view current needs -> choose a donation or sharing action.

## Current Folder & File Structure

```text
/
├── index.html                 # Vite HTML entry point
├── package.json               # Scripts and dependencies
├── vite.config.js             # Vite configuration
├── public/
│   ├── favicon.svg
│   ├── icons.svg
│   ├── screen-home.html       # Static visual reference/export
│   ├── screen-platform.html
│   ├── screen-stories.html
│   ├── screen-tracking.html
│   └── screenshots/            # Referenced image assets
├── src/
│   ├── main.jsx               # React root mounting
│   ├── App.jsx                # Page shell, local state, sample data, modal
│   ├── App.css                # Component and page styling
│   ├── index.css              # Global tokens and reset
│   ├── assets/                # Imported source assets
│   └── components/
│       └── ThreeCanvas.jsx    # Three.js scene and simulated telemetry
├── supabase/
│   └── schema.sql             # Pickup request table, checks, RLS, and index
├── .env.example               # Required public Vite/Supabase variables
└── documentation/
    └── (future feature-specific docs)
```

As the app grows, split `App.jsx` into feature components, move sample data into typed domain modules, and introduce route-level pages only when navigation requires deep links or independent loading states.

## Tech Stack

### Current implementation

- **Language:** JavaScript with JSX, ES modules
- **Frontend:** React 19.2
- **Build and dev server:** Vite 8
- **3D:** Three.js 0.186 with a direct Three.js scene; `@react-three/fiber` is installed but is not currently the rendering boundary
- **Quality:** Oxlint
- **Data:** Local arrays for dispatches and wishlists; pickup submissions write to Supabase when configured
- **Database client:** `@supabase/supabase-js`
- **Hosting:** Not deployed; runs through Vite locally

### Proposed production target

- **Frontend hosting:** Azure Static Web Apps for the Vite-built React client and preview environments
- **API:** Azure Functions using REST endpoints for pickup requests, supply requests, dispatches, wishlists, and stories
- **Database:** Azure Database for PostgreSQL for durable users, organizations, inventory needs, dispatches, and status history
- **Realtime updates:** Azure SignalR Service or a server-sent-events layer for dispatch and cold-chain telemetry; polling is an acceptable first release fallback
- **File/media storage:** Azure Blob Storage for verified delivery photos and story media, with metadata kept in PostgreSQL
- **Identity:** Microsoft Entra External ID or an equivalent managed identity provider for donor, shelter, and dispatcher roles
- **Observability:** Application Insights for API failures, route latency, telemetry freshness, and user-flow errors

The production services are proposed architecture, not requirements for the current visual prototype. Any backend adoption must preserve the present donor, dispatch, wishlist, and 3D fallback flows.
