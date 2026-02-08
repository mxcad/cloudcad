# 审计日志（Audit）

**文件位置**：`packages/backend/src/audit/`

## 概述

审计日志功能，记录系统中的所有关键操作，为安全审计和问题追踪提供支持。

## 核心组件

- **AuditLogService**: 审计日志服务
- **AuditLogController**: 审计日志控制器
- **AuditLogModule**: 审计日志模块

## 核心功能

- 操作记录：记录所有关键操作（登录、上传、下载、删除、权限变更等）
- 筛选查询：支持按用户、操作类型、资源类型、时间范围等条件筛选
- 统计分析：提供操作统计信息（总数、成功率、失败率等）
- 日志清理：支持清理旧日志，防止数据库膨胀
- 权限控制：仅管理员可访问审计日志

## 审计操作类型

| 操作类型 | 说明 |
|---------|------|
| PERMISSION_GRANT | 授予权限 |
| PERMISSION_REVOKE | 撤销权限 |
| ROLE_CREATE | 创建角色 |
| ROLE_UPDATE | 更新角色 |
| ROLE_DELETE | 删除角色 |
| USER_LOGIN | 用户登录 |
| USER_LOGOUT | 用户登出 |
| PROJECT_CREATE | 创建项目 |
| PROJECT_DELETE | 删除项目 |
| FILE_UPLOAD | 上传文件 |
| FILE_DOWNLOAD | 下载文件 |
| FILE_DELETE | 删除文件 |
| FILE_SHARE | 分享文件 |
| ADD_MEMBER | 添加成员 |
| UPDATE_MEMBER | 更新成员 |
| REMOVE_MEMBER | 移除成员 |
| TRANSFER_OWNERSHIP | 转让所有权 |
| ACCESS_DENIED | 访问拒绝 |
| PERMISSION_CHECK | 权限检查（通过） |
| PERMISSION_DENIED | 权限检查（拒绝） |

## 资源类型

| 资源类型 | 说明 |
|---------|------|
| USER | 用户 |
| ROLE | 角色 |
| PERMISSION | 权限 |
| PROJECT | 项目 |
| FILE | 文件 |
| FOLDER | 文件夹 |

## 相关模型

- **AuditLog**: 审计日志模型
  - id: 主键（CUID）
  - action: 操作类型
  - resourceType: 资源类型
  - userId: 操作用户 ID
  - details: 详细信息（JSON）
  - success: 操作是否成功
  - createdAt: 创建时间

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/audit/logs` | GET | 查询审计日志（支持筛选） |
| `/api/audit/logs/:id` | GET | 获取审计日志详情 |
| `/api/audit/statistics` | GET | 获取审计统计信息 |
| `/api/audit/cleanup` | POST | 清理旧审计日志 |

## 前端组件

- **AuditLogPage**: `packages/frontend/pages/AuditLogPage.tsx`

## 权限要求

仅管理员可访问审计日志功能。