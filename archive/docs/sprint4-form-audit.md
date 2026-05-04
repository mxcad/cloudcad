# 前端表单代码全量审计报告

**报告时间**: 2026-05-03
**分析范围**: `d:\project\cloudcad\packages\frontend\src`

---

## 一、表单清单概览

| 页面/组件 | 表单数 | 复杂度 |
|----------|--------|--------|
| Login.tsx | 1 | 低 |
| Register.tsx | 1 | 中 |
| Profile.tsx | 5 | 高 |
| ResetPassword.tsx | 1 | 低 |
| ForgotPassword.tsx | 1 | 低 |
| UserManagement.tsx | 1 | 中 |
| RoleManagement.tsx | 1 | 中 |
| FileSystemManager.tsx | 3 | 高 |
| LibraryManager.tsx | 2 | 中 |
| AuditLogPage.tsx | 1 | 低 |
| ProjectModal.tsx | 2 | 中 |
| MembersModal.tsx | 2 | 中 |
| SaveAsModal.tsx | 1 | 低 |
| CreateFolderModal.tsx | 1 | 低 |
| FontLibrary.tsx | 1 | 中 |

**总计**: 24 个表单

---

## 二、详细表单清单

### 2.1 Login.tsx - 登录表单

**文件路径**: `pages/Login.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| username | text | '' | required, minLength(3) |
| password | password | '' | required, minLength(6) |
| captcha | text | '' | required, length(4) |
| rememberMe | checkbox | false | - |

**提交API**: authApi.login(username, password)
**错误处理**: 显示错误信息到表单顶部
**加载状态**: 登录按钮显示 loading 状态
**特殊逻辑**:
- 记住我选项延长 token 有效期
- 验证码点击刷新

---

### 2.2 Register.tsx - 注册表单

**文件路径**: `pages/Register.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| username | text | '' | required, minLength(3), maxLength(20) |
| email | email | '' | required, email 格式 |
| password | password | '' | required, minLength(8), 包含大小写和数字 |
| confirmPassword | password | '' | required, 与 password 一致 |
| smsCode | text | '' | required, length(6) |
| agreeTerms | checkbox | false | required |

**提交API**: authApi.register(username, email, password, smsCode)
**错误处理**: 字段级错误显示
**加载状态**: 注册按钮 loading
**特殊逻辑**:
- 密码强度实时校验
- 短信验证码发送和倒计时

---

### 2.3 Profile.tsx - 用户资料 (5个表单)

#### ProfileAccountTab.tsx - 账户信息

**文件路径**: `pages/Profile/ProfileAccountTab.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| username | text | 用户名 | required, minLength(3) |
| nickname | text | 昵称 | maxLength(50) |
| avatar | file | null | image 类型 |

**提交API**: usersApi.updateProfile(data)
**错误处理**: 字段级错误
**加载状态**: 保存按钮 loading

#### ProfileEmailTab.tsx - 邮箱修改

**文件路径**: `pages/Profile/ProfileEmailTab.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| email | email | 当前邮箱 | required, email 格式 |
| emailCode | text | '' | required, length(6) |

**提交API**: usersApi.changeEmail(email, emailCode)
**错误处理**: 字段级错误
**加载状态**: 验证按钮 loading
**特殊逻辑**: 发送验证码倒计时

#### ProfilePasswordTab.tsx - 密码修改

**文件路径**: `pages/Profile/ProfilePasswordTab.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| oldPassword | password | '' | required |
| newPassword | password | '' | required, minLength(8) |
| confirmPassword | password | '' | required, 与 newPassword 一致 |

**提交API**: usersApi.changePassword(oldPassword, newPassword)
**错误处理**: 字段级错误
**加载状态**: 保存按钮 loading

#### ProfilePhoneTab.tsx - 手机修改

**文件路径**: `pages/Profile/ProfilePhoneTab.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| phone | tel | '' | required, 手机号格式 |
| smsCode | text | '' | required, length(6) |

**提交API**: usersApi.changePhone(phone, smsCode)
**错误处理**: 字段级错误
**加载状态**: 验证按钮 loading

#### ProfileWechatTab.tsx - 微信绑定

**文件路径**: `pages/Profile/ProfileWechatTab.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| wechatCode | text | '' | required, minLength(5) |

**提交API**: usersApi.bindWechat(wechatCode)
**错误处理**: 字段级错误
**加载状态**: 绑定按钮 loading

---

### 2.4 ResetPassword.tsx - 重置密码

**文件路径**: `pages/ResetPassword.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| password | password | '' | required, minLength(8) |
| confirmPassword | password | '' | required, 与 password 一致 |

