# Phase 2: 大文件拆分

> ▶️ **进行中** — 2026-05-05 激活
> Phase 1 已归档 → `docs/tasks/archived/phase1-api-upload/`

## 状态

| # | 文件 | 行数 | 风险 | 状态 | 阻塞于 |
|---|------|------|------|------|--------|
| P2-01 | `mxcadManager.ts` | ~3198 | 最高 | 🔄 | — |
| P2-02 | `ProjectDrawingsPanel.tsx` | ~2593 | 最高 | 📋 | — |
| P2-03 | `Register.tsx` | ~1647 | 低 | 📋 | — |
| P2-04 | `Login.tsx` | ~1521 | 低 | 📋 | — |
| P2-05 | `FileSystemManager.tsx` | ~1588 | 高 | 📋 | — |
| P2-06 | `CADEditorDirect.tsx` | ~1316 | 高 | 📋 | — |
| P2-07 | `RoleManagement.tsx` | ~1368 | 低 | 📋 | — |
| P2-08 | `Profile.tsx` | ~1296 | 低 | 📋 | — |
| P2-09 | `LibraryManager.tsx` | ~1197 | 中 | 📋 | — |
| P2-10 | `SystemMonitorPage.tsx` | ~1184 | 中 | 📋 | — |
| P2-11 | `RuntimeConfigPage.tsx` | ~1119 | 低 | 📋 | — |
| P2-12 | `FontLibrary.tsx` | ~1087 | 低 | 📋 | — |
| P2-13 | `services/index.ts` 清理断链导出 | — | 低 | 📋 | — |
| P2-14 | `libraryApi.ts` 写操作迁移 → SDK | — | 中 | 📋 | — |
| P2-15 | `usersApi.ts` `getWechatDeactivateQr` 迁移 | — | 低 | 📋 | — |

## 大方向

将 >1000 行的页面文件拆分到 ≤800 行，复用 UserManagement 的 TDD 拆分模式。

参考: `docs/frontend-refactor-plan.md`

## Known Issues（Phase 1 遗留）

- T00-T14 断链: `trashApi`/`nodeApi`/`searchApi`/`projectMemberApi`/`projectPermissionApi` 等
- `libraryApi` + `publicFileApi` 部分写操作仍在用 `getApiClient()`
- `services/index.ts` 含多条指向已删文件的导出
