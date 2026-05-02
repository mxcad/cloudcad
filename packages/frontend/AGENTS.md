# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

React frontend application providing CAD editor UI, project management, user authentication, and real-time collaboration features.

## STRUCTURE

```
packages/frontend/
├── src/
│   ├── assets/           # Static assets (images, icons, etc.)
│   ├── components/       # Reusable UI components
│   ├── hooks/            # Custom React hooks
│   ├── stores/           # Zustand state management stores
│   ├── utils/            # Utility functions and helpers
│   ├── types/            # TypeScript types and interfaces
│   ├── api/              # API client and service functions
│   ├── routes/           # Application routes and layout
│   └── main.tsx          # Application entry point
```

## WHERE TO LOOK

| Task               | Location                           | Notes                                               |
| ------------------ | ---------------------------------- | --------------------------------------------------- |
| UI Components      | src/components/                    | Reusable UI elements (buttons, modals, forms, etc.) |
| Custom Hooks       | src/hooks/                         | Custom React hooks for state and side effects       |
| State Management   | src/stores/                        | Zustand stores for global state                     |
| API Integration    | src/api/                           | Axios instance and service functions                |
| Route Components   | src/routes/                        | Page components and route definitions               |
| CAD Editor         | src/components/cad-editor/         | CAD editor specific components                      |
| File Operations    | src/components/file-manager/       | File tree and operations                            |
| User Management    | src/components/user-management/    | User and role management UI                         |
| Project Management | src/components/project-management/ | Project creation and settings                       |

## CONVENTIONS

- **Components**: Function components with hooks, PascalCase naming
- **State**: Zustand stores with immutable updates
- **Forms**: React Hook Form with Zod validation
- **API Calls**: Async/await with error handling, using axios instance
- **TypeScript**: Strict mode, no `any` types, proper typing for props and state
- **Imports**: Absolute paths using `@/` alias (configured in tsconfig.json)
- **Event Handling**: Prevent default where needed, use camelCase for handlers
- **Accessibility**: Use semantic HTML, proper ARIA labels, keyboard navigation
- **Performance**: Use `useMemo`, `useCallback` for expensive operations

## ANTI-PATTERNS (THIS PROJECT)

- Using `any` type in TypeScript files
- Defining components inside components (causes remounting)
- Mutating state directly (must use Zustand setters)
- Using index.ts barrel exports excessively
- Not cleaning up subscriptions or event listeners
- Doing heavy computations in render (should use useMemo)
- Ignoring React keys in lists
- Using `div` for semantic elements when better options exist
- Not handling loading and error states in API calls

## UNIQUE STYLES

- **State Management**: Zustand stores with selectors for fine-grained reactivity
- **API Layer**: Centralized API service with interceptors for auth and error handling
- **Component Library**: Reusable components with consistent styling and behavior
- **CAD Integration**: Specialized components for mxcad assembly integration
- **File System**: Tree view with drag-and-drop for file organization
- **Real-time Updates**: Subscription-based updates for collaborative editing

## COMMANDS

```bash
# Frontend specific (in packages/frontend)
pnpm dev              # Start development server (port 5173)
pnpm build            # Build production version
pnpm test             # Run Vitest tests
pnpm test:ui          # Run UI mode tests
pnpm test:coverage    # Generate test coverage report
pnpm type-check       # Run TypeScript type checking
```

## NOTES

- **Authentication**: JWT tokens stored in localStorage, refresh token handled automatically
- **Real-time Collaboration**: WebSocket connection to cooperation service on port 3091
- **CAD Editor**: Based on mxcad assembly, requires proper initialization and cleanup
- **File Upload**: Uses chunked upload for large files, progress tracking
- **Environment Variables**: In `.env.local`:
  - `VITE_APP_NAME`: Application title
  - `VITE_API_BASE_URL`: API gateway path
  - `VITE_APP_COOPERATE_URL`: WebSocket service URL
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge)
- **Responsive Design**: Mobile-first approach with Tailwind breakpoints
