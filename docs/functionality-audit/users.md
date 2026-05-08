# 用户管理模块 — 功能审计

> **对比源：** `main` (旧版，功能完整) vs `refactor/circular-deps` (新版，重构中)
> **审计日期：** 2026-05-08

---

## 后端 API：users.controller.ts

| 端点 | main | refactor | 意图是否一致 |
|---|---|---|---|
| `POST /users` | 创建用户 | 创建用户 | ✅ 一致 |
| `GET /users` | 用户列表 (分页/搜索/筛选/排序) | 用户列表 (分页/搜索/筛选/排序) | ✅ 一致 |
| `GET /users/search/by-email` | 按邮箱搜索 | 按邮箱搜索 | ✅ 一致 |
| `GET /users/search` | 项目成员搜索 | 项目成员搜索 | ✅ 一致 |
| `GET /users/profile/me` | 当前用户信息 | 当前用户信息 | ✅ 一致 |
| `GET /users/stats/me` | 仪表盘统计 | 仪表盘统计 | ✅ 一致 |
| `PATCH /users/profile/me` | 更新个人信息 (含用户名修改限制) | 更新个人信息 (含用户名修改限制) | ✅ 一致 |
| `GET /users/:id` | 按 ID 查用户 | 按 ID 查用户 | ✅ 一致 |
| `PATCH /users/:id` | 更新用户 | 更新用户 | ✅ 一致 |
| `DELETE /users/:id` | 软删除用户 | 软删除用户 | ✅ 一致 |
| `POST /users/:id/restore` | 恢复已注销用户 | 恢复已注销用户 | ✅ 一致 |
| `POST /users/:id/delete-immediately` | 立即注销用户 | 立即注销用户 | ✅ 一致 |
| `POST /users/deactivate-account` | 自助注销账户 | 自助注销账户 | ✅ 一致 |
| `POST /users/me/restore` | 自助恢复账户 | 自助恢复账户 | ✅ 一致 |
| `POST /users/change-password` | 修改密码 | 修改密码 | ✅ 一致 |
| `PATCH /users/:id/status` | — | 更新用户状态 | 🔴 NEEDS DECISION |

### Controller 总结

两个分支的控制器 **几乎完全相同**。唯一差异是：

- **main 分支**：`PATCH /users/:id/status` 路由不存在于控制器中（`updateStatus` 在 service 中存在但无路由暴露）。
- **refactor 分支**：新增了 `PATCH /users/:id/status` 暴露了 `updateStatus` 功能。

这实际上是 refactor 分支的 **增强**，但需要确认是否符合安全要求（现有权限使用 `SYSTEM_USER_UPDATE`，已在 main 分支的 service 层存在）。

---

## 后端：users.service.ts

### 意图对比：所有业务逻辑函数

| 函数 | main | refactor | 意图 |
|---|---|---|---|
| `create()` | bcrypt 直接加密，事务创建用户+私人空间 | 注入 IPasswordHasher 加密，事务创建用户+私人空间，emit user.created 事件 | ✅ 一致 |
| `findAll()` | 分页/搜索/筛选/排序/项目权限检查 | 同，加了 safePage/safeLimit 安全转换 | ✅ 一致 |
| `findOne()` | 按 ID 查询，排除密码返回 hasPassword | 通过 findByIdInternal 私有方法 | ✅ 一致 |
| `findById()` | — | 实现 IUserService 接口 | ✅ 新增接口方法 |
| `findByEmail()` | 按邮箱查询 | 同 | ✅ 一致 |
| `findByEmailWithPassword()` | 含密码查询（用于登录） | 同 | ✅ 一致 |
| `update()` | 更新用户，bcrypt 加密密码，清除缓存 | 注入 IPasswordHasher，清除缓存 | ✅ 一致 |
| `softDelete()` | 软删除，解绑手机/邮箱/微信，30天冷静期 | 同，emit user.deactivated 事件 | ✅ 一致 |
| `deleteImmediately()` | 立即清理+物理删除 | 同 | ✅ 一致 |
| `restore()` | 恢复已注销用户 | 同，emit user.restored 事件 | ✅ 一致 |
| `remove()` | 物理删除（保留方法） | 同 | ✅ 一致 |
| `deactivate()` / `deactivateAccount()` | 自助注销，inline if/else 验证 | 策略模式 (IAccountVerificationStrategy) | ✅ 一致 |
| `restoreAccount()` | 自助恢复，inline if/else 验证 | 策略模式 | ✅ 一致 |
| `updateStatus()` | 更新状态 | 同 | ✅ 一致 |
| `validatePassword()` | bcrypt.compare | IPasswordHasher.compare | ✅ 一致 |
| `changePassword()` | bcrypt 修改密码 | IPasswordHasher 修改密码 | ✅ 一致 |
| `getDashboardStats()` | 统计项目/文件/存储 | 同 | ✅ 一致 |

### Service 总结

- **所有核心业务逻辑意图一致**，差异仅在于实现模式：
  - main：直接使用 `bcrypt`，inline 条件分支验证
  - refactor：依赖注入 `IPasswordHasher`、`IAccountVerificationStrategy` 策略模式、`EventEmitter2` 生命周期事件
