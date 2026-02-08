# LCD Skill Reference Templates

This document provides concrete templates and examples for creating Layered Context Documents.

## Tier 1 Template (AGENTS.md)

```markdown
---
# Project Name

## Overview
[2-3 sentences describing what the project does, its primary use case, and key technologies]

## Architecture
- [Architectural pattern, e.g., Event-driven microservices]
- [Main component 1]
- [Main component 2]
- [Data flow or integration approach]

## Directory Structure
```
project-root/
├── directory1/     # Brief description
├── directory2/     # Brief description
└── key-file.js     # Brief description
```

## Global Conventions
- **Naming**: [e.g., camelCase for variables, PascalCase for classes]
- **Style**: [e.g., 4-space indentation, semicolons required]
- **Patterns**: [e.g., Async/await for async operations]
- **Architecture**: [e.g., Event-driven with pub/sub]

## Module Documents
**Core Modules:**
- [Module Name]: Documents/[module-name].md - [Brief purpose]

**Components:**
- [Component Group]: Documents/[group-name].md - [Brief purpose]

**Cross-Cutting Concerns:**
- [Concern]: Documents/[concern-name].md - [Brief purpose]

## Quick Reference
- **Entry Point**: [main file]
- **Test Command**: [how to run tests]
- **Build Command**: [how to build]
- **Key Dependencies**: [major libraries/frameworks]
```

## Tier 2 Templates (Documents/)

### Core Module Template

```markdown
# [Module Name]

## Purpose
[1 paragraph explaining what this module does, why it exists, and its key responsibilities]

## Public API

### Classes

#### [ClassName]
**Purpose**: [What this class does]

**Methods:**
- `methodName(param1, param2)` → [return type]
  - [Purpose of method]
  - [Parameters]:
    - `param1`: [type] - [description]
    - `param2`: [type] - [description]

#### [AnotherClassName]
[Similar structure]

### Functions

#### [functionName](param)
- **Purpose**: [what it does]
- **Parameters**: [description]
- **Returns**: [what it returns]
- **Example**: [code example]

## Implementation Details

### Architecture
[Internal architecture description]
- [Component 1]: [role]
- [Component 2]: [role]

### Key Algorithms/Patterns
- [Pattern 1]: [description]
- [Algorithm]: [brief explanation]

### Important Design Decisions
- [Decision 1]: [why this was chosen]
- [Decision 2]: [alternatives considered]

## Dependencies & Relationships

### This Module Depends On
- [Dependency 1]: [how it's used]
- [Dependency 2]: [how it's used]

### Modules That Depend On This
- [Module 1]: [how they use this module]
- [Module 2]: [how they use this module]

### Integration Points
- [Integration 1]: [description]
- [Integration 2]: [description]

## Usage Examples

### Basic Usage
```javascript
// Example from the actual codebase
const instance = new ClassName();
const result = instance.methodName(arg1, arg2);
```

### Advanced Usage
```javascript
// More complex example
// Show edge cases or advanced patterns
```

### Common Patterns
- [Pattern 1]: [description and example]
- [Pattern 2]: [description and example]

## Troubleshooting

### Common Issues

#### [Issue Name]
**Symptom**: [what goes wrong]
**Cause**: [why it happens]
**Solution**: [how to fix it]

#### [Another Issue]
[Similar structure]

### Debugging Tips
- [Tip 1]
- [Tip 2]

### Performance Considerations
- [Performance aspect 1]: [implications]
- [Performance aspect 2]: [implications]

## Related Documents
- [Related module]: Documents/[related-module].md
- [Related topic]: Documents/[related-topic].md
```

### UI Component Template

```markdown
# [Component Name]

## Purpose
[1 paragraph explaining what this component does, its UI role, and key features]

## Component Structure

### HTML/JSX Structure
```html
<!-- Actual component structure -->
<div class="component-name">
  <div class="header">...</div>
  <div class="content">...</div>
</div>
```

### CSS Classes
- `.component-name`: [purpose]
- `.component-name.header`: [purpose]
- `.component-name.content`: [purpose]

## Props/Properties

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| prop1 | string | Yes | - | [description] |
| prop2 | number | No | 0 | [description] |
| prop3 | object | No | {} | [description] |

## State Management

### Internal State
- `state1`: [type] - [purpose]
- `state2`: [type] - [purpose]

### External State
- Uses [store/context] for [purpose]

## Events/Callbacks

| Event | When Triggered | Payload |
|-------|----------------|---------|
| onEvent1 | [condition] | [data structure] |
| onEvent2 | [condition] | [data structure] |

## Styling

### Design System Integration
- Uses [design system/component library]
- Follows [design pattern]

### Custom Styles
- [Style 1]: [purpose]
- [Style 2]: [purpose]

### Responsive Behavior
- Mobile: [behavior]
- Tablet: [behavior]
- Desktop: [behavior]

## Usage Examples

### Basic Usage
```jsx
<Component prop1="value" prop2={123} />
```

### With Event Handlers
```jsx
<Component
  prop1="value"
  onEvent1={(data) => console.log(data)}
