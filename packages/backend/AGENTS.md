# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

NestJS backend service providing REST APIs, authentication, database access via Prisma, and real-time cooperation service.

## STRUCTURE

```
packages/backend/
├── src/
│   ├── common/           # Shared guards, interceptors, pipes, exceptions
│   ├── config/           # Configuration modules
│   ├── cooperation/      # Real-time cooperation service (WebSocket)
│   ├── modules/          # Feature modules (auth, projects, files, etc.)
│   ├── prisma/           # Prisma database service and utilities
│   └── main.ts           # Application entry point
```

## WHERE TO LOOK

| Task                  | Location                       | Notes                           |
| --------------------- | ------------------------------ | ------------------------------- |
| API Controllers       | src/modules/\*\*/controller.ts | REST endpoints                  |
| Data Transfer Objects | src/modules/\*\*/dto/          | Request/response validation     |
| Services              | src/modules/\*\*/service.ts    | Business logic                  |
| Database Models       | prisma/schema.prisma           | Prisma schema definition        |
| Authentication        | src/modules/auth/              | JWT strategies, guards          |
| Cooperation           | src/cooperation/               | WebSocket gateway and providers |

## CONVENTIONS

- **Controllers**: Use `@Controller()` with versioned paths (e.g., `@Controller('api/v1/projects')`)
- **DTOs**: Always use `class` with `class-validator` decorators
- **Services**: Use `@Injectable()` and inject dependencies via constructor
- **Error Handling**: Use `HttpException` or extend `BaseException`
- **Guards**: Implement `CanActivate` for auth/permissions
- **Interceptors**: Use for logging, response transformation
- **Exceptions**: Create custom exceptions in `common/exceptions/`
- **Validation**: Use `ValidationPipe` globally and in controllers
- **Async**: Always use `async/await`, never raw promises

## ANTI-PATTERNS (THIS PROJECT)

- Using `any` type in TypeScript files
- Using non-Express adapter with NestJS (must use Express)
- Putting business logic in controllers (should be in services)
- Directly manipulating Prisma models in controllers
- Forgetting to use `ValidationPipe` on DTOs
- Using `@Req()`/@`Res()` directly (use DTOs and proper return types)
- Missing error handling in async functions
- Not using transactions for related database operations
- Hardcoding strings that should be configurable
- Using `console.log()` instead of Logger service

## UNIQUE STYLES

- **Module Organization**: Each feature gets its own module with controller, service, DTO
- **Shared Modules**: Common guards, interceptors, pipes in `src/common/`
- **Cooperation Service**: Separate module for WebSocket handling
- **Prisma Service**: Custom service extending PrismaClient with cleanup hooks
- **Configuration**: Separate config modules for different environments
- **Guards**: Combination of AuthGuard, PermissionGuard, ProjectGuard

## COMMANDS

```bash
# Backend specific (in packages/backend)
pnpm dev              # Start development server (port 3001)
pnpm build            # Build production version
pnpm test             # Run all tests
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests only
pnpm test:permission  # Run permission tests only
pnpm prisma generate  # Generate Prisma Client
pnpm prisma db push   # Push schema to database (dev only)
pnpm prisma migrate dev # Run migrations in dev
pnpm prisma studio    # Open Prisma GUI
```

## NOTES

- **Database**: PostgreSQL with Prisma ORM, requires migrations for schema changes
- **Authentication**: JWT-based with access token (1h) and refresh token (7d)
- **Cooperation Service**: Runs on port 3091, handles real-time collaboration
- **File Storage**: Files stored in `data/files/`, metadata in PostgreSQL
- **SVN Integration**: Uses `svnVersionTool` package for version control operations
- **Environment Variables**: Critical variables in `.env`:
  - `DATABASE_URL`, `JWT_SECRET`, `DB_PASSWORD`, `MXCAD_ASSEMBLY_PATH`
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - `FILES_DATA_PATH`, `SVN_REPO_PATH`
