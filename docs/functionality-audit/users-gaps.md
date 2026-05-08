# Users Module API 差异审计报告

**对比分支**: `main` (重构前) vs `refactor/circular-deps` (重构后)

**生成时间**: 2026-05-08

## 一、整体概述

当前重构分支 (refactor/circular-deps) 的 Users 模块已基本保留 main 分支的所有核心 API，并引入了新的服务抽象（密码哈希、账户验证策略等），提升了代码质量和可维护性。但存在 **一个缺失端点**。

## 二、端点差异详情

### ✅ 保留的端点 (共 15 个)

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /users | 创建用户 |
| GET | /users | 获取用户列表 |
| GET | /users/search/by-email | 根据邮箱搜索用户 |
| GET | /users/search | 搜索用户（用于添加项目成员） |
| GET | /users/profile/me | 获取当前用户信息 |
| GET | /users/stats/me | 获取当前用户仪表盘统计数据 |
| PATCH | /users/profile/me | 更新当前用户信息 |
| GET | /users/:id | 根据 ID 获取用户 |
| PATCH | /users/:id | 更新用户 |
| DELETE | /users/:id | 注销用户账户（软删除） |
| POST | /users/:id/restore | 恢复已注销用户 |
| POST | /users/:id/delete-immediately | 立即注销用户 |
| POST | /users/deactivate-account | 注销当前账户 |
| POST | /users/me/restore | 恢复已注销账户（冷静期内） |
| POST | /users/change-password | 修改密码 |

### ❌ 缺失的端点 (1 个)

| 方法 | 路径 | 说明 |
|------|------|------|
| PATCH | /users/:id/status | 更新用户状态（启用/停用/冻结） |

**影响**: 管理员无法通过此 API 直接修改用户状态。该功能在 main 分支中存在，且当前分支的 `UsersService` 已有 `updateStatus` 方法实现，仅缺少控制器路由。

## 三、其他差异

1. **服务方法命名差异**  
   - main 分支：`deactivateAccount`  
   - 当前分支：`deactivate`  
   控制器已适配当前分支的方法名，功能一致。

2. **新增依赖注入与策略模式**  
   当前分支引入了 `PasswordHasher`、账户验证策略接口及多种策略实现（密码、短信、邮箱、微信），提升了扩展性和可测试性。这是重构带来的正面变化，不影响 API 行为。

3. **响应结构与权限**  
   两个分支的响应结构、权限装饰器、HTTP 状态码完全一致，未发现破坏性变更。

## 四、建议修复项

- **立即修复**: 在 `UsersController` 中添加 `PATCH /users/:id/status` 路由，复用现有 `UsersService.updateStatus` 方法。
- **无需修改**: 其他差异均为重构优化，不影响功能。

## 五、待决策项

无。本次审计未发现需要跨模块决策的问题。

---
*审计完成*