# API Migration Reference

Shared reference for all API migration tasks. Each task document references this for the old→new mapping.

## Migration Table

| Old (`projectsApi.xxx`) | New import | New call |
|--------------------------|------------|----------|
| `projectsApi.list(filter?, params?, config?)` | `import { projectApi } from '@/services/projectApi'` | `projectApi.list(filter?, params?, config?)` |
| `projectsApi.getDeleted(params?, config?)` | same | `projectApi.getDeleted(params?, config?)` |
| `projectsApi.create(data)` | same | `projectApi.create(data)` |
| `projectsApi.get(projectId)` | same | `projectApi.get(projectId)` |
| `projectsApi.update(projectId, data)` | same | `projectApi.update(projectId, data)` |
| `projectsApi.delete(projectId, permanent?)` | same | `projectApi.delete(projectId, permanent?)` |
| `projectsApi.restoreProject(nodeId)` | same | `projectApi.restore(nodeId)` |
| `projectsApi.getQuota(nodeId?)` | same | `projectApi.getQuota(nodeId?)` |
| `projectsApi.updateStorageQuota(nodeId, quota)` | same | `projectApi.updateStorageQuota(nodeId, quota)` |
| `projectsApi.getPersonalSpace()` | same | `projectApi.getPersonalSpace()` |
| `projectsApi.getUserPersonalSpace(userId)` | same | `projectApi.getUserPersonalSpace(userId)` |
| `projectsApi.getStorageInfo()` | same | `projectApi.getStorageInfo()` |
| `projectsApi.createNode(data)` | `import { nodeApi } from '@/services/nodeApi'` | `nodeApi.createNode(data)` |
| `projectsApi.createFolder(parentId, data)` | same | `nodeApi.createFolder(parentId, data)` |
| `projectsApi.getNode(nodeId, config?)` | same | `nodeApi.getNode(nodeId, config?)` |
| `projectsApi.getChildren(nodeId, params?, config?)` | same | `nodeApi.getChildren(nodeId, params?, config?)` |
| `projectsApi.updateNode(nodeId, data)` | same | `nodeApi.updateNode(nodeId, data)` |
| `projectsApi.renameNode(nodeId, data)` | same | `nodeApi.renameNode(nodeId, data)` |
| `projectsApi.deleteNode(nodeId, permanent?)` | same | `nodeApi.deleteNode(nodeId, permanent?)` |
| `projectsApi.moveNode(nodeId, targetParentId)` | same | `nodeApi.moveNode(nodeId, targetParentId)` |
| `projectsApi.copyNode(nodeId, targetParentId)` | same | `nodeApi.copyNode(nodeId, targetParentId)` |
| `projectsApi.restoreNode(nodeId)` | same | `nodeApi.restoreNode(nodeId)` |
| `projectsApi.getMembers(projectId)` | `import { projectMemberApi } from '@/services/projectMemberApi'` | `projectMemberApi.getMembers(projectId)` |
| `projectsApi.addMember(projectId, data)` | same | `projectMemberApi.addMember(projectId, data)` |
| `projectsApi.removeMember(projectId, userId)` | same | `projectMemberApi.removeMember(projectId, userId)` |
| `projectsApi.updateMember(projectId, userId, data)` | same | `projectMemberApi.updateMember(projectId, userId, data)` |
| `projectsApi.transferOwnership(projectId, newOwnerId)` | same | `projectMemberApi.transferOwnership(projectId, newOwnerId)` |
| `projectsApi.getPermissions(projectId)` | `import { projectPermissionApi } from '@/services/projectPermissionApi'` | `projectPermissionApi.getPermissions(projectId)` |
| `projectsApi.checkPermission(projectId, permission)` | same | `projectPermissionApi.checkPermission(projectId, permission)` |
| `projectsApi.getRole(projectId)` | same | `projectPermissionApi.getRole(projectId)` |
| `projectsApi.getProjectTrash(projectId, params?)` | `import { projectTrashApi } from '@/services/projectTrashApi'` | `projectTrashApi.getProjectTrash(projectId, params?)` |
| `projectsApi.clearProjectTrash(projectId)` | same | `projectTrashApi.clearProjectTrash(projectId)` |
| `projectsApi.search(keyword, params?, config?)` | `import { searchApi } from '@/services/searchApi'` | `searchApi.search(keyword, params?, config?)` |
| `ProjectFilterType` | `import type { ProjectFilterType } from '@/services/projectApi'` | (unchanged) |

## Cross-Cutting Rules (apply to ALL files modified)

### Error handling
- Every `catch` block: `catch (error: unknown)` then narrow with `instanceof Error`
- Replace ad-hoc `console.error(error)` with `handleError(error, 'descriptive context')`
- Import: `import { handleError } from '@/utils/errorHandler'`

### Console hygiene
- DELETE all `console.log(...)` and `console.warn(...)` lines
- REPLACE `console.error(...)` with `handleError(error, 'context')`
- Exception: mxcadManager.ts CAD engine debug logs (only those specifically marked with "CAD debug" comments) may keep `console.error` — but all others must change

### Imports
- All imports use `@/` alias (e.g., `@/components/ui/Button`, `@/hooks/usePermission`)
- No relative imports in modified files
- Group imports: React/libraries → UI components → services → hooks → types → utils

### No other changes
- Do NOT refactor logic, rename variables, or reorganize code beyond what's needed for migration + standards
- If a file needs deeper refactoring, note it in your output and skip it
