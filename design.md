# Design System

## Visual Direction

The product should feel like a calm operations room with human warmth: precise enough for dispatch work, bright enough to communicate hope, and never clinical or alarmist. Use generous white space, soft lavender surfaces, cobalt actions, emerald success cues, and amber attention cues. The 3D courier van is the signature visual object and should remain the first-viewport anchor on desktop.

## Colour Palette

These values match the current token system in `src/index.css`.

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Primary action | `--primary-accent` | `#2b60ec` | Main buttons, active links, route emphasis |
| Primary hover | `--primary-hover` | `#1d4ed8` | Hover and pressed states |
| Deep primary | `--primary` | `#0046cc` | Strong emphasis and future charts |
| Success / care | `--secondary-emerald` | `#10b981` | Delivered, fulfilled, safe temperature |
| Success surface | `--secondary-light` | `#ecfdf5` | Low-emphasis success backgrounds |
| Tertiary indigo | `--tertiary-indigo` | `#6366f1` | Stories, secondary visualization accents |
| Attention amber | local accent | `#f59e0b` | Live banner and medium urgency |
| Danger | status accent | `#ef4444` | High urgency or failed delivery only, never decoration |
| Page background | `--bg-page` | `#faf8ff` | Overall canvas |
| Surface | `--bg-surface` | `#ffffff` | Cards, navigation, modal |
| Low surface | `--surface-container-low` | `#f2f3ff` | Muted panels and hover states |
| Main text | `--text-main` | `#0f172a` | Headings and primary values |
| Muted text | `--text-muted` | `#434655` | Body copy and descriptions |
| Subtle text | `--text-subtle` | `#64748b` | Metadata and helper text |
| Light outline | `--outline-light` | `#e2e8f0` | Dividers and quiet borders |

Use white space and border contrast before adding stronger color. Status colors must always be paired with text or an icon.

## Fonts

- **Headline:** Plus Jakarta Sans, weight 600-800. Use for brand, headings, metrics, and primary action labels.
- **Body:** Inter, weight 400-600. Use for descriptions, metadata, form labels, and navigation.
- The current CSS references these families. Production should load them intentionally through the chosen hosting strategy, with a system sans fallback for offline or font-load failure.

## Typography Scale

| Level | Size | Line height | Weight | Use |
| --- | --- | --- | --- | --- |
| Display | 62px desktop / 42px mobile | 1.08 | 800 | Hero headline only |
| H1 | 40px | 1.12 | 800 | Page-level heading |
| H2 | 28px | 1.2 | 750 | Section heading |
| H3 | 20px | 1.3 | 700 | Card and modal heading |
| Body large | 18px | 1.6 | 400-500 | Hero supporting copy |
| Body | 15-16px | 1.5 | 400-500 | Standard copy |
| Label | 11-13px | 1.3 | 700 | Kicker, status, metadata |

Do not use negative letter spacing. Keep line lengths near 55-75 characters for explanatory copy and preserve readable wrapping on narrow screens.

## Spacing and Shape Rules

- Use a base spacing unit of 4px; common gaps are 8, 12, 16, 24, 32, 48, and 64px.
- Use `--radius-sm` for controls and compact surfaces, `--radius-md` to `--radius-xl` for major feature panels, and `--radius-full` only for pills, avatars, and segmented controls.
- Keep interactive targets at least 44px high on touch layouts.
- Use restrained shadows from the existing token set. Depth should distinguish the 3D stage, modal, and operational cards without making every section float.
- On mobile, stack hero content before the 3D stage, keep the dispatch filter horizontally scrollable, and prevent CTA labels from being clipped.
- Respect `prefers-reduced-motion`: disable decorative particle motion and nonessential transitions while preserving state changes and readable telemetry.
