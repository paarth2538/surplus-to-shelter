# Surplus-to-Shelter

> **Rescue good food before the clock runs out.**

Surplus-to-Shelter is a real-time food rescue coordination platform that connects commercial food donors, volunteer couriers, and community shelters before safe consumption windows close.

Built for the **AmiHacks Track A: NGO / Social Impact** hackathon, the project turns a time-sensitive food donation into a coordinated, verifiable delivery: intake, spoilage-risk assessment, shelter matching, route planning, courier dispatch, and proof of handoff.

![Project status](https://img.shields.io/badge/status-hackathon%20MVP%20in%20development-059669?style=for-the-badge)
![Built with Next.js](https://img.shields.io/badge/Next.js-App%20Router-0f172a?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?style=for-the-badge&logo=typescript&logoColor=white)
![License](https://img.shields.io/badge/license-TBD-slategray?style=for-the-badge)

> **Current status:** This repository is currently in the product-definition and architecture phase. The implementation is planned as a Next.js full-stack application and will be delivered in the phases documented below.

## The Problem

Every day, restaurants, caterers, hotels, cafeterias, and bakeries discard safe, prepared food while nearby shelters face unpredictable shortages. The limiting factor is usually not supply or demand. It is the narrow window between preparation and spoilage, combined with the lack of coordination between the people who have food, the people who can transport it, and the places that can receive it.

Surplus-to-Shelter addresses that coordination gap with a fast, operational workflow designed for real-world constraints:

- A donor should be able to post surplus in under 60 seconds.
- A courier should see the most urgent nearby rescue first.
- A shelter should control what it can accept and when.
- Every delivery should have a clear status and a verifiable handoff.

## What Makes It Different

### AI-assisted urgency, with a reliable fallback

The Gemini-powered Spoilage Risk Engine evaluates food category, storage state, preparation time, and environmental conditions. It returns a risk score, a dispatch priority, and a short operational brief for the courier.

If Gemini is unavailable or slow, a deterministic heuristic engine keeps the rescue flow moving. The platform must never turn an API outage into wasted food.

### Matching based on more than distance

Donations are matched against shelters using a combination of:

- Distance and estimated driving time
- Current intake status and capacity
- Dietary compatibility
- Refrigeration and handling requirements
- Donation quantity and expected headcount

### A complete chain of custody

The rescue lifecycle is explicit and auditable:

```text
AVAILABLE -> MATCHED -> CLAIMED -> EN_ROUTE_PICKUP -> PICKED_UP
          -> EN_ROUTE_DROPOFF -> DELIVERED
```

Pickup confirmation, optional photos, and a shelter OTP or digital sign-off create a lightweight proof-of-handoff record.

## Core User Experiences

| Role | Primary experience | Outcome |
| --- | --- | --- |
| **Food donor** | Post prepared surplus, storage conditions, dietary tags, quantity, and pickup deadline | Food is listed quickly with clear safety information |
| **Volunteer courier** | Browse urgent rescues, claim a run, follow the route, and confirm handoff | A volunteer can complete a rescue with minimal coordination overhead |
| **Shelter coordinator** | Set intake availability, capacity, dietary requirements, and refrigeration status | Shelters receive useful food they are prepared to accept |
| **Civic operations admin** | Monitor active rescues, overdue critical listings, and impact metrics | NGOs can coordinate coverage and demonstrate measurable impact |

## Planned MVP Features

- **60-second donor intake** with food safety attestation
- **Gemini Spoilage Risk Engine** with `P0`, `P1`, and `P2` dispatch priorities
- **Automatic shelter matching** using dietary compatibility, capacity, and proximity
- **OpenStreetMap and Leaflet map** with donor, shelter, and courier markers
- **OSRM route calculation** with Haversine distance fallback
- **Volunteer rescue marketplace** sorted by urgency and distance
- **Delivery state machine** from listing to verified handoff
- **Public impact dashboard** for rescued meals, food weight, and estimated `CO2e` avoided
- **Mobile-first interface** designed for couriers working outdoors
- **Accessibility target:** WCAG 2.1 AA, high contrast, and touch targets of at least `44 x 44 px`

## Product Flow

```mermaid
flowchart LR
    A[Donor posts surplus] --> B[Gemini assesses risk]
    B --> C[System matches a shelter]
    C --> D[Courier claims rescue]
    D --> E[OSRM route to donor]
    E --> F[Pickup confirmed]
    F --> G[Route to shelter]
    G --> H[OTP or signature handoff]
    H --> I[Impact dashboard updated]
```

## Architecture

Surplus-to-Shelter is designed as a modular monolith so the hackathon MVP can move quickly without sacrificing clear boundaries.

```mermaid
flowchart TD
    UI[Responsive Web / PWA] --> APP[Next.js App Router]
    APP --> AUTH[Role-based access]
    APP --> MATCH[Geo-matching engine]
    APP --> AI[Gemini risk engine]
    APP --> ROUTE[OSRM routing client]
    APP --> DB[Prisma + PostgreSQL]
    AI --> GEMINI[Google Gemini API]
    ROUTE --> OSRM[OSRM]
    UI --> MAP[Leaflet + OpenStreetMap]
```

### Technology stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Application | Next.js App Router, TypeScript | Full-stack web application and server actions |
| UI | Tailwind CSS, Lucide React | Responsive, accessible interface and consistent visual language |
| Maps | Leaflet, React-Leaflet, OpenStreetMap | Open mapping and live rescue visualization |
| Routing | OSRM | Driving distance, duration, and route geometry |
| AI | Google Gemini via `@google/genai` | Spoilage scoring and courier dispatch briefs |
| Data | PostgreSQL, Prisma | Typed persistence for users, donations, shelters, trips, and verification logs |
| Validation | Zod | Runtime validation for forms, actions, and external responses |
| Deployment | Vercel or Docker | Low-friction deployment for the MVP |

## Repository Guide

The project specifications are kept deliberately close to the implementation plan:

| Document | Contents |
| --- | --- |
| [PRD.md](PRD.md) | Problem, personas, requirements, scope, and success criteria |
| [Architecture.md](Architecture.md) | System architecture, data model, journeys, and resilience strategy |
| [design.md](design.md) | Visual language, tokens, accessibility, layout, and component guidance |
| [phases.md](phases.md) | Six delivery phases from foundation to hackathon demo readiness |
| [rules.md](rules.md) | Engineering standards, approved dependencies, and security boundaries |

The planned application structure is:

```text
app/          Next.js routes, dashboards, server actions, and API handlers
components/   Shared UI, maps, donor, courier, shelter, and civic components
lib/          Database, Gemini, OSRM, matching, and utility services
types/        Shared TypeScript DTOs and domain types
prisma/       Database schema and realistic demo seed data
public/       Map markers and static assets
```

## Getting Started

The application scaffold is not yet committed to this repository. Once the implementation phase begins, local setup will follow this path:

### Prerequisites

- Node.js 20 or newer
- npm
- PostgreSQL, or a hosted Supabase PostgreSQL database
- A Google Gemini API key for AI scoring

### Planned local setup

```bash
git clone https://github.com/<your-username>/surplus-to-shelter.git
cd surplus-to-shelter
npm install
cp .env.example .env.local
npx prisma generate
npx prisma db seed
npm run dev
```

Expected environment variables:

```env
DATABASE_URL="postgresql://USER:PASSWORD@HOST:5432/surplus_to_shelter"
GEMINI_API_KEY="your-gemini-api-key"
```

Keep secrets server-side. Do not prefix database credentials or the Gemini key with `NEXT_PUBLIC_`.

## Hackathon Demo Script

The intended end-to-end demo fits into a short judging session:

1. A caterer posts 120 hot meal portions with a near-term pickup deadline.
2. Gemini assigns a spoilage risk score, `P0` priority, and a concise courier brief.
3. The matching engine suggests an accepting shelter with compatible dietary requirements.
4. A volunteer claims the rescue and views the OSRM route on the map.
5. The courier confirms pickup, then completes the shelter handoff with a four-digit OTP.
6. The public dashboard updates rescued meals, active deliveries, and estimated emissions avoided.

## Resilience and Safety

Food rescue is time-sensitive, so the system is designed to degrade gracefully:

- Gemini failures fall back to deterministic perishability heuristics.
- OSRM failures fall back to Haversine distance and an estimated urban travel time.
- Server-side validation protects form and API boundaries.
- Role-based access separates donor, courier, shelter, and admin workflows.
- Public views avoid exposing resident personally identifiable information.
- External API keys and database credentials remain server-side.

## Roadmap

- [ ] Foundation: Next.js, TypeScript, Tailwind, Prisma, and seeded demo data
- [ ] Donor and shelter portals
- [ ] Gemini risk scoring and smart shelter matching
- [ ] Leaflet map and OSRM route visualization
- [ ] Courier dispatch and verified delivery handoff
- [ ] Public impact dashboard and demo reset tooling
- [ ] Production deployment and accessibility audit
- [ ] Post-hackathon: PWA polish, temperature sensor integrations, and logistics partner APIs

## Impact Model

The initial impact dashboard estimates:

- **Meal equivalents:** one portion is approximately `0.42 kg` of food
- **Food rescued:** total reported kilograms diverted from landfill
- **Emissions avoided:** approximately `2.5 kg CO2e` per kilogram of food rescued
- **Operational reach:** active volunteers, completed rescues, and shelter distribution coverage

These are estimates for civic reporting and should be refined with local food-waste and emissions data before production use.

## Contributing

Contributions should preserve the project’s focus on speed, safety, dignity, and operational clarity. Before opening a pull request:

1. Keep secrets out of source control.
2. Validate inputs at every server boundary.
3. Preserve Gemini and OSRM fallback behavior.
4. Keep courier interactions usable on a small screen and in bright sunlight.
5. Update the relevant project specification when behavior or architecture changes.

## Acknowledgements

Surplus-to-Shelter is built around open and accessible infrastructure from the OpenStreetMap and OSRM communities, with Google Gemini supporting the perishability reasoning workflow.

---

**Surplus-to-Shelter** is a hackathon project with a practical goal: make the last few hours of a food donation count.
