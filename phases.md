# Development Phases

## Phase 1: Experience Baseline

**Goal:** Establish the trustworthy visual and interaction baseline already represented by the prototype.

**Deliverable:** Responsive landing experience with the announcement banner, navigation, hero, CTA actions, impact telemetry, dispatch cards, wishlists, footer, and accessible pickup modal using clearly labeled sample data.

## Phase 2: Component and State Decomposition

**Goal:** Make the single-page prototype maintainable without changing its behavior.

**Deliverable:** Feature components for navigation, hero, telemetry, dispatches, wishlists, story content, footer, and pickup/request forms; centralized domain types/constants; isolated 3D scene lifecycle; lint and build checks passing.

## Phase 3: Donor and Shelter Workflow Contracts

**Goal:** Define the durable workflows before adding persistence.

**Deliverable:** Approved request and dispatch data contracts covering donor, shelter, cargo category, quantity, pickup address, urgency, status history, ETA, and audit timestamps. Include validation rules and error-state designs.

## Phase 4: Backend and Persistence

**Goal:** Replace local submission behavior with durable, permission-aware workflows.

**Deliverable:** API endpoints and database migrations for pickup requests, supply requests, organizations, wishlists, dispatches, and delivery status history. No production schema changes should begin before the contracts are approved.

## Phase 5: Live Operations

**Goal:** Give dispatchers and coordinators reliable current-state visibility.

**Deliverable:** Authenticated dispatch workspace, server-backed filters, status transitions, telemetry freshness indicators, delivery verification, and realtime or polling updates with stale-data handling.

## Phase 6: Stories, Causes, and Impact Reporting

**Goal:** Connect operational activity to human-readable impact without compromising privacy.

**Deliverable:** Cause and story content model, approved media workflow, privacy review, verified impact aggregation, and public-facing story/impact views.

## Phase 7: Production Readiness

**Goal:** Prepare the application for safe public operation.

**Deliverable:** Azure Static Web Apps deployment, API and database configuration, managed secrets, role-based access, Application Insights, accessibility review, responsive browser testing, WebGL fallback testing, and documented rollback/runbook steps.
