# Engineering Rules

## Approved Uses and Conventions

- Use React functional components and hooks, with state kept close to the feature that owns it.
- Keep Vite as the build tool and use the existing npm scripts: `dev`, `build`, `lint`, and `preview`.
- Use Three.js for the existing courier visualization. Keep scene setup, animation, resize handling, and disposal isolated in `src/components/ThreeCanvas.jsx` or a future 3D module.
- Reuse the design tokens in `src/index.css` before adding new colors, shadows, radii, or font families.
- Prefer semantic HTML, labeled form controls, keyboard-operable buttons, and visible focus states.
- Keep operational state explicit: use named statuses such as `Completed`, `Active Van`, and `Checking` rather than relying on color alone.
- Keep user-facing copy concrete, humane, and operationally useful. Avoid vague sustainability claims without a measurable source.
- Keep sample data visibly separate from production API data. Do not silently mix mock records into live metrics.
- Run `npm run lint` and `npm run build` after meaningful changes.

## Avoid

- Do not add a new UI framework, state library, router, icon library, analytics SDK, or API client without approval.
- Do not replace the established cobalt, emerald, indigo, amber, and soft-lavender visual language with a generic dashboard theme.
- Do not put business logic, large data tables, or additional Three.js scene construction into `main.jsx`.
- Do not use color as the only indication of urgency, route status, temperature safety, or fulfillment state.
- Do not use fake live metrics in production screens. Simulated values must be labeled as demo data or removed.
- Do not store secrets, access tokens, personal addresses, or user records in source files or local storage.
- Do not introduce a database schema, migration, authentication model, or cloud resource as an incidental implementation detail.
- Do not make unrelated formatting or dependency upgrades while implementing a feature.

## Error Handling Standards

- Validate all form fields at the boundary and show an actionable inline message beside the invalid field.
- Preserve entered form values when submission fails; never clear a form on an unsuccessful request.
- Disable or otherwise guard duplicate submissions while a request is pending.
- Treat network failures, timeouts, permission errors, validation errors, and unavailable telemetry as separate user-visible states.
- Use safe fallback content when WebGL is unavailable, the browser prefers reduced motion, or a live data source is stale.
- Never expose stack traces, secrets, raw server responses, or internal identifiers in the UI.
- Log unexpected client errors with enough context to reproduce them, but redact addresses, contact details, and other personal data.
- Mark timestamps with timezone or relative-time rules consistently; do not imply real-time freshness without a recorded update time.

## AI-Generated Code Boundaries

The AI agent may refactor components, add focused UI behavior, write tests, and update documentation within the approved architecture. It may not autonomously:

- add a new dependency or change a dependency major version;
- change database tables, migrations, seed data, or data retention rules;
- create or modify authentication, authorization, secrets, role permissions, or production cloud resources;
- change an API contract, event schema, telemetry meaning, or delivery-status vocabulary;
- claim that sample metrics, routes, recipients, or stories are real;
- remove accessibility behavior or the WebGL/reduced-motion fallback;
- delete existing user changes or rewrite unrelated files.

Before any of those changes, the agent must explain the impact, identify the affected files or services, and get explicit approval.
