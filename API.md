# API 文档

CloudCAD 后端 API 接口文档。

## 📋 目录

- [API 概览](#-api-概览)
- [认证授权](#-认证授权)
- [用户管理](#-用户管理)
- [文件系统](#-文件系统)
- [版本控制](#-版本控制)
- [项目管理](#-项目管理)
- [权限管理](#-权限管理)
- [错误处理](#-错误处理)

## 🌐 API 概览

### 基本信息

| 项目 | 说明 |
|------|------|
| 基础 URL | `/api` |
| 认证方式 | JWT Bearer Token |
| 数据格式 | JSON |
| 字符编码 | UTF-8 |

### 响应格式

#### 成功响应

```typescript
interface SuccessResponse<T> {
  success: true;
  data: T;
  message?: string;
}
```

#### 错误响应

```typescript
interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 |
| 403 | 禁止访问 |
| 404 | 资源不存在 |
| 500 | 服务器错误 |

## 🔐 认证授权

### 登录

```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "string",
  "password": "string"
}
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "token_type": "Bearer",
    "expires_in": 604800,
    "user": {
      "id": "uuid",
      "username": "string",
      "email": "string",
      "avatar": "string"
    }
  }
}
```

### 注册

```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

### 刷新 Token

```http
POST /api/auth/refresh
Authorization: Bearer <access_token>
```

### 登出

```http
POST /api/auth/logout
Authorization: Bearer <access_token>
```

## 👤 用户管理

### 获取当前用户信息

```http
GET /api/users/me
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "username": "string",
    "email": "string",
    "avatar": "string",
    "role": {
      "id": "uuid",
      "name": "admin"
    },
    "createdAt": "2026-03-27T00:00:00Z"
  }
}
```

### 更新用户信息

```http
PATCH /api/users/me
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "username": "string",
  "email": "string",
  "avatar": "string"
}
```

### 修改密码

```http
POST /api/users/me/change-password
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "oldPassword": "string",
  "newPassword": "string"
}
```

### 获取用户列表（管理员）

```http
GET /api/users?page=1&limit=20&keyword=string
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "username": "string",
        "email": "string",
        "role": {
          "name": "user"
        }
      }
    ],
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
```

## 📁 文件系统

### 获取文件树

```http
GET /api/files?projectId=uuid&parentId=uuid
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "文件夹",
      "type": "folder",
      "parentId": "uuid",
      "children": []
    },
    {
      "id": "uuid",
      "name": "文件.dwg",
      "type": "file",
      "size": 1024,
      "mimeType": "application/acad",
      "url": "/uploads/files/xxx.dwg"
    }
  ]
}
```

### 创建文件夹

```http
POST /api/files/folder
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "projectId": "uuid",
  "parentId": "uuid"
}
```

### 上传文件

```http
POST /api/files/upload
Authorization: Bearer <access_token>
Content-Type: multipart/form-data

FormData:
  - file: File
  - projectId: uuid
  - parentId: uuid (可选)
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "文件.dwg",
    "size": 1024,
    "url": "/uploads/files/xxx.dwg",
    "createdAt": "2026-03-27T00:00:00Z"
  }
}
```

### 下载文件

```http
GET /api/files/:id/download
Authorization: Bearer <access_token>
```

### 删除文件/文件夹

```http
DELETE /api/files/:id
Authorization: Bearer <access_token>
```

### 重命名文件/文件夹

```http
PATCH /api/files/:id/rename
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string"
}
```

### 移动文件/文件夹

```http
POST /api/files/:id/move
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "targetParentId": "uuid"
}
```

### 复制文件/文件夹

```http
POST /api/files/:id/copy
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "targetParentId": "uuid"
}
```

## 📝 版本控制

### 获取版本历史

```http
GET /api/files/:id/versions
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "version": "1.0.0",
      "message": "提交信息",
      "author": {
        "id": "uuid",
        "username": "string"
      },
      "createdAt": "2026-03-27T00:00:00Z",
      "size": 1024
    }
  ]
}
```

### 提交版本

```http
POST /api/files/:id/commit
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "message": "提交信息",
  "file": "base64 编码的文件内容"
}
```

### 获取版本详情

```http
GET /api/versions/:id
Authorization: Bearer <access_token>
```

### 恢复版本

```http
POST /api/versions/:id/restore
Authorization: Bearer <access_token>
```

### 版本对比

```http
GET /api/versions/compare?sourceId=uuid&targetId=uuid
Authorization: Bearer <access_token>
```

## 📊 项目管理

### 获取项目列表

```http
GET /api/projects?page=1&limit=20
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "name": "项目名称",
        "description": "项目描述",
        "owner": {
          "id": "uuid",
          "username": "string"
        },
        "members": [],
        "createdAt": "2026-03-27T00:00:00Z"
      }
    ],
    "total": 10,
    "page": 1,
    "limit": 20
  }
}
```

### 创建项目

```http
POST /api/projects
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "description": "string"
}
```

### 获取项目详情

```http
GET /api/projects/:id
Authorization: Bearer <access_token>
```

### 更新项目

```http
PATCH /api/projects/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "description": "string"
}
```

### 删除项目

```http
DELETE /api/projects/:id
Authorization: Bearer <access_token>
```

### 添加项目成员

```http
POST /api/projects/:id/members
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "userId": "uuid",
  "role": "member|admin"
}
```

### 移除项目成员

```http
DELETE /api/projects/:id/members/:userId
Authorization: Bearer <access_token>
```

## 🔏 权限管理

### 获取角色列表

```http
GET /api/roles
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "admin",
      "label": "管理员",
      "permissions": []
    }
  ]
}
```

### 创建角色

```http
POST /api/roles
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "label": "string",
  "permissions": ["permission1", "permission2"]
}
```

### 更新角色

```http
PATCH /api/roles/:id
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "name": "string",
  "label": "string",
  "permissions": []
}
```

### 删除角色

```http
DELETE /api/roles/:id
Authorization: Bearer <access_token>
```

### 获取权限列表

```http
GET /api/permissions
Authorization: Bearer <access_token>
```

**响应示例：**

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "file.create",
      "label": "创建文件",
      "module": "file"
    },
    {
      "id": "uuid",
      "name": "file.delete",
      "label": "删除文件",
      "module": "file"
    }
  ]
}
```

### 分配角色给用户

```http
POST /api/users/:userId/roles
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "roleId": "uuid"
}
```

### 检查权限

```http
GET /api/permissions/check?permission=string
Authorization: Bearer <access_token>
```

## ❌ 错误处理

### 错误码说明

| 错误码 | 说明 |
|--------|------|
| `AUTH_001` | 认证失败 |
| `AUTH_002` | Token 过期 |
| `AUTH_003` | 权限不足 |
| `USER_001` | 用户不存在 |
| `USER_002` | 用户名已存在 |
| `USER_003` | 密码错误 |
| `FILE_001` | 文件不存在 |
| `FILE_002` | 文件上传失败 |
| `FILE_003` | 文件类型不支持 |
| `PROJECT_001` | 项目不存在 |
| `PROJECT_002` | 无项目权限 |
| `VERSION_001` | 版本不存在 |
| `ROLE_001` | 角色不存在 |
| `ROLE_002` | 角色已存在 |
| `SYSTEM_001` | 系统错误 |

### 错误响应示例

```json
{
  "success": false,
  "error": {
    "code": "AUTH_001",
    "message": "认证失败，请登录后重试",
    "details": {
      "reason": "Token 无效"
    }
  }
}
```
## 📚 相关资源

- [Swagger 文档](http://localhost:3001/api/docs)
- [Git 工作流指南](./GIT_WORKFLOW.md)
- [开发指南](./DEVELOPMENT_GUIDE.md)

---

_最后更新：2026 年 3 月 27 日_