/>
```

### Advanced Configuration
```jsx
<Component
  prop1="value"
  prop2={{ option1: true, option2: false }}
  onEvent1={handleEvent}
  customClass="my-class"
/>
```

## Accessibility

### Keyboard Navigation
- [Key 1]: [action]
- [Key 2]: [action]

### ARIA Attributes
- `aria-label`: [when used]
- `aria-describedby`: [when used]

### Screen Reader Support
- [Support detail 1]
- [Support detail 2]

## Browser Compatibility
- Chrome: [version+]
- Firefox: [version+]
- Safari: [version+]
- Edge: [version+]

## Known Issues
- [Issue 1]: [workaround]
- [Issue 2]: [workaround]
```

### API Service Template

```markdown
# [API Service Name]

## Purpose
[1 paragraph explaining what this API service handles and its scope]

## Endpoints

### [HTTP Method] /[endpoint-path]

**Purpose**: [what this endpoint does]

**Request:**
- **Method**: [GET/POST/PUT/DELETE/etc]
- **Path**: `/api/[endpoint]`
- **Headers**:
  - `Content-Type`: `application/json`
  - `Authorization`: `Bearer {token}` (if applicable)
- **Query Parameters** (if applicable):
  - `param1`: [type] - [description]
  - `param2`: [type] - [description]
- **Request Body** (if applicable):
```json
{
  "field1": "value1",
  "field2": 123
}
```

**Response:**
- **Success (200)**:
```json
{
  "status": "success",
  "data": {
    "field1": "value",
    "field2": 123
  }
}
```
- **Error (400/401/404/etc)**:
```json
{
  "status": "error",
  "message": "Error description",
  "code": "ERROR_CODE"
}
```

**Examples:**
```bash
# Using curl
curl -X GET "https://api.example.com/endpoint?param1=value"

# Using JavaScript fetch
fetch('https://api.example.com/endpoint?param1=value')
  .then(res => res.json())
  .then(data => console.log(data));
```

### [Another Endpoint]
[Repeat structure]

## Authentication

### Auth Method
- [JWT/OAuth/API Key/etc]

### How to Obtain Token
```javascript
// Example
const token = await authService.login(username, password);
```

### Token Usage
```javascript
// Include in headers
headers: {
  'Authorization': `Bearer ${token}`
}
```

## Rate Limiting
- [Rate limit details]
- How to handle: [approach]

## Error Handling

### Error Codes
| Code | Meaning | HTTP Status |
|------|---------|-------------|
| AUTH_INVALID | Invalid credentials | 401 |
| RESOURCE_NOT_FOUND | Resource doesn't exist | 404 |
| RATE_LIMIT_EXCEEDED | Too many requests | 429 |

### Retry Strategy
- When to retry: [conditions]
- Retry delay: [time]
- Max retries: [number]

## Client Integration

### JavaScript/TypeScript
```typescript
import { APIClient } from './api-client';

const client = new APIClient({ baseURL: 'https://api.example.com' });

// Example call
const result = await client.getData({ param1: 'value' });
```

### Python
```python
from api_client import APIClient

client = APIClient(base_url='https://api.example.com')

# Example call
result = client.get_data(param1='value')
```

## Testing

### Unit Tests
- Test file: [path/to/test.file]
- Key test cases:
  - [test case 1]
  - [test case 2]

### Integration Tests
- Test file: [path/to/integration-test.file]
- Scenarios:
  - [scenario 1]
  - [scenario 2]

## Related Documents
- [Auth service]: Documents/auth-service.md
- [Data models]: Documents/data-models.md
```

### Configuration Template

