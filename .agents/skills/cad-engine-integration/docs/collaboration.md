# 协同 SDK 详细模式

> 交叉参考：`packages/frontend/src/hooks/useCollabActions.ts`（PC），`packages/frontend_mobile/src/composables/useCooperate.ts`（移动端）

## SDK 入口

```typescript
// packages/frontend/src/services/collaborationService.ts
export function getCooperate() {
  const mxCAD = MxCpp.getCurrentMxCAD();
  if (!mxCAD) return null;
  const cooperate = mxCAD.getCooperate();
  if (!cooperate) return null;
  cooperate.init({ server_addres: '/api/cooperate' });
  return cooperate;
}
```

`init()` 只需调用一次（模块级守卫 `cooperateInit` 防止重复）。

## 操作详解

### createWrok — 创建协同会话

```typescript
cooperate.createWrok(
  onResult,
  utf8ToBase64(JSON.stringify(workDataV3)),
  userId,
  utf8ToBase64(JSON.stringify(userData))
);
```

- **自动加入**：`workid > 0` = 成功 → 已自动加入协同（无需调 `joinWork`）
- **错误码 4**：session 已存在
- **WorkDataV3**：`{ v:3, drawingId, projectId, drawingName, sourceType, libraryKey?, creatorId, creatorName, creatorAvatar? }`
- **UserData**：`{ v, id, name, avatar? }`
- 编码：`utf8ToBase64(JSON.stringify(data))`

### joinWork — 加入已有会话

```typescript
cooperate.joinWork(workId, callback, userId, encodedUser);
```

- **SDK 自动打开文件** — 调用前需确保 UI 状态已就绪
- **结果码**：`0` = 成功, `17` = 会话恢复（也视为成功）, `5` = 已关闭, 负值 = SDK 繁忙

**防并发机制**：
```typescript
if (joiningLockRef.value) return;  // 阻止并发 joinWork
joiningLockRef.value = true;
try {
  await cooperate.joinWork(workId, ...);
} finally {
  joiningLockRef.value = false;
}
```

### exitWrok — 退出协同

```typescript
cooperate.exitWrok();  // 返回码 0 = 成功
```

- 退出后文件保持打开，回退到本地编辑
- **exitGuardRef**（3s 冷却期）：退出后 3 秒内阻止 auto-join 自动重新加入

### getWorks — 获取工作列表

```typescript
cooperate.getWorks(callback);  // callback 接收 Work[]
```

PC 端 `useCollabWorks` hook 轮询调用此方法，按当前文件/我的/项目分组。

## 自动加入机制

PC 端（`useCollabActions.ts` `autoJoinWithRetry`）：

```
最大重试次数: AUTO_JOIN_MAX_RETRIES (配置常量)
重试间隔: 1s
总超时: AUTO_JOIN_SAFETY_TIMEOUT
```

移动端（`useCollabAutoJoin.ts`）：相同模式，适配 Vue 响应式。

## PC 端 hook 入口

```typescript
// packages/frontend/src/hooks/useCollabActions.ts
const {
  handleCreateWork,     // 创建协同
  handleJoinWork,       // 加入协同
  handleExitWork,       // 退出协同
  isCreatingWork,
  isJoiningWork,
} = useCollabActions();

// packages/frontend/src/hooks/useCollabWorks.ts
const { works, isPolling, error } = useCollabWorks();
```

## 移动端 composable 入口

```typescript
// packages/frontend_mobile/src/composables/useCooperate.ts
const { works, currentWorkId, createWork, joinWork, exitWork } = useCooperate();
```

## 协同数据模型

```typescript
CollaborateWorkDataV3 = {
  v: 3,                   // 版本号
  drawingId: string,      // 图纸 ID
  projectId: string,      // 项目 ID
  drawingName: string,    // 图纸名称
  sourceType: string,     // 来源类型
  libraryKey?: string,    // 图纸库标识
  creatorId: string,
  creatorName: string,
  creatorAvatar?: string,
}

CollaborateUserData = {
  v: number,
  id: string,
  name: string,
  avatar?: string,
}

Work = {
  work_id: number,
  work_data: string,       // Base64 JSON
  real_user_id: string,    // 实际用户 ID
  link_user_ids: string[],  // 关联用户
  link_user_data: string[], // 关联用户数据
}
```

## 并发控制要点

| 机制 | 作用 |
|------|------|
| `joiningLockRef` | 防止并发 joinWork 调用 |
| `exitGuardRef` (3s) | 退出后冷却期，防止 auto-join 干扰 |
| `AUTO_JOIN_SAFETY_TIMEOUT` | 自动加入超时防止加载无限旋转 |
| `cooperateInit` 守卫 | 确保 `cooperate.init()` 只调用一次 |

## 状态管理

PC 端（Zustand `useCADEditorStore`）：
```typescript
isInCollaboration: boolean
collaborationWorkId: number
fromCollabShare: boolean
targetCollabWorkId: number
collabShareLibraryKey: string
```

移动端（Pinia store `collab.ts`）：相同字段，Vue reactive 适配。