- 增强：refactor 实现了 `IUserService` 接口，增加了 `findById()` 接口方法，发送领域事件
- 无功能缺失

---

## 前端：UserManagement 页面

### main 分支：单体组件 `packages/frontend/src/pages/UserManagement.tsx` (2416 行)

**完整功能清单：**

1. **权限控制** — `canAccess` + `hasPermission(SYSTEM_USER_READ)` 双重检查
2. **用户列表** — 分页 (20条/页)、搜索 (邮箱/用户名/昵称/手机号)、角色筛选、排序 (createdAt/username/email, asc/desc)
3. **活跃/已注销 Tab 切换** — `userTab: 'active' | 'deleted'`
4. **创建用户** — Modal 表单：用户名、邮箱、手机号(SMS开关控制)、密码、昵称、角色
5. **编辑用户** — Modal 表单：用户名、邮箱、手机号(SMS开关控制)、新密码(可选)、昵称、角色、状态
6. **删除用户** — 确认 Modal：支持 30天冷静期 或 立即注销(复选框)
7. **恢复用户** — 已注销 Tab 中显示恢复按钮
8. **存储配额管理** — Modal：显示用户信息、当前配额、默认配额、GB 输入框、保存
9. **已注销用户清理** — Modal：显示待清理统计、冷静期天数、过期截止日期、触发清理按钮
10. **运行时配置** — 从 `runtimeConfigApi.getPublicConfigs()` 加载 `mailEnabled`、`smsEnabled`
11. **表单验证** — 用户名 (3-20字符, 字母数字下划线正则), 邮箱 (格式+mailEnabled 必填), 密码 (8-50字符, 新建必填)
12. **角色显示名** — `getRoleDisplayName(role.name, role.isSystem)` 在表格和表单中使用
13. **邮件/手机号列** — 根据 `mailEnabled`/`smsEnabled` 条件渲染
14. **成功/错误提示** — Toast + 错误横幅
15. **加载/空状态** — Loading spinner、空状态占位、权限不足提示

### refactor 分支：拆分为 `packages/frontend/src/pages/UserManagement/`

文件结构：
```
UserManagement/
├── index.tsx                  # 主页面组件 (631行)
├── UserTable.tsx              # 表格组件 (161行)
├── UserSearchBar.tsx           # 搜索栏组件 (122行) — 未使用！
├── UserQuotaModal.tsx          # 配额弹窗组件 (91行) — 未使用！
├── UserManagementStyles.ts    # 样式 (1137行)
├── UserManagement.spec.tsx    # 测试
├── UserModals/
│   ├── CreateUserModal.tsx    # 创建用户弹窗 (120行)
│   ├── EditUserModal.tsx      # 编辑用户弹窗 (126行)
│   └── DeleteUserConfirm.tsx  # 删除确认弹窗 (73行)
└── hooks/
    ├── useUserCRUD.ts          # API 调用 + React Query (146行)
    ├── useUserSearch.ts        # 搜索状态 hook (44行)
    ├── useUserForm.ts          # 表单 hook
    ├── userFormSchema.ts       # 表单校验 schema
    └── *.spec.ts               # 测试文件
```

---

## 🔴 NEEDS DECISION — 意图不同的项目

### 1. `mailEnabled` / `smsEnabled` 硬编码为 false

| 项目 | main | refactor |
|---|---|---|
| `mailEnabled` | 从 `runtimeConfigApi.getPublicConfigs()` 动态加载 | `useUserCRUD.ts` 第112行硬编码 `mailEnabled: false` |
| `smsEnabled` | 从 `runtimeConfigApi.getPublicConfigs()` 动态加载 | `useUserCRUD.ts` 第113行硬编码 `smsEnabled: false` |

**影响：**
- 邮箱列永远不会在表格中显示
- 手机号列永远不会在表格中显示
- 创建/编辑表单中无手机号字段
- 邮箱必填校验失效（`mailEnabled` 为 false 时 `required` 不显示）

**决策：** 是故意去掉邮件/短信功能，还是需要从运行时配置加载？

---

### 2. 手机号表单字段缺失

| 项目 | main | refactor |
|---|---|---|
| CreateUserModal | 表单含 `phone` 字段（smsEnabled 控制） | 无 phone 字段 |
| EditUserModal | 表单含 `phone` 字段（smsEnabled 控制） | 无 phone 字段 |
| `useUserCRUD` 接口 | — | 无 phone 相关方法 |

**决策：** 是产品需求变更（不再需要手机号），还是遗漏？

---

### 3. `UserSearchBar.tsx` 和 `UserQuotaModal.tsx` 提取但未使用

这两个组件已从 main 分支抽取为独立文件，但在 `index.tsx` 中：

- `UserSearchBar` — **import 了但未渲染**，筛选栏代码在 `index.tsx` 第399-470行内联重复实现
- `UserQuotaModal` — **import 了但未渲染**，配额弹窗代码在 `index.tsx` 第522-577行内联重复实现

**决策：** 应该使用已提取的组件还是删除它们？这会造成代码维护问题（修改需要改两处）。

---

