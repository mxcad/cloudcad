# Frontend CSS Z-Index Layer System

Establish a single source of truth (`Z_LAYERS` constants) for all z-index values in the frontend, and add dedicated portal container `<div>` elements in `index.html` to prevent future DOM nesting issues.

**Considered Options**

- **CSS `@layer` + Tailwind plugin.** Rejected: overkill for the problem domain — `@layer` solves CSS cascade conflicts, not z-index numerical chaos or DOM mounting issues. Tailwind v4 compatibility uncertain.
- **Ad-hoc `z-index: 99999` per component (status quo).** Rejected: no discoverability, constant conflicts, every new component re-invents the stack.
- **Simple constant enum + index.html portal roots (chosen).** One file (`constants/layers.ts`), minimal ceremony, prevents both numerical conflicts and future DOM nesting mistakes.

**Consequences**

- All new z-index usage MUST reference `Z_LAYERS` constants; raw numbers are a code-review reject.
- `index.html` now contains `<div id="modal-root">` and `<div id="toast-root">` — portal targets for overlays and notifications respectively.
- Existing raw z-index values (35+ occurrences) remain functional but should be migrated incrementally to `Z_LAYERS` as files are touched.
- `ToastContainer` (100010) and `Tooltip` (99999) hardcoded values become de-facto aliased by `Z_LAYERS.TOAST` / `Z_LAYERS.TOOLTIP`, but are not changed in this ADR to avoid unnecessary churn.