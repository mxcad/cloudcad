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

## TECH STACK

### Backend (apps/backend)

| Technology | Version | Purpose |
|------------|---------|---------|
| NestJS | 11.x | Backend framework (must use Express adapter) |
| Express | 5.x | HTTP platform |
| Prisma | 7.1.0 | ORM with PostgreSQL adapter |
| PostgreSQL | 15+ | Relational database |
| Redis (ioredis) | 7+ | Cache + Session storage |
| Passport + JWT | - | Authentication (Access Token 1h / Refresh Token 7d) |
| class-validator | - | DTO validation |
| Multer | - | File upload handling |
| Nodemailer | - | Email sending |
| Aliyun/Tencent SMS | - | SMS verification |

### Frontend (apps/frontend)

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19.2.1 | UI framework |
| Vite | 6.2.0 | Build tool |
| Tailwind CSS | 4.1.18 | Styling (no hardcoded colors, use CSS variables) |
| TypeScript | 5.8.2 | Type system (Strict mode, no `any`) |
| Zustand | 5.0.10 | State management |
| React Router | 7.10.1 | Routing |
| Axios | 1.13.2 | HTTP client |
| React Hook Form + Zod | - | Form validation |
| Radix UI | - | Accessible UI primitives |
| mxcad-app | 1.0.45 | CAD core library |
| WebUploader | - | Chunked upload component |
| Vitest | 4.x | Unit testing |
| Recharts | - | Chart components |

### Infrastructure

| Component | Purpose |
|-----------|---------|
| Docker + docker-compose | Containerized deployment |
| Nginx | Reverse proxy |
| SVN | Version control repository |
| MxCAD Assembly | CAD file conversion engine (external executable) |

## CORE MODULES

### Backend Modules (apps/backend/src)

#### auth/ - Authentication
- **Responsibility**: Login, registration, password management, token refresh, third-party login (WeChat), SMS/email verification
- **Key files**: `auth-facade.service.ts`, `services/login.service.ts`, `services/registration.service.ts`, `services/password.service.ts`, `services/auth-token.service.ts`, `jwt.strategy.executor.ts`

#### users/ - User Management
- **Responsibility**: User CRUD, user info management, user data cleanup
- **Key services**: UsersService, UserCleanupService

#### roles/ - Roles & Permissions
- **Responsibility**: System role management, project role management, system permission check, project permission check
- **Key services**: `roles.service.ts`, `project-roles.service.ts`, `project-permission.service.ts`

#### common/ - Common Module
- **Responsibility**: Global guards, interceptors, pipes, exception filters, common services
- **Key services**: `services/permission.service.ts`, `services/initialization.service.ts`, `services/storage-manager.service.ts`, `services/redis-cache.service.ts`, `services/permission-cache.service.ts`

#### file-system/ - File System
- **Responsibility**: Project management, file tree operations, file CRUD, file move/copy/delete, project member management, storage quota
- **Architecture**: Facade pattern, FileSystemService delegates to 6 sub-services
- **Key services**: `services/project-crud.service.ts`, `services/file-tree.service.ts`, `services/file-operations.service.ts`, `services/file-download-export.service.ts`

#### mxcad/ - MxCAD Conversion
- **Responsibility**: CAD file upload, conversion (DWG/DXF → MXWeb), chunked upload management, thumbnail generation, external reference handling
- **Key services**: `mxcad.service.ts`, `services/file-upload-manager-facade.service.ts`, `services/chunk-upload.service.ts`, `services/file-conversion.service.ts`
- **External dependency**: `MXCAD_ASSEMBLY_PATH` env var points to MxCAD executable

#### version-control/ - Version Control
- **Responsibility**: SVN repository management, file version commit, version history query, version rollback, version comparison
- **Key operations**: svnCheckout, svnCommit, svnLog, svnCat, svnList, svnPropset

#### audit/ - Audit Log
- **Responsibility**: Operation audit records, audit log query

#### library/ - Library
- **Responsibility**: Block management, library resource management

#### fonts/ - Font Management
- **Responsibility**: Font file management, font upload/download

#### policy-engine/ - Policy Engine
- **Responsibility**: Policy-based access control (time/IP/device policies)

### Frontend Modules (apps/frontend/src)

#### pages/ - Page Components

| Page | Description |
|------|-------------|
| `Login.tsx` | User login |
| `Register.tsx` | User registration |
| `Dashboard.tsx` | Workbench/Dashboard |
| `FileSystemManager.tsx` | File system manager (project/file browsing) |
| `CADEditorDirect.tsx` | CAD editor page |
| `UserManagement.tsx` | User management (admin) |
| `RoleManagement.tsx` | Role management (admin) |
| `LibraryManager.tsx` | Library management |
| `AuditLogPage.tsx` | Audit log |
| `SystemMonitorPage.tsx` | System monitoring |

#### stores/ - Zustand State Management