**提交API**: authApi.resetPassword(token, password)
**错误处理**: 表单顶部错误提示
**加载状态**: 重置按钮 loading

---

### 2.5 ForgotPassword.tsx - 忘记密码

**文件路径**: `pages/ForgotPassword.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| email | email | '' | required, email 格式 |

**提交API**: authApi.forgotPassword(email)
**错误处理**: 字段级错误
**加载状态**: 发送按钮 loading
**特殊逻辑**: 发送后显示成功提示和倒计时

---

### 2.6 UserManagement.tsx - 用户管理表单

**文件路径**: `pages/UserManagement.tsx`

#### 创建用户表单 (CreateUserModal)

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| username | text | '' | required, minLength(3) |
| email | email | '' | required, email 格式 |
| password | password | '' | required, minLength(8) |
| roleId | select | '' | required |
| nickname | text | '' | maxLength(50) |

**提交API**: usersApi.createUser(data)
**错误处理**: 弹窗内错误提示
**加载状态**: 创建按钮 loading

#### 编辑用户表单 (EditUserModal)

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| username | text | 当前用户名 | required, minLength(3) |
| email | email | 当前邮箱 | required, email 格式 |
| roleId | select | 当前角色 | required |
| nickname | text | 当前昵称 | maxLength(50) |

**提交API**: usersApi.updateUser(id, data)
**错误处理**: 弹窗内错误提示
**加载状态**: 保存按钮 loading

---

### 2.7 RoleManagement.tsx - 角色管理表单

**文件路径**: `pages/RoleManagement.tsx`

#### 创建角色表单

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | '' | required, minLength(2) |
| description | textarea | '' | maxLength(200) |
| permissions | multi-select | [] | required |

**提交API**: rolesApi.createRole(data)
**错误处理**: 字段级错误
**加载状态**: 创建按钮 loading

#### 编辑角色表单

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | 当前名称 | required, minLength(2) |
| description | textarea | 当前描述 | maxLength(200) |
| permissions | multi-select | 当前权限 | required |

**提交API**: rolesApi.updateRole(id, data)
**错误处理**: 字段级错误
**加载状态**: 保存按钮 loading

---

### 2.8 FileSystemManager.tsx - 文件系统管理表单

#### 创建节点表单 (CreateNodeModal)

**文件路径**: `components/file-system-manager/FileSystemModals.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | '' | required, 文件名规则 |
| type | select | 'file' | required |
| parentId | hidden | null | - |

**提交API**: nodeApi.createNode(data)
**错误处理**: 弹窗内错误提示
**加载状态**: 创建按钮 loading

#### 重命名表单 (RenameModal)

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | 原名称 | required, 文件名规则 |

**提交API**: nodeApi.renameNode(id, name)
**错误处理**: 字段级错误
**加载状态**: 确认按钮 loading

#### 移动/复制表单 (MoveModal)

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| targetParentId | tree-select | '' | required |
| operation | select | 'move' | required |

**提交API**: nodeApi.moveNode(id, targetParentId) / nodeApi.copyNode(id, targetParentId)
**错误处理**: 弹窗内错误提示
**加载状态**: 确认按钮 loading

---

### 2.9 ProjectModal.tsx - 项目弹窗表单

#### 创建项目表单

**文件路径**: `components/modals/ProjectModal.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | '' | required, minLength(1) |
| description | textarea | '' | maxLength(500) |
| visibility | select | 'private' | required |

**提交API**: projectApi.createProject(data)
**错误处理**: 弹窗内错误提示
**加载状态**: 创建按钮 loading

#### 编辑项目表单

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | 当前名称 | required, minLength(1) |
| description | textarea | 当前描述 | maxLength(500) |
| visibility | select | 当前可见性 | required |

**提交API**: projectApi.updateProject(id, data)
**错误处理**: 弹窗内错误提示
**加载状态**: 保存按钮 loading

---

### 2.10 MembersModal.tsx - 成员管理表单

#### 添加成员表单

**文件路径**: `components/modals/MembersModal.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| userId | select | '' | required |
| projectRoleId | select | '' | required |

**提交API**: projectApi.addMember(projectId, data)
**错误处理**: 弹窗内错误提示
**加载状态**: 添加按钮 loading

#### 修改角色表单

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| projectRoleId | select | 当前角色 | required |

**提交API**: projectApi.updateMember(projectId, userId, data)
**错误处理**: 弹窗内错误提示
**加载状态**: 保存按钮 loading

---

### 2.11 SaveAsModal.tsx - 另存为表单

