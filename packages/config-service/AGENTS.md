# PROJECT KNOWLEDGE BASE

**Generated:** 2026-04-15T02:56:24.894Z
**Commit:** unknown
**Branch:** unknown

## OVERVIEW

Deployment configuration center service providing dynamic configuration management for microservices.

## STRUCTURE

```
packages/config-service/
├── src/
│   ├── common/           # Shared guards, interceptors, pipes, exceptions
│   ├── config/           # Configuration modules and services
│   ├── modules/          # Feature modules (namespaces, configs, history)
│   ├── prisma/           # Prisma database service and utilities
│   └── main.ts           # Application entry point
```

## WHERE TO LOOK

| Task                  | Location                       | Notes                                |
| --------------------- | ------------------------------ | ------------------------------------ |
| API Controllers       | src/modules/\*\*/controller.ts | REST endpoints for config management |
| Data Transfer Objects | src/modules/\*\*/dto/          | Request/response validation          |
| Services              | src/modules/\*\*/service.ts    | Business logic for config operations |
| Database Models       | prisma/schema.prisma           | Prisma schema definition             |
| Configuration         | src/config/                    | Configuration loading and validation |
| Namespaces            | src/modules/namespace/         | Namespace management (CRUD)          |
| Config Items          | src/modules/config/            | Configuration item management        |
| History               | src/modules/history/           | Configuration change history         |

## CONVENTIONS

- **Controllers**: Use `@Controller()` with versioned paths (e.g., `@Controller('api/v1/config')`)
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
- **Prisma Service**: Custom service extending PrismaClient with cleanup hooks
- **Configuration**: Hierarchical configuration with namespaces, profiles, and versioning
- **Change Tracking**: Full history of configuration changes with rollback capability
- **Real-time Updates**: WebSocket support for pushing config updates to subscribers

## COMMANDS

```bash
# Config service specific (in packages/config-service)
pnpm dev              # Start development server (port 3002)
pnpm build            # Build production version
pnpm test             # Run all tests
pnpm test:unit        # Run unit tests only
pnpm test:integration # Run integration tests only
pnpm prisma generate  # Generate Prisma Client
pnpm prisma db push   # Push schema to database (dev only)
pnpm prisma migrate dev # Run migrations in dev
pnpm prisma studio    # Open Prisma GUI
```

## NOTES

- **Database**: PostgreSQL with Prisma ORM, requires migrations for schema changes
- **Authentication**: Shares JWT authentication with backend service
- **Port**: Runs on port 3002
- **Environment Variables**: Critical variables in `.env`:
  - `DATABASE_URL`, `JWT_SECRET`, `DB_PASSWORD`
  - `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`
  - `CONFIG_CACHE_TTL`, `CONFIG_UPDATE_INTERVAL`
- **Deployment**: Designed to be deployed as a separate microservice
- **Integration**: Other services (backend, frontend) fetch configuration from this service on startup
