# 前后端 API 对齐检查报告

## 概述

本报告检查了前端 `apps/frontend/src/services/` 与后端 `apps/backend/src/` 之间的数据结构一致性。

**注：由于前后端使用 Swagger OpenAPI 代码生成，类型主要通过 `OperationMethods` 保持一致。以下检查主要针对发现的问题。**

---

## 一、用户相关 DTO

### 1.1 UserResponseDto 对比

| 字段 | 后端 | 前端 (UserDto) | 状态 |
|-----|------|---------------|-----|
| id | ✅ | ✅ | 一致 |
| email | string (optional) | string \| null (optional) | 一致 |
| username | ✅ | ✅ | 一致 |
| nickname | optional | optional | 一致 |
| avatar | optional | optional | 一致 |
| phone | optional (string) | optional (string \| null) | 一致 |
| status | UserStatus enum | string enum ('ACTIVE', 'INACTIVE', 'SUSPENDED') | 一致 |
| role | UserRoleDto (id, name, description, isSystem) | object (id, name, description, isSystem, permissions) | ⚠️ 后端无 permissions 字段 |
| hasPassword | boolean | boolean (optional) | 一致 |
| createdAt | Date | ⚠️ 前端类型中缺失 | ⚠️ |
| updatedAt | Date | ⚠️ 前端类型中缺失 | ⚠️ |
| phoneVerified | ❌ | boolean (optional) | ⚠️ 前端有后端无 |
| wechatId | ❌ | string \| null (optional) | ⚠️ 前端有后端无 |
| provider | ❌ | string (optional) | ⚠️ 前端有后端无 |

### 1.2 关键问题

1. **前端 UserDto 包含后端没有的字段：**
   - `phoneVerified`
   - `wechatId`
   - `provider`
   - `role.permissions`

2. **后端有但前端类型中缺少的字段：**
   - `createdAt`
   - `updatedAt`

---

## 二、文件系统节点 DTO

### 2.1 FileSystemNodeDto 对比

| 字段 | 后端 | 前端 (通过 api-client 推断) | 状态 |
|-----|------|---------------------------|-----|
| id | ✅ | ✅ | 一致 |
| name | ✅ | ✅ | 一致 |
| description | optional | optional | 一致 |
| isFolder | ✅ | ✅ | 一致 |
| isRoot | ✅ | ✅ | 一致 |
| parentId | optional | optional | 一致 |
| path | optional | optional | 一致 |
| size | optional | optional | 一致 |
| mimeType | optional | optional | 一致 |
| fileHash | optional | optional | 一致 |
| fileStatus | FileStatus enum | string enum | 一致 |
| createdAt | Date | Date | 一致 |
| updatedAt | Date | Date | 一致 |
| deletedAt | optional | optional | 一致 |
| ownerId | ✅ | ✅ | 一致 |
| personalSpaceKey | optional | optional | 一致 |
| libraryKey | optional (drawing/block) | optional | 一致 |
| childrenCount | optional | optional | 一致 |
| projectId | optional | optional | 一致 |

### 2.2 状态

✅ 文件系统 DTO 基本对齐（通过 Swagger 代码生成保持一致）

---

## 三、认证 DTO

### 3.1 RegisterDto 对比

| 字段 | 后端 | 前端 | 状态 |
|-----|------|-----|-----|
| username | ✅ | ✅ | 一致 |
| password | ✅ | ✅ | 一致 |
| email | optional | optional | 一致 |
| nickname | optional | optional | 一致 |
| wechatTempToken | optional | optional | 一致 |

### 3.2 LoginDto 对比

| 字段 | 后端 | 前端 | 状态 |
|-----|------|-----|-----|
| account | ✅ | ✅ | 一致 |
| password | ✅ | ✅ | 一致 |

---

## 四、主要对齐问题总结

### 4.1 字段差异

| 问题类型 | 字段 | 说明 | 优先级 |
|--------|------|-----|-------|
| 前端有/后端无 | `phoneVerified` | UserDto | P1 |
| 前端有/后端无 | `wechatId` | UserDto | P1 |
| 前端有/后端无 | `provider` | UserDto | P1 |
| 前端有/后端无 | `role.permissions` | UserDto.role | P2 |
| 后端有/前端类型中缺失 | `createdAt` | UserProfileResponseDto 有 | P2 |
| 后端有/前端类型中缺失 | `updatedAt` | UserProfileResponseDto 有 | P2 |

### 4.2 类型一致性

✅ 大部分 API 通过 Swagger 代码生成（前端使用 `apiClient.ts` 的 `OperationMethods`），类型一致性良好。

✅ 枚举类型通过 Swagger 保持同步（UserStatus, FileStatus, ProjectStatus）。

---

## 五、修复建议

### 5.1 后端需要补充字段

如果前端确实需要 `phoneVerified`、`wechatId`、`provider` 等字段，后端 DTO 需要同步更新：

```typescript
// apps/backend/src/users/dto/user-response.dto.ts
export class UserResponseDto {
  // ... 现有字段

  @ApiPropertyOptional({ description: '手机号是否已验证' })
  phoneVerified?: boolean;

  @ApiPropertyOptional({ description: '微信 OpenID' })
  wechatId?: string;

  @ApiPropertyOptional({ description: '登录方式 (LOCAL | WECHAT)' })
  provider?: string;
}
```

### 5.2 前端类型需要对齐

如果前端不需要 `phoneVerified` 等字段，应该从类型中删除或标记为可选。

### 5.3 role.permissions 字段

需要确认：前端期望的 `role.permissions` 是否应该存在，还是应该通过独立 API 获取。

---

## 六、验证方法

确保每次修改 DTO 后重新生成前端类型：

```bash
# 后端生成 OpenAPI spec
pnpm build

# 前端重新生成 api-client
cd apps/frontend
# (根据项目配置，可能是 pnpm generate-api-client 或类似)
```

---

## 七、结论

✅ **整体对齐情况良好** - 通过 Swagger 代码生成，大部分 DTO 保持一致。

⚠️ **小部分字段存在差异** - 主要在用户角色信息和附加字段（微信、手机号验证）上。

**建议：**
1. 确认前端实际使用了哪些字段
2. 同步更新后端或前端类型
3. 建立自动化验证机制（比如通过 E2E 测试验证 API 响应类型）
