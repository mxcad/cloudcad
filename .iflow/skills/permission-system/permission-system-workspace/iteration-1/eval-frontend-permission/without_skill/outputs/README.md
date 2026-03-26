# 前端删除按钮权限控制实现说明

## 需求

前端有个删除按钮，需要根据用户的项目权限来控制显示隐藏：
- 项目 ID: `projectId`
- 检查权限: `FILE_DELETE`

## 核心实现方案

### 使用的 Hook 和常量

```typescript
import { useProjectPermission } from '../hooks/useProjectPermission';
import { ProjectPermission } from '../constants/permissions';
```

### 关键 API

1. **`useProjectPermission` Hook** 提供以下方法：
   - `checkPermission(projectId, permission)` - 检查单个权限
   - `checkAnyPermission(projectId, permissions[])` - 检查是否具有任意一个权限
   - `checkAllPermissions(projectId, permissions[])` - 检查是否具有所有权限

2. **`ProjectPermission` 常量** 包含：
   - `FILE_DELETE` - 删除文件权限
   - 其他文件相关权限：`FILE_EDIT`, `FILE_UPLOAD`, `FILE_DOWNLOAD` 等

## 实现方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| 方案一：基本实现 | 简单直接，无权限时隐藏 | 无禁用状态提示 | 权限控制严格的场景 |
| 方案二：带禁用状态 | 用户可见但不可操作，有提示 | 按钮占用空间 | 需要提示用户有无权限的场景 |
| 方案三：通用组件 | 可复用，支持多种权限 | 需要额外封装 | 多个权限按钮复用 |
| 方案四：批量检查 | 多权限并行检查，性能好 | 代码稍复杂 | 工具栏等需要检查多个权限的场景 |

## 缓存机制

`useProjectPermission` 内置了缓存机制：
- 缓存时间：5 分钟
- 最大缓存条目：100 条
- 相同 projectId + permission 的重复检查会命中缓存

## 最佳实践

1. **使用 `useEffect` 在组件挂载时检查权限**
   ```typescript
   useEffect(() => {
     const check = async () => {
       const result = await checkPermission(projectId, ProjectPermission.FILE_DELETE);
       setCanDelete(result);
     };
     check();
   }, [projectId, checkPermission]);
   ```

2. **使用 `Promise.all` 并行检查多个权限**
   ```typescript
   const [canEdit, canDelete, canDownload] = await Promise.all([
     checkPermission(projectId, ProjectPermission.FILE_EDIT),
     checkPermission(projectId, ProjectPermission.FILE_DELETE),
     checkPermission(projectId, ProjectPermission.FILE_DOWNLOAD),
   ]);
   ```

3. **加载状态处理**
   - 在加载期间不显示按钮，避免闪烁
   - 或者显示加载占位符

4. **权限变更后刷新缓存**
   ```typescript
   const { refreshProjectPermissions } = useProjectPermission();
   // 权限变更后调用
   refreshProjectPermissions(projectId);
   ```

## 完整代码

详见 `delete-button-permission-example.tsx` 文件。