```markdown
# [Configuration Topic]

## Purpose
[1 paragraph explaining what this configuration controls and its scope]

## Configuration Files

### [config-file-name]
**Location**: [path/to/config]
**Format**: [JSON/YAML/TOML/etc]

```json
{
  "option1": "value1",
  "option2": 123,
  "option3": {
    "suboption": true
  }
}
```

### [Another config file]
[Repeat structure]

## Configuration Options

### [Option Group]

#### option1
- **Type**: [string/number/boolean/object]
- **Default**: [default value]
- **Required**: [yes/no]
- **Description**: [what it does]
- **Impact**: [what changes when modified]
- **Example**: [example value]

#### option2
[Repeat structure]

### [Another Group]
[Repeat structure]

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| VAR1 | Yes | - | [description] |
| VAR2 | No | default | [description] |

## Configuration Hierarchy

1. [Source 1, e.g., Environment variables] - [priority]
2. [Source 2, e.g., Config file] - [priority]
3. [Source 3, e.g., Default values] - [priority]

## Common Configurations

### Development
```json
{
  "environment": "development",
  "debug": true,
  "logLevel": "debug"
}
```

### Production
```json
{
  "environment": "production",
  "debug": false,
  "logLevel": "info"
}
```

### Testing
```json
{
  "environment": "test",
  "debug": true,
  "logLevel": "warn"
}
```

## Validation

### Schema
[Configuration schema validation rules]

### Validation Errors
- [Error 1]: [how to fix]
- [Error 2]: [how to fix]

## Migration Guide

### From Version X to Y
- [Change 1]: [migration steps]
- [Change 2]: [migration steps]

### Deprecated Options
- [Old option]: [replacement]
```

## Complete Example: Web Application

Here's a complete example showing how to structure documentation for a typical web application.

### Tier 1: AGENTS.md

```markdown
# MyApp - Task Management Application

## Overview
A web-based task management application that allows users to create, organize, and track tasks with real-time collaboration features. Built with React frontend, Node.js backend, and PostgreSQL database.

## Architecture
- Frontend: React with TypeScript and Material-UI
- Backend: Node.js with Express.js and Socket.io
- Database: PostgreSQL with TypeORM
- Architecture: REST API + WebSocket for real-time updates
- State Management: Redux Toolkit

## Directory Structure
```
myapp/
├── client/               # React frontend
│   ├── src/
│   │   ├── components/   # React components
│   │   ├── pages/        # Page components
│   │   ├── store/        # Redux store
│   │   └── services/     # API services
│   └── public/           # Static assets
├── server/               # Node.js backend
│   ├── src/
│   │   ├── controllers/  # Route controllers
│   │   ├── models/       # Database models
│   │   ├── routes/       # API routes
│   │   └── services/     # Business logic
│   └── config/           # Server configuration
├── shared/               # Shared types and utilities
└── docs/                 # Additional documentation
```

## Global Conventions
- **Naming**: camelCase for variables, PascalCase for classes, UPPER_SNAKE_CASE for constants
- **Style**: 2-space indentation, semicolons required, single quotes for strings
- **Async**: Async/await for async operations, no callback hell
- **Error Handling**: Try-catch with proper error logging
- **API**: RESTful conventions, resource-based URLs
- **Database**: TypeORM with migrations
- **Testing**: Jest for unit tests, Cypress for E2E tests

## Module Documents

### Frontend
- **Component Library**: Documents/component-library.md (UI components and patterns)
- **Redux Store**: Documents/redux-store.md (State management and slices)
- **API Services**: Documents/api-services.md (API integration layer)
- **Routing**: Documents/routing.md (Navigation and route guards)

### Backend
- **API Endpoints**: Documents/api-endpoints.md (REST API documentation)
- **Database Models**: Documents/database-models.md (Data models and relationships)
- **Authentication**: Documents/authentication.md (Auth flow and JWT tokens)
- **WebSocket**: Documents/websocket.md (Real-time communication)
- **Business Logic**: Documents/business-logic.md (Service layer patterns)

### Cross-Cutting
- **Error Handling**: Documents/error-handling.md (Error patterns and handling)
- **Configuration**: Documents/configuration.md (Config files and env vars)
- **Testing**: Documents/testing.md (Test patterns and utilities)
- **Deployment**: Documents/deployment.md (Deployment and CI/CD)

## Quick Reference
- **Entry Point**: client/src/index.tsx
- **Server Entry**: server/src/index.ts
- **Test Command**: `npm test` (frontend), `npm run test` (backend)
- **Build Command**: `npm run build`
- **Dev Server**: `npm run dev`
- **Key Dependencies**: React, Express, PostgreSQL, Socket.io, Redux, TypeORM
```

### Tier 2: Documents/database-models.md

