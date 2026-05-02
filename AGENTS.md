# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

CloudCAD is a web-based CAD collaboration platform supporting online editing, version control, and team collaboration.

## STRUCTURE

```
cloudcad/
├── .agents/              # OpenCode agent skills and configurations
├── .claude/              # Claude Code configuration
├── .gitnexus/            # GitNexus code intelligence index
├── apps/                 # Deployable applications
│   ├── backend/          # NestJS backend service (port 3001)
│   └── frontend/         # React frontend application (port 5173)
├── data/                 # Runtime data storage (files, SVN repos)
├── docker/               # Docker deployment configurations
├── docs/                 # Documentation files
├── documents/            # User guide assets and images
├── packages/             # Internal libraries and tools
│   ├── config-service/   # Deployment configuration center (port 3002)
│   ├── conversion-engine/# MxCAD conversion engine library
│   └── svnVersionTool/   # SVN version control utility
├── runtime/              # Offline runtime dependencies
├── scripts/              # Build and deployment scripts
└── temp/                 # Temporary files
```

## WHERE TO LOOK

| Task                     | Location                 | Notes                                              |
| ------------------------ | ------------------------ | -------------------------------------------------- |
| Backend API development  | apps/backend/            | NestJS with Express, Prisma ORM                    |
| Frontend UI development  | apps/frontend/           | React 19 + Vite + Tailwind CSS                     |
| Configuration management | packages/config-service/ | Deployment configuration center                    |
| Conversion engine        | packages/conversion-engine/ | MxCAD conversion program wrapper                |
| SVN tools                | packages/svnVersionTool/ | SVN version control utilities                      |
| Docker deployment        | docker/                  | Docker-compose files and configurations            |
| Offline deployment       | runtime/                 | Offline runtime dependencies (Windows/Linux)       |
| Build scripts            | scripts/                 | Packaging, deployment, verification scripts        |
| Agent skills             | .agents/                 | Custom skills for API contracts, permissions, etc. |
| Claude configuration     | .claude/                 | Claude Code settings and skills                    |

## CODE MAP

<skip reason="Project has many files (>10), LSP symbol extraction skipped for brevity">

## CONVENTIONS

- **Package Manager**: 100% pnpm (npm/yarn prohibited)
- **Runtime**: 100% PowerShell (Windows environment)
- **Backend Framework**: NestJS must use Express (not Fastify/etc.)
- **TypeScript**: Strict mode enabled (`any` prohibited)
- **Code Formatting**: Prettier with single quotes, 80-char width, semicolons
- **Backend Structure**: Controllers, DTOs, services follow NestJS standards
- **Frontend Structure**: React hooks + Zustand state management
- **Styling**: Tailwind CSS with CSS variables (no hardcoded colors)

## ANTI-PATTERNS (THIS PROJECT)

- Using npm or yarn instead of pnpm
- Using any type in TypeScript (strict mode enforced)
- Using non-Express frameworks with NestJS
- Hardcoding color values in frontend (must use CSS variables)
- Defining components inside components (causes remounting)
- Mutating state directly (must use Zustand setters)
- Using index.ts barrel exports excessively
- Using `any` type in Prisma schema definitions
- Ignoring database migration requirements (must use migrations, not db push)

## UNIQUE STYLES

- **Monorepo Structure**: pnpm workspace with clearly scoped packages
- **Dual Configuration**: Separate runtime and deployment configuration centers
- **SVN Integration**: Custom SVN version control tool package
- **Real-time Collaboration**: Dedicated cooperation service on port 3091

## COMMANDS

```bash
# Development
pnpm dev          # Start all development services
pnpm build        # Build all packages
pnpm lint         # Run ESLint checks
pnpm lint:fix     # Auto-fix lint issues
pnpm format       # Format code with Prettier
pnpm type-check   # Run TypeScript type checking
pnpm check        # Full check (lint + format + type-check)

# Backend specific (in packages/backend)
pnpm prisma generate     # Generate Prisma Client
pnpm prisma db push      # Push schema to database
pnpm prisma migrate dev  # Run migrations in dev
pnpm test                # Run all tests
pnpm test:unit          # Run unit tests only
pnpm test:integration    # Run integration tests only

# Frontend specific (in packages/frontend)
pnpm test                # Run Vitest tests
pnpm test:ui             # Run UI mode tests

# Deployment
pnpm deploy              # Deploy with Docker
pnpm deploy:logs         # View deployment logs
pnpm deploy:rebuild      # Force rebuild containers
pnpm deploy:reset        # Reset all data (development only)

# Offline packaging
pnpm pack:offline:win    # Create Windows offline package
pnpm pack:offline:linux  # Create Linux offline package
pnpm pack:offline:all    # Create all platform packages

# Code generation
pnpm generate:api-types          # Generate API type definitions
pnpm generate:frontend-permissions # Generate frontend permission constants
```

## NOTES

- **SVN Requirement**: Subversion 1.14.x is required for version control functionality
- **MxCAD Dependency**: The platform requires MxCAD assembly for CAD file operations
- **Environment Variables**: Critical variables must be set in `.env` files:
  - Backend: `DATABASE_URL`, `JWT_SECRET`, `DB_PASSWORD`, `MXCAD_ASSEMBLY_PATH`
  - Docker: `DB_PASSWORD`, `JWT_SECRET` in `docker/.env`
- **Ports**:
  - Frontend: 5173
  - Backend API: 3001
  - Config Service: 3002
  - Cooperation Service: 3091
- **Authentication**: JWT-based with access tokens (1h) and refresh tokens (7d)
- **Database**: PostgreSQL with Prisma ORM, requires proper migration workflow
- **Cache**: Redis for session storage and caching
