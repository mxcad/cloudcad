# T10: `components/modals/MembersModal.tsx` — API Migration

**Dependency:** T00 (Environment Repair) must complete first.

**Estimated effort:** 30–40 min

---

## Input File

`packages/frontend/src/components/modals/MembersModal.tsx` (~890 lines)

## Current Import

```typescript
import { projectsApi } from '../../services/projectsApi';
```

## What to do

### Step 1: Replace imports

```typescript
// REMOVE:
import { projectsApi } from '../../services/projectsApi';

// ADD:
import { projectMemberApi } from '@/services/projectMemberApi';
```

### Step 2: Replace API calls

| Old | New |
|-----|-----|
| `projectsApi.getMembers(projectId)` | `projectMemberApi.getMembers(projectId)` |
| `projectsApi.addMember(projectId, data)` | `projectMemberApi.addMember(projectId, data)` |
| `projectsApi.removeMember(projectId, userId)` | `projectMemberApi.removeMember(projectId, userId)` |
| `projectsApi.updateMember(projectId, userId, data)` | `projectMemberApi.updateMember(projectId, userId, data)` |
| `projectsApi.transferOwnership(projectId, targetUserId)` | `projectMemberApi.transferOwnership(projectId, targetUserId)` |

### Step 3: Apply cross-cutting rules

- 2 console calls to clean
- Fix catch blocks
- Convert all imports to `@/` alias

### Step 4: Verify

```bash
pnpm type-check
```

---

## Verification Checklist

- [ ] 5 API calls migrated to `projectMemberApi`
- [ ] All cross-cutting rules applied
- [ ] `pnpm type-check` passes