```markdown
# Database Models

## Purpose
Defines the database schema, relationships, and ORM models using TypeORM. Manages all data persistence and retrieval operations.

## Models

### User
**Purpose**: Represents application users and authentication

**Schema:**
```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  passwordHash: string;

  @Column()
  name: string;

  @Column({ default: 'user' })
  role: 'admin' | 'user';

  @OneToMany(() => Task, task => task.owner)
  tasks: Task[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Relationships:**
- One-to-many with Task (owner)
- Many-to-many with Task (assignees through join table)

**Indexes:**
- Unique index on email

### Task
**Purpose**: Represents tasks with properties, relationships, and status

**Schema:**
```typescript
@Entity('tasks')
export class Task {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ default: 'todo' })
  status: 'todo' | 'in-progress' | 'done';

  @Column({ type: 'int', default: 1 })
  priority: number; // 1-5

  @Column({ type: 'date' })
  dueDate: Date;

  @ManyToOne(() => User, user => user.tasks)
  owner: User;

  @ManyToMany(() => User, user => user.assignedTasks)
  assignees: User[];

  @OneToMany(() => Comment, comment => comment.task)
  comments: Comment[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Relationships:**
- Many-to-one with User (owner)
- Many-to-many with User (assignees)
- One-to-many with Comment

**Indexes:**
- Index on status
- Index on dueDate
- Composite index on status and dueDate

### Comment
**Purpose**: Comments and discussions on tasks

**Schema:**
```typescript
@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'text' })
  content: string;

  @ManyToOne(() => Task, task => task.comments)
  task: Task;

  @ManyToOne(() => User)
  author: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
```

**Relationships:**
- Many-to-one with Task
- Many-to-one with User (author)

## Relationships Diagram

```
User (1) ----< (n) Task (owner)
User (n) >----< (n) Task (assignees)
Task (1) ----< (n) Comment
Task (1) ----< (n) User (author via Comment)
```

## Common Queries

### Get User with Tasks
```typescript
const user = await userRepository.findOne({
  where: { id: userId },
  relations: ['tasks']
});
```

### Get Tasks with Assignees
```typescript
const tasks = await taskRepository.find({
  relations: ['owner', 'assignees'],
  where: { status: 'in-progress' }
});
```

### Get Task Comments
```typescript
const task = await taskRepository.findOne({
  where: { id: taskId },
  relations: ['comments', 'comments.author']
});
```

### Create Task with Assignees
```typescript
const task = taskRepository.create({
  title: 'New Task',
  owner: user,
  assignees: [assignee1, assignee2]
});
await taskRepository.save(task);
```

## Database Constraints

### Foreign Keys
- `tasks.owner_id` → `users.id` (CASCADE DELETE)
- `comments.task_id` → `tasks.id` (CASCADE DELETE)
- `comments.author_id` → `users.id` (SET NULL)

### Validation Rules
- User email: valid email format, unique
- Task priority: 1-5
- Task status: must be one of enum values

## Migrations

### Current Version
- Migration file: `server/migrations/[timestamp]-InitialSchema.ts`

### Running Migrations
```bash
# Generate migration
npm run migration:generate -- -n MigrationName

# Run migrations
npm run migration:run

# Revert migration
npm run migration:revert
```

### Migration Naming Convention
- Format: `[timestamp]-[Description].ts`
- Use PascalCase for description
- Be descriptive: `AddIndexOnTaskStatus.ts`

## Performance Considerations

### Indexes
- Email uniqueness check uses unique index
- Task filtering by status uses status index
- Task filtering by date uses dueDate index
- Composite index for status + dueDate queries

### Query Optimization
- Always use `relations` for eager loading, avoid N+1 queries
- Use `select` to limit columns when possible
- Use pagination for large result sets
- Consider query caching for frequently accessed data

## Related Documents
- **API Endpoints**: Documents/api-endpoints.md (Task and User endpoints)
- **Business Logic**: Documents/business-logic.md (Service layer using these models)
- **Testing**: Documents/testing.md (Database testing patterns)
```

## Tips for Success

1. **Start with the index**: Always ensure AGENTS.md has a comprehensive Module Documents index
2. **Match file names**: Make document names match module names for easy discovery
3. **Use real examples**: Pull actual code from the codebase for examples
4. **Be specific**: Include actual file paths, function names, and data structures
5. **Keep tier-1 lean**: Ruthlessly move details to tier-2, keep AGENTS.md concise
6. **Think like an agent**: Write for another AI agent that needs to understand the code
7. **Update consistently**: Keep documentation in sync with code changes
8. **Cross-reference**: Link between related documents when helpful