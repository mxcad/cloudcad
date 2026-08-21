# CLAUDE.md

Frontend-specific instructions. See root AGENTS.md for project-wide guidance and packages/frontend/AGENTS.md for the detailed frontend guide.

## CRITICAL: State Management (ADR-0030)

**Never use module-level mutable variables for shared state.** Server state belongs in `@tanstack/react-query` (query keys via the `queryKeys` factory in `src/lib/queryKeys.ts`), client state in `useState` / Context / Zustand by scope. Non-React code reads/writes Zustand via `useXStore.getState()`.

## CRITICAL: API Calls (ADR-0034)

**Never call backend APIs with bare `fetch()` / `fetchWithAuth()` / `getCommonHeaders()`.** All API calls go through `@cloudcad/api-sdk` (re-exported at `src/api-sdk/index.ts`). Only 4 documented exemptions exist (static brand config, generic config loader, arbitrary external image URLs, SSE progress). Multipart: pass a plain object as `body: { file, hash, ... } as never` — NEVER a native `FormData` (`Object.entries(FormData)` is empty, all fields are silently dropped; see avatar fix b1cd0d56). Blob downloads go through `src/utils/download.ts` (the only place allowed to `as Blob`).

## CRITICAL: Dependency Direction (ADR-0028)

Three layers, dependencies only point "downwards": L1 基础设施 (`constants/ types/ utils/ lib/ languages/ config/ api-sdk/ styles/`) ← L2 核心业务 (`services/ stores/ contexts/` root `hooks/`) ← L3 业务编排 (`pages/ components/`). Run `pnpm depcruise` to verify; keep `components/ui/` free of business dependencies.

## CRITICAL: Module Entry (ADR-0029)

Directories with internal structure must have an `index.ts` as their single entry — external consumers import from the entry, never `dir/sub/file` deep paths. Hooks live by ownership: root `hooks/` (shared) vs `pages/*/hooks` (page-private) vs `components/*/hooks` (component-private); never import private hooks across directories.

## Testing (Vitest)

```bash
pnpm test           # vitest run
pnpm test -- --run src/Some.test.ts  # Single file
pnpm test -- --run src/Some.test.tsx  # Single file (React)
pnpm test:coverage  # With coverage
```

CI runs type-check only; lint/format/type-check are the gate for local work.

## Linting & Formatting

- ESLint for linting (root config); Prettier for formatting
- `pnpm lint` / `pnpm lint:fix`
- `pnpm format` / `pnpm format:check`

## TypeScript Config

`tsconfig.json` — `tsc --noEmit` via `pnpm type-check`. New code should satisfy strict checks as far as practical; the config is not fully strict yet, don't loosen it further.

## Architecture Notes

- **Pages** are single files under `src/pages/` or directories (`<Name>/index.tsx` + `hooks/` + `components/` + `types.ts`) once they exceed ~300 lines or extract their first hook (ADR-0033, hard gate 400 lines)
- **Styles** (ADR-0032): theme tokens are the single source of truth (`theme.css`: `--bg-* --text-* --primary-* --border-*`…); component styles via CSS Modules (`.module.css`) or component `<style>`; Tailwind for layout utilities only; inline `style` for dynamic values only; **never** JS template-string CSS, never `--color-*` variables
- **Z-index**: global overlays use `Z_LAYERS` constants (`src/constants/layers.ts`); small local values allowed with a comment
- **UI reuse**: check `src/components/ui/` before building a new component
- **CAD engine**: `mxcadManager` singleton; `CADEditorDirect.tsx` keeps the WebGL context alive across routes via visibility + z-index; events via `window.CustomEvent` (`mxcad-save-required`, `mxcad-file-opened`…). See `cad-engine-integration` skill.
- **Replaceability** (ADR-0031): do not build interfaces/abstractions preemptively — configuration first; only a real second implementation opens the escape hatch at a module entry

## i18n (VoerkaI18n) — quick rules

- `t("中文")` wraps UI text; `pnpm i18n:extract` then `pnpm i18n:compile -t`
- **Variable interpolation must pass vars as the second argument** — `t('剩余 {days} 天', { days: ... })`, never `.replace()` on the translated string
- Custom/DB-driven strings go into `translates/messages/db-strings.json` (never `default.json`, which is regenerated)
- Language sync with mxcad-app: `CADEditorDirect.tsx` + `LanguageSwitcher.tsx` (two-way)

## Quick Commands

```bash
pnpm dev            # Vite dev server (port 3000)
pnpm build          # Vite build
pnpm type-check     # tsc --noEmit
pnpm depcruise      # dependency-layer gate (ADR-0028)
```
