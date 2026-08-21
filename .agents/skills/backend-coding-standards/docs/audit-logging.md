# 审计日志规范

记录谁（用户）在何时（时间戳）做了什么（操作类型）的不可篡改记录。所有敏感操作必须记录审计日志。

## 使用方式

无需注入额外服务。通过 `AuditLogger`（继承 `ConsoleLogger`）全局拦截 `context='audit'` 的日志，自动写入数据库。

```typescript
this.logger.log({
  action: 'USER_DELETE',        // 必填 — 操作类型
  resourceType: 'User',         // 必填 — 资源类型
  resourceId: userId,           // 可选 — 资源 ID
  userId: operatorId,           // 必填 — 操作执行者
  success: true,                // 必填 — 操作是否成功
  errorMessage: undefined,      // 可选 — 失败时描述原因
  details: { reason: '...' },   // 可选 — 额外上下文
}, 'audit');
```

## 需要记录的典型操作

| 操作类别 | action 示例 | resourceType |
|---------|-----------|-------------|
| 权限变更 | `ROLE_ASSIGN`, `ROLE_REVOKE`, `PERMISSION_GRANT` | Role, Permission |
| 用户管理 | `USER_CREATE`, `USER_DELETE`, `USER_UPDATE` | User |
| 敏感文件操作 | `FILE_DELETE`, `FILE_PERMANENTLY_DELETE`, `FILE_RESTORE` | FileNode |
| 系统配置修改 | `CONFIG_UPDATE` | RuntimeConfig |
| 项目操作 | `PROJECT_CREATE`, `PROJECT_DELETE`, `PROJECT_MEMBER_ADD` | Project |

## 关键约定

- **action 必填**：使用大写蛇形命名（如 `FILE_DELETE`）
- **resourceType 必填**：使用 PascalCase（如 `FileNode`）
- **userId 必填**：记录操作执行者，不是被操作对象
- **success 必填**：区分成功和失败操作
- **errorMessage**：操作失败时记录原因，便于排查

## ❌ 错误 vs ✅ 正确

```typescript
// ❌ 错误 — 敏感操作未记录日志
async deleteFile(nodeId: string, userId: string) {
  await this.fileService.delete(nodeId);
  // 无日志记录
}
```

```typescript
// ✅ 正确 — 记录完整审计日志
async deleteFile(nodeId: string, userId: string) {
  try {
    await this.fileService.delete(nodeId);
    this.logger.log({
      action: 'FILE_DELETE',
      resourceType: 'FileNode',
      resourceId: nodeId,
      userId,
      success: true,
    }, 'audit');
  } catch (error) {
    this.logger.log({
      action: 'FILE_DELETE',
      resourceType: 'FileNode',
      resourceId: nodeId,
      userId,
      success: false,
      errorMessage: error.message,
    }, 'audit');
    throw error;
  }
}
```

## 文档引用

- 领域术语：`CONTEXT.md` — 审计日志（AuditLog）
- 后端编码规范：加载 `backend-coding-standards` Skill
