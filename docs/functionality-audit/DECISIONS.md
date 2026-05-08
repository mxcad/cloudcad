# 功能审计 - 用户决策记录

> 日期: 2026-05-08
> 分支: `refactor/circular-deps` vs `main`

---

## 已决策事项

### 1. Library - 上传端点缺失 (LIB-01)

**问题**: `POST drawing|block/upload` + `/upload-chunk` 共4个端点缺失

**决策**: ✅ 有意删除。所有上传统一改为开源库的上传方式，不再需要这些独立的上传端点。
**操作**: 文档记录，不恢复代码。
**状态**: 🔵 已记录，无需代码变更

---

### 2. Library - save-as 端点缺失 (LIB-02)

**问题**: `POST drawing|block/save-as` 共2个端点缺失

**决策**: ✅ 保持原有功能意图，直接覆盖mxweb，不需要版本管理。
**操作**: 文档记录，后续大改时统一处理，当前不修改。
**状态**: 🔵 已记录，暂不修改

---

### 3. Admin - 权限缓存管理端点 (ADMIN-01)

**问题**: 4个权限缓存管理端点被删除

**决策**: 🔧 需要恢复。直接加回controller。
**操作**: 待修复

---

### 4. FileSystem-Permission - 缺失Controller端点 (FS-PERM)

**问题**: `POST projects/:projectId/transfer`, `POST/PATCH members/batch` 3个端点Service层已实现但Controller未暴露

**决策**: 🔧 需要修复。Service层逻辑完整，只需在Controller添加路由。
**操作**: 待修复

---

### 5. Auth-Login - Session端点鉴权 (LOGIN-01)

**问题**: Session端点 `POST /session/*` 从 `@UseGuards(JwtAuthGuard)` 改为 `@Public()`

**决策**: 🔧 需要恢复。Session端点必须恢复JWT鉴权。
**操作**: 待修复
**状态**: 🔧 修复中

---

### 6. Dashboard - /health 端点公开化 (DASH-01)

**问题**: `/health` 端点从 `SYSTEM_MONITOR` 权限改为 `@Public()`

**决策**: ✅ 允许对外开放。健康检查端点公开可接受。
**操作**: 文档记录，不修改。
**状态**: 🔵 已记录，无需代码变更

---

### 7. Version-Control - rollbackToRevision 死代码 (VER-01)

**问题**: `rollbackToRevision()` 方法在Provider中实现但无API暴露、无前端调用

**决策**: 🔧 删除死代码。
**操作**: 待修复
**状态**: 🔧 修复中

---

### 8. FileSystem-Permission - 缺失Controller端点 (FS-PERM)

**问题**: `POST projects/:projectId/transfer`, `POST/PATCH members/batch` 3个端点Service层已实现但Controller未暴露

**决策**: 🔧 需要修复。Service层逻辑完整，只需在Controller添加路由。
**操作**: 待修复
**状态**: 🔧 修复中

---

### 9. Admin - 权限缓存管理端点 (ADMIN-01)

**问题**: 4个权限缓存管理端点被删除

**决策**: 🔧 需要恢复。直接加回controller。
**操作**: 待修复
**状态**: 🔧 修复中

---

## 待决策事项

| ID | 模块 | 问题 |
|----|------|------|
| FONTS-01 | Fonts | 默认路径回退逻辑被移除 |
| FONTS-02 | Fonts | 响应message字段丢失具体信息 |
| CAD-01~03 | CAD-Core | API路由版本化、convertBinToMxweb位置、createDefaultContext验证 |
| CROSS-01~07 | Cross-Cutting | PolicyConfigController端点丢失、模块迁移问题等 |

---

## 用户确认的规则

1. 难改的 → 记录到文档，不改代码
2. 好改的（如Service已有、Controller缺失）→ 直接修复+commit
3. 上传统一改为开源库方式（Library upload不再需要独立端点）
4. save-as保持原有功能意图，后续统一处理
5. Admin权限缓存端点直接加回
6. Session端点必须恢复JWT鉴权
7. /health端点可以对外开放
8. 前后端都要一对一比对，前端重构导致样式丢失和逻辑不通也要记录
9. 保持36个agent一直运行
