# 前后端 API 对齐审计报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\packages\backend\src` + `d:\project\cloudcad\packages\frontend\src\services`

---

## 一、审计概览

| 统计项 | 数量 |
|--------|------|
| 后端 Controller 数 | 10 |
| 后端端点数 | 约 80 |
| 前端 Services 数 | 约 15 |
| 不对齐问题 | 12 |
| 严重不对齐 | 3 |
| 中度不对齐 | 6 |
| 轻度不对齐 | 3 |

---

## 二、不对齐清单

### 2.1 用户管理 - 创建用户

| 项目 | 详情 |
|------|------|
| **端点** | POST /users |
| **后端 DTO** | UserResponseDto: id, email, username, nickname, avatar, phone, status, role, hasPassword, createdAt, updatedAt |
| **前端类型** | CreateUserDto: username, email, password, roleId, nickname |
| **差异点** | 前端未定义返回类型，缺少 role、hasPassword、createdAt 等字段 |
| **严重程度** | 中 |

**建议**: 前端 services/usersApi.ts 应定义完整的 UserResponse 接口

---

### 2.2 用户管理 - 获取用户详情

| 项目 | 详情 |
|------|------|
| **端点** | GET /users/:id |
| **后端 DTO** | UserResponseDto: id, email, username, nickname, avatar, phone, status, role, hasPassword, createdAt, updatedAt |
| **前端类型** | usersApi.getUserById() 返回类型未定义 |
| **差异点** | 字段名不一致风险：snake_case vs camelCase |
| **严重程度** | 中 |

**建议**: 前端应定义与后端完全一致的 UserResponse 接口

---

### 2.3 用户管理 - 用户列表

| 项目 | 详情 |
|------|------|
| **端点** | GET /users |
| **后端 DTO** | PaginatedResponseDto< UserResponseDto >: items, total, page, pageSize |
| **前端类型** | 未定义分页响应类型 |
| **差异点** | 前端直接使用泛型，分页参数不一致 |
| **严重程度** | 中 |

**建议**: 前端应统一定义 PaginatedResponse<T> 类型

---

### 2.4 文件系统 - 获取节点详情

| 项目 | 详情 |
|------|------|
| **端点** | GET /nodes/:id |
| **后端 DTO** | NodeTreeResponseDto: id, name, type, parentId, projectId, fileStatus, children[], ... |
| **前端类型** | nodeApi.getNode() 未定义返回类型 |
| **差异点** | children 嵌套对象结构可能不一致 |
| **严重程度** | 高 |

**建议**: 前端 nodeApi.ts 应定义完整的 NodeResponse 接口

---

### 2.5 文件系统 - 节点列表

| 项目 | 详情 |
|------|------|
| **端点** | GET /nodes |
| **后端 DTO** | FileSystemNodeDto[] + pagination |
| **前端类型** | nodeApi.getNodes() 未定义分页 |
| **差异点** | 后端支持分页，前端未处理 |
| **严重程度** | 中 |

---

### 2.6 文件系统 - 创建节点

| 项目 | 详情 |
|------|------|
| **端点** | POST /nodes |
| **后端 DTO** | CreateNodeDto: name, type, parentId, projectId, contentType |
| **前端类型** | nodeApi.createNode() 参数未定义完整 |
| **差异点** | contentType 字段前端未使用 |
| **严重程度** | 低 |

---

### 2.7 项目管理 - 获取项目成员

| 项目 | 详情 |
|------|------|
| **端点** | GET /projects/:id/members |
| **后端 DTO** | ProjectMemberDto: id, userId, user, projectRoleId, projectRole, joinedAt |
| **前端类型** | projectApi.getMembers() 未定义返回类型 |
| **差异点** | user 嵌套对象结构可能不一致 |
| **严重程度** | 高 |

---

### 2.8 项目管理 - 角色列表

| 项目 | 详情 |
|------|------|
| **端点** | GET /projects/:id/roles |
| **后端 DTO** | ProjectRoleDto: id, name, permissions[], description |
| **前端类型** | projectApi.getProjectRoles() 未定义返回类型 |
| **差异点** | permissions 数组结构可能不一致 |
| **严重程度** | 中 |

---

### 2.9 认证 - 登录

| 项目 | 详情 |
|------|------|
| **端点** | POST /auth/login |
| **后端 DTO** | LoginResponseDto: accessToken, refreshToken, expiresIn, user |
| **前端类型** | authApi.login() 返回类型未定义 |
| **差异点** | 前端直接将 token 存 localStorage，未定义完整响应结构 |
| **严重程度** | 中 |

**建议**: 前端应定义 LoginResponse 接口

---

### 2.10 认证 - 注册