| Store | Description |
|-------|-------------|
| `fileSystemStore.ts` | File system state (projects, file tree, current selection) |
| `uiStore.ts` | UI state (theme, sidebar, modals) |
| `notificationStore.ts` | Notification state |

## KEY WORKFLOWS

### File Upload → Conversion → View

```
[Frontend] Select file (.dwg/.dxf)
    ↓
[Frontend] MxCadUploader - chunked upload (SparkMD5 hash, concurrent chunks)
    ↓
[Backend] MxCadController - receive chunks (stored to data/uploads/)
    ↓
[Backend] FileConversionService - file conversion (DWG/DXF → .mxweb, calls MxCAD Assembly)
    ↓
[Backend] Post-conversion processing (upload converted file, generate thumbnail, handle external refs)
    ↓
[Backend] Update database (FileSystemNode.fileStatus = COMPLETED)
    ↓
[Frontend] File tree refresh, display new file
    ↓
[Frontend] Click file → CADEditorDirect.tsx (load .mxweb, init MxCAD editor, real-time collaboration via WebSocket port 3091)
```

### User Authentication Flow

```
[Frontend] Login form (Login.tsx) - submit username + password
    ↓
[Backend] AuthController → LoginService - verify credentials, generate Access Token (1h) + Refresh Token (7d)
    ↓
[Frontend] Store tokens (localStorage) - Access Token for API, Refresh Token for auto-refresh
    ↓
[Backend] JwtStrategyExecutor (global Guard) verifies Token on subsequent requests
    ↓
[Backend] Token refresh using Refresh Token when expired
```

### Project Permission Check Flow

```
[Frontend] User accesses project resource
    ↓
[Backend] JwtStrategyExecutor verifies identity
    ↓
[Backend] ProjectGuard checks project membership (query ProjectMember table, get ProjectRole)
    ↓
[Backend] PermissionGuard checks operation permission (query ProjectRolePermission table, compare with ProjectPermission enum)
    ↓
[Backend] Execute business logic (403 Forbidden if insufficient permissions)
```

## DATABASE CORE TABLES

### Core Models (Prisma Schema)

| Model | Table | Description |
|-------|-------|-------------|
| `User` | `users` | User table (supports soft delete with deletedAt) |
| `Role` | `roles` | System role table (supports hierarchy with parentId) |
| `RolePermission` | `role_permissions` | Role-permission mapping table |
| `FileSystemNode` | `file_system_nodes` | File system node (unified model: project/folder/file) |
| `ProjectRole` | `project_roles` | Project role table |
| `ProjectRolePermission` | `project_role_permissions` | Project role-permission mapping table |
| `ProjectMember` | `project_members` | Project member table |
| `Asset` | `assets` | Asset library table |
| `Font` | `fonts` | Font table |
| `AuditLog` | `audit_logs` | Audit log table |
| `UploadSession` | `upload_sessions` | Upload session table (chunked upload) |
| `RefreshToken` | `refresh_tokens` | Refresh token table |

### Key Enums

| Enum | Description |
|------|-------------|
| `Permission` | System permissions (SYSTEM_ADMIN, SYSTEM_USER_*, SYSTEM_ROLE_*, LIBRARY_*, PROJECT_CREATE, etc.) |
| `ProjectPermission` | Project permissions (PROJECT_*, FILE_*, CAD_*, VERSION_READ, etc.) |
| `UserStatus` | User status (ACTIVE, INACTIVE, SUSPENDED) |
| `FileStatus` | File status (UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED) |
| `ProjectStatus` | Project status (ACTIVE, ARCHIVED, DELETED) |

### Important Relationships

```
User ──1:N──> FileSystemNode (ownerId)
User ──1:N──> ProjectMember
User ──1:N──> AuditLog
Role ──1:N──> RolePermission
Role ──N:N──> User (via roleId)

FileSystemNode ──1:N──> FileSystemNode (parentId, self-reference)
FileSystemNode ──1:N──> ProjectMember
FileSystemNode ──1:N──> ProjectRole
```

### FileSystemNode Unified Model

`FileSystemNode` is a unified model with field combinations:
- **Project**: `isFolder=true, isRoot=true`
- **Folder**: `isFolder=true, isRoot=false, projectId not null`
- **File**: `isFolder=false, projectId not null`
- **Personal Space**: `personalSpaceKey not null`
- **Library**: `libraryKey not null`

## FILE STORAGE STRUCTURE

```
data/
├── files/                 # File storage (FILES_DATA_PATH)
│   └── [project-id]/     # Organized by project ID
│       └── [node-id]/    # Organized by node ID
│
├── uploads/               # MxCAD upload temp directory (MXCAD_UPLOAD_PATH)
│   └── chunks/           # Chunk files
│   └── temp/             # Conversion intermediate files
│
├── temp/                  # Temp files (MXCAD_TEMP_PATH)
│
└── svn-repo/              # SVN repository (SVN_REPO_PATH)
    └── [project-id]/     # One SVN repo per project
```

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