### 4. `EditUserModal` 用户名字段被禁用

| 项目 | main | refactor |
|---|---|---|
| 用户名字段 | 可编辑 `<input>` | `<input disabled>` (第63行) |

main 分支允许管理员修改用户名（后端 controller 有用户名修改限制逻辑）。

**决策：** 是故意的 UX 变更（不允许管理员改用户名），还是遗漏？

---

### 5. `EditUserModal` 角色显示名不一致

| 项目 | main | refactor |
|---|---|---|
| 角色选项显示 | `getRoleDisplayName(role.name, role.isSystem)` | `role.name`（原始名称） |

main 分支在表格和表单中统一使用 `getRoleDisplayName` 显示本地化角色名。refactor 的 `EditUserModal` 中直接显示 `role.name`，而在筛选栏中仍使用 `getRoleDisplayName`。

**决策：** 需要统一使用 `getRoleDisplayName`。

---

### 6. 表单验证简化

| 项目 | main | refactor |
|---|---|---|
| 用户名格式 | `/^[a-zA-Z0-9_]+$/` 正则 | 无格式检查 |
| 邮箱格式 | `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` 正则 | 无格式检查 |
| 密码长度范围 | 8-50 字符 | 无长度检查 |

**决策：** 是否有独立的表单校验方案（如 `userFormSchema.ts`）来替代？

---

## 🟢 意图相同但缺失/损坏 — 需要修复

### 修复 1：恢复 `mailEnabled` / `smsEnabled` 运行时配置加载

`useUserCRUD.ts` 当前硬编码 `false`，需要添加 runtime config 查询：

```ts
// useUserCRUD.ts 需要添加
const { data: runtimeConfig } = useQuery({
  queryKey: ['runtime-config'],
  queryFn: async () => {
    const result = await runtimeConfigControllerGetPublicConfigs();
    return result.data;
  },
});
const mailEnabled = runtimeConfig?.mailEnabled === true;
const smsEnabled = runtimeConfig?.smsEnabled === true;
```

### 修复 2：使用已提取的 `UserSearchBar` 和 `UserQuotaModal`

`index.tsx` 中已 import 但未使用，需替换内联代码为组件调用。

### 修复 3：`EditUserModal` 统一使用 `getRoleDisplayName`

将 `EditUserModal.tsx` 第106行的 `{role.name}` 改为 `{getRoleDisplayName(role.name, role.isSystem ?? false)}`。

---

## 功能覆盖汇总

| 功能 | main | refactor | 状态 |
|---|---|---|---|
| 用户列表 + 分页 | ✅ | ✅ | ✅ 正常 |
| 搜索 (邮箱/用户名/昵称/手机号) | ✅ | ✅ | ✅ 正常 |
| 角色筛选 | ✅ | ✅ | ✅ 正常 |
| 排序 | ✅ | ✅ | ✅ 正常 |
| 活跃/已注销 Tab | ✅ | ✅ | ✅ 正常 |
| 创建用户 (含手机号) | ✅ | ❌ 缺手机号 | 🔴 NEEDS DECISION |
| 编辑用户 (含手机号) | ✅ | ❌ 缺手机号 | 🔴 NEEDS DECISION |
| 编辑用户名 | ✅ | ❌ disabled | 🔴 NEEDS DECISION |
| 删除用户 (软删除+立即) | ✅ | ✅ | ✅ 正常 |
| 恢复用户 | ✅ | ✅ | ✅ 正常 |
| 存储配额管理 | ✅ | ✅ | ✅ 正常 |
| 清理已注销用户 | ✅ | ✅ | ✅ 正常 |
| 邮件/短信运行时配置 | ✅ | ❌ 硬编码 false | 🔴 NEEDS DECISION |
| 条件列渲染 (邮箱/手机) | ✅ | ❌ | 依赖 mailEnabled/smsEnabled |
| 角色显示名 (getRoleDisplayName) | ✅ | ⚠️ 部分缺失 | 🟢 需修复 |
| 表单验证 (正则/长度) | ✅ | ⚠️ 简化 | 🔴 NEEDS DECISION |
| 权限控制 | ✅ | ✅ | ✅ 正常 |
| 成功/错误提示 | ✅ | ✅ | ✅ 正常 |
| 加载/空状态 | ✅ | ✅ (UserTable) | ✅ 正常 |
| 组件拆分 | ❌ 单体2416行 | ✅ 多个文件 | ✅ 架构改善 |
| 单元测试 | ❌ | ✅ | ✅ 新增 |
| React Query 数据管理 | ❌ | ✅ | ✅ 新增 |

---

## 建议操作

1. **立即修复：** 使用已提取的 `UserSearchBar` / `UserQuotaModal` 组件，避免重复代码
2. **立即修复：** `EditUserModal` 角色显示名统一使用 `getRoleDisplayName`
3. **需要决策：** `mailEnabled` / `smsEnabled` / 手机号支持 — 是永久移除还是临时遗漏？
4. **需要决策：** EditUserModal 用户名字段 disabled — 是 UX 变更还是遗漏？
5. **需要决策：** 表单验证简化 — 是否有替代方案 (react-hook-form + zod)？