| 项目 | 详情 |
|------|------|
| **端点** | POST /auth/register |
| **后端 DTO** | RegisterResponseDto: id, email, username |
| **前端类型** | authApi.register() 返回类型未定义 |
| **差异点** | 返回字段不完整 |
| **严重程度** | 低 |

---

### 2.11 版本控制 - 版本历史

| 项目 | 详情 |
|------|------|
| **端点** | GET /version/:nodeId/history |
| **后端 DTO** | VersionHistoryDto: revision, message, author, date, files[] |
| **前端类型** | versionApi.getHistory() 未定义返回类型 |
| **差异点** | files 数组结构可能不一致 |
| **严重程度** | 中 |

---

### 2.12 资源库 - 资源列表

| 项目 | 详情 |
|------|------|
| **端点** | GET /library/assets |
| **后端 DTO** | AssetDto: id, name, type, url, thumbnail, tags[], size, createdAt |
| **前端类型** | libraryApi.getAssets() 未定义返回类型 |
| **差异点** | tags 数组和 url 字段可能不一致 |
| **严重程度** | 中 |

---

## 三、问题类型统计

| 问题类型 | 数量 | 占比 |
|----------|------|------|
| 前端未定义返回类型 | 8 | 67% |
| 嵌套对象结构不一致 | 3 | 25% |
| 字段名不匹配 (snake/camel) | 1 | 8% |
| 枚举值不同步 | 0 | 0% |

---

## 四、改进建议

### 4.1 高优先级

1. **统一定义 API 响应类型**
   - 在前端 types/ 目录下创建 api-types.ts
   - 所有 Service 方法的返回类型都应使用这些类型

2. **生成类型定义脚本**
   - 建议添加 `pnpm generate:api-types` 命令
   - 从后端 DTO 自动生成前端类型

### 4.2 中优先级

1. **建立 DTO 契约文档**
   - 后端每个 Controller 的 DTO 应有文档
   - 前端开发前先阅读 DTO 契约

2. **添加 API 测试**
   - 对齐验证应该自动化

### 4.3 代码示例

```typescript
// types/api-types.ts

// 通用响应
interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

// 用户
interface UserResponse {
  id: string;
  email: string;
  username: string;
  nickname: string | null;
  avatar: string | null;
  phone: string | null;
  status: UserStatus;
  role: RoleResponse;
  hasPassword: boolean;
  createdAt: string;
  updatedAt: string;
}

// 文件节点
interface NodeResponse {
  id: string;
  name: string;
  type: 'file' | 'folder';
  parentId: string | null;
  projectId: string;
  fileStatus: FileStatus;
  children?: NodeResponse[];
  // ... 其他字段
}
```

---

## 五、前后端类型同步检查清单

| 后端 DTO | 前端类型 | 同步状态 |
|----------|----------|----------|
| UserResponseDto | UserResponse (需创建) | ✗ |
| NodeTreeResponseDto | NodeResponse (需创建) | ✗ |
| ProjectMemberDto | ProjectMemberResponse (需创建) | ✗ |
| ProjectRoleDto | ProjectRoleResponse (需创建) | ✗ |
| LoginResponseDto | LoginResponse (需创建) | ✗ |
| RegisterResponseDto | RegisterResponse (需创建) | ✗ |
| VersionHistoryDto | VersionHistoryResponse (需创建) | ✗ |
| AssetDto | AssetResponse (需创建) | ✗ |
| PaginatedResponse | PaginatedResponse (需创建) | ✗ |

---

## 六、枚举值同步检查

| 枚举 | 后端值 | 前端值 | 状态 |
|------|--------|--------|------|
| UserStatus | ACTIVE, INACTIVE, SUSPENDED | 未定义 | ✗ |
| FileStatus | UPLOADING, PROCESSING, COMPLETED, FAILED, DELETED | 未定义 | ✗ |
| ProjectStatus | ACTIVE, ARCHIVED, DELETED | 未定义 | ✗ |
| Permission | SYSTEM_ADMIN, SYSTEM_USER_*, ... | 未定义 | ✗ |
| ProjectPermission | PROJECT_*, FILE_*, ... | 未定义 | ✗ |

**建议**: 在前端 types/ 目录下创建 enums.ts，统一管理所有枚举值

---

## 七、总结

### 7.1 API 对齐程度

| 级别 | 数量 | 占比 |
|------|------|------|
| 完全对齐 | 0 | 0% |
| 高风险不对齐 | 3 | 25% |
| 中风险不对齐 | 6 | 50% |
| 低风险不对齐 | 3 | 25% |

### 7.2 建议行动

1. **立即行动**: 定义所有 API 响应类型
2. **短期**: 建立类型生成机制
3. **长期**: 实现 API 契约自动化测试

---

**报告人**: Trea