**文件路径**: `components/modals/SaveAsModal.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | 当前文件名 | required |
| targetFolderId | tree-select | 当前目录 | required |

**提交API**: nodeApi.saveAs(nodeId, data)
**错误处理**: 弹窗内错误提示
**加载状态**: 保存按钮 loading
**特殊逻辑**: 检查同名文件冲突

---

### 2.12 CreateFolderModal.tsx - 创建文件夹表单

**文件路径**: `components/modals/CreateFolderModal.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | '' | required, 文件夹名规则 |

**提交API**: nodeApi.createFolder(parentId, name)
**错误处理**: 字段级错误
**加载状态**: 创建按钮 loading

---

### 2.13 LibraryManager.tsx - 资源库管理表单

#### 上传资源表单

**文件路径**: `pages/LibraryManager.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| file | file | null | required, 指定格式 |
| name | text | 文件名 | required |
| tags | multi-select | [] | - |

**提交API**: libraryApi.uploadAsset(data)
**错误处理**: 弹窗内错误提示
**加载状态**: 上传进度条

#### 编辑资源表单

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| name | text | 当前名称 | required |
| tags | multi-select | 当前标签 | - |

**提交API**: libraryApi.updateAsset(id, data)
**错误处理**: 字段级错误
**加载状态**: 保存按钮 loading

---

### 2.14 AuditLogPage.tsx - 审计日志表单

**文件路径**: `pages/AuditLogPage.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| startDate | date | 30天前 | - |
| endDate | date | 今天 | - |
| userId | select | '' | - |
| action | select | '' | - |

**提交API**: auditApi.getLogs(filters)
**错误处理**: 表单顶部错误提示
**加载状态**: 查询按钮 loading，分页 loading
**特殊逻辑**: 导出功能

---

### 2.15 FontLibrary.tsx - 字体库表单

**文件路径**: `pages/FontLibrary.tsx`

| 字段名 | 类型 | 初始值 | 校验规则 |
|--------|------|--------|----------|
| file | file | null | required, .ttf/.otf 格式 |
| name | text | 文件名 | required |
| category | select | '' | - |

**提交API**: fontsApi.uploadFont(data)
**错误处理**: 弹窗内错误提示
**加载状态**: 上传进度条

---

## 三、vee-validate + zod 转换建议

### 3.1 通用校验规则映射

| React Hook Form 规则 | zod 规则 |
|----------------------|----------|
| required | z.string().min(1).nonempty() |
| minLength(3) | z.string().min(3) |
| maxLength(50) | z.string().max(50) |
| email | z.string().email() |
| min(0) | z.number().min(0) |
| pattern | z.string().regex() |

### 3.2 表单状态管理建议

```typescript
// Vue 3 + vee-validate + zod 示例
import { useForm } from 'vee-validate';
import { toTypedSchema } from '@vee-validate/zod';

const loginSchema = z.object({
  username: z.string().min(3, '用户名至少3个字符'),
  password: z.string().min(6, '密码至少6个字符'),
  captcha: z.string().length(4, '验证码4位'),
  rememberMe: z.boolean(),
});

const { handleSubmit, values, errors, meta } = useForm({
  validationSchema: toTypedSchema(loginSchema),
  initialValues: {
    username: '',
    password: '',
    captcha: '',
    rememberMe: false,
  },
});
```

### 3.3 特殊字段处理

| 字段类型 | Vue 组件建议 |
|----------|--------------|
| password | v-text-field (type="password") |
| email | v-text-field (type="email") |
| select | v-select |
| multi-select | v-select (multiple) |
| tree-select | 自定义 v-tree-select 或 v-autocomplete |
| date | v-date-picker 或 v-text-field (type="date") |
| file | v-file-input |
| checkbox | v-checkbox |
| textarea | v-textarea |

---

## 四、迁移检查清单

- [ ] Login.tsx - 登录表单
- [ ] Register.tsx - 注册表单
- [ ] Profile.tsx - 5个Tab表单
- [ ] ResetPassword.tsx - 重置密码表单
- [ ] ForgotPassword.tsx - 忘记密码表单
- [ ] UserManagement.tsx - 用户管理表单 (2个)
- [ ] RoleManagement.tsx - 角色管理表单 (2个)
- [ ] FileSystemManager.tsx - 文件系统表单 (3个)
- [ ] ProjectModal.tsx - 项目表单 (2个)
- [ ] MembersModal.tsx - 成员管理表单 (2个)
- [ ] SaveAsModal.tsx - 另存为表单
- [ ] CreateFolderModal.tsx - 创建文件夹表单
- [ ] LibraryManager.tsx - 资源库表单 (2个)
- [ ] AuditLogPage.tsx - 审计日志表单
- [ ] FontLibrary.tsx - 字体库表单

---

**报告人**: Trea
