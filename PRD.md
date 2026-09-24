# Project Requirements Document

## Overview & Purpose

**surplus2shelter** is a direct-care logistics experience that helps businesses move usable surplus goods to neighborhood shelters with dignity, visibility, and operational clarity. The product turns a one-time donation into a coordinated workflow: a donor schedules a pickup, a courier dispatches the goods, and a shelter receives supplies that match current needs.

The current release is a polished frontend experience with local sample data, simulated telemetry, an interactive 3D courier van, dispatch cards, shelter wishlists, impact metrics, and a pickup-request modal. The pickup modal now supports persistence through Supabase when the project environment is configured; dispatches and wishlists remain demo data until their read models are implemented.

## Targeted Users

- **Business donors:** Grocers, retailers, caterers, and distribution hubs with surplus food, apparel, hygiene supplies, or other useful inventory.
- **Shelter and community coordinators:** Organizations that need to communicate priority supplies and receive reliable delivery updates.
- **Dispatchers and couriers:** Operators who coordinate pickups, monitor active routes, and verify delivery conditions.
- **Community supporters:** Visitors who want to understand the network's impact and discover nearby causes or stories.

## Core Features

### 1. Donor pickup scheduling

A donor can open the shared scheduling flow from the announcement banner, navigation, hero CTA, or lower-page calls to action. The form captures business name, donation category, crate count, and pickup address, then writes a validated `pickup_requests` record through Supabase. The production workflow must add authenticated ownership, dispatch assignment, and status history.

### 2. Live dispatch visibility

The dispatch area shows sample deliveries with donor, shelter recipient, cargo description, status, timing, ETA, and category. Users can filter dispatches by Produce, Warmth, or Food, then move into the tracking view.

### 3. Interactive courier visualization

The hero experience includes a Three.js courier van scene with cargo crates, route pins, lighting, and live-looking telemetry such as speed, temperature, progress, battery, and ETA. The user can switch between the 3D experience, 3D stories, and live-tracking modes.

### 4. Shelter needs and priority requests

A wishlist surface communicates immediate community needs such as fresh produce, thermal blankets, and baby-care kits. Each item includes urgency and fulfillment state so donors can choose useful supplies rather than donating blindly.

### 5. Impact reporting

The experience presents network-level impact metrics, including pounds rescued and delivered, active routes, participating businesses, and delivery reliability. Production metrics must be calculated from verified dispatch and delivery records.

### 6. Cause and story discovery

Navigation exposes Explore Causes and Our Story entry points. These views should help visitors understand the people and organizations served, while preserving a clear path back to donating, requesting supplies, or viewing dispatches.

### 7. Responsive and accessible interaction

The experience must work across desktop and mobile widths, support keyboard navigation and visible focus states, provide meaningful labels for form controls and 3D states, and preserve readable contrast for operational data.

## Success Criteria

- A first-time donor can understand the service and reach pickup scheduling without assistance.
- A dispatcher can identify active, completed, and checking deliveries at a glance.
- A shelter coordinator can communicate a concrete supply need with an urgency level.
- Every production delivery has an auditable donor, recipient, cargo, status history, and timestamp.
- The experience remains useful when 3D rendering is unavailable or reduced-motion preferences are enabled.
