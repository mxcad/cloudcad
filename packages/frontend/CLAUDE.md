# CLAUDE.md

Frontend-specific instructions. See root CLAUDE.md for project-wide guidance.

## Testing (Vitest, not Jest)

```bash
pnpm test              # vitest run
pnpm test:watch        # Watch mode
pnpm test:ui           # Vitest UI mode
pnpm test:coverage     # With coverage report
```

Uses `happy-dom` by default; `jsdom` also available.

## Type Checking

```bash
pnpm type-check        # tsc --noEmit (Vite handles bundling, tsc only for types)
```

**tsconfig quirks:** `isolatedModules: true` (Vite requirement), `moduleResolution: "bundler"`, `jsx: "react-jsx"`, `useDefineForClassFields: false`, `noEmit: true`.

## API Client

Types in `src/types/api-client.ts` are **auto-generated** from root `swagger_json.json` via `openapicmd` (installed as devDependency). Regenerate from project root:

```bash
pnpm generate:api-types
```

The script `scripts/generate-api-types.js` fetches from running backend (`http://localhost:3001/api/docs-json`) or falls back to local `swagger_json.json`.

HTTP clients are in `src/services/*Api.ts` (axios + openapi-client-axios). `mxcadManager.ts` is NOT an API service — it manages the CAD engine lifecycle (see below).

## CAD Engine (Critical)

- `mxcad-app` npm package creates its own Vue 3 + Vuetify app internally. React communicates via `mxcadManager.ts` — singleton, creates CAD container at `document.body` level
- **Never** instantiate `MxCADView` outside `mxcadManager.ts`
- `mxcad-app` is excluded from Vite's `optimizeDeps` (too large, loaded dynamically)
- CAD editor (`CADEditorDirect.tsx`) renders as a global overlay in `App.tsx` outside `<Routes>` using `visibility` + `z-index`

## Vite Configuration

- Dev server: port from `FRONTEND_PORT` env or 3000, proxies `/api` → `BACKEND_URL` (default `http://localhost:3001`)
- Tailwind CSS v4 with Vite plugin (no PostCSS config needed)
- **Aggressive chunk splitting** in `vite.config.ts`: react, radix-ui, recharts, form libs, zustand, axios, mxcad-app all get separate vendor chunks
- `chunkSizeWarningLimit: 1000` (1MB)
- Build uses `node --max-old-space-size=8192` (memory for large builds)

## State Management (Zustand)

3 stores: `fileSystemStore.ts`, `notificationStore.ts`, `uiStore.ts`. Prefer local state or derived state before adding new stores.

## UI Conventions

- **Radix UI** primitives: avatar, dialog, dropdown-menu, label, select, slot
- **Tailwind CSS v4** for styling (utility classes, no custom CSS files)
- **Lucide** icons
- **Class-variance-authority** + `clsx` + `tailwind-merge` for component variants
- **react-hook-form** + **zod** for form validation
- **Shadcn/ui** component patterns in use

## Path Aliases

`@/*` maps to `./src/*` (configured in tsconfig.json and vite.config.ts). Use for all imports.

## File Organization

```
src/
├── pages/           # Route-level page components
├── components/      # Shared UI components
├── services/        # API clients + mxcadManager
├── hooks/           # React hooks
├── stores/          # Zustand stores
├── contexts/        # AuthContext, ThemeContext, NotificationContext
└── types/           # Generated API types
```
