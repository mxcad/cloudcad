# 注册流程 Bug 审查报告

**审查日期**: 2026-04-22
**审查范围**: 微信登录 → 注册界面 → 填写信息 → 设置密码流程
**问题描述**: 邮箱已填写但报错 "邮箱验证已启用，邮箱为必填项"

---

## 问题定位

### 错误抛出位置

**后端**: `packages/backend/src/users/users.service.ts:65-66`

```typescript
if (requireEmailVerification && !createUserDto.email) {
  throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
}
```

同时也可能从 `packages/backend/src/auth/services/registration.service.ts:137-138` 抛出：

```typescript
if (requireEmailVerification && !email) {
  throw new BadRequestException('邮箱验证已启用，注册需要提供邮箱地址');
}
```

---

## 根本原因分析

### 配置逻辑不一致

**前端代码** (`packages/frontend/src/pages/Register.tsx:501-503`):

```typescript
const registerData = mailEnabled
  ? { ...formData, wechatTempToken }
  : { ...formData, email: undefined, wechatTempToken };
```

前端只根据 `mailEnabled` 来决定是否发送邮箱字段：

- `mailEnabled = true` → 发送邮箱
- `mailEnabled = false` → **不发送邮箱**（显式设为 `undefined`）

### 后端逻辑

后端有两个独立的检查：

1. **registration.service.ts** - 检查 `mailEnabled` 决定是否需要邮箱验证
2. **users.service.ts** - 检查 `requireEmailVerification` 决定邮箱是否必填

这两个配置是**独立的**，但前端只考虑了 `mailEnabled`。

### 触发条件

当系统配置为以下情况时会触发此 Bug：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| `mailEnabled` | `false` | 邮件服务未启用 |
| `requireEmailVerification` | `true` | 强制要求邮箱验证 |

此时：

1. **前端**: 因为 `mailEnabled=false`，不发送邮箱字段
2. **后端**: `registration.service.ts` 中 `!mailEnabled` 路径（第101-120行），直接调用 `usersService.create()`
3. **usersService.create()**: 检查 `requireEmailVerification=true` 且邮箱为空 → 抛出错误

---

## 数据流程图

```
微信扫码登录
    ↓
Login.tsx 检测需要注册 → navigate('/register?wechat=1')
    ↓
Register.tsx 解析 wechatTempToken
    ↓
用户填写: username, password, email, nickname
    ↓
点击"下一步" → 点击"立即注册"
    ↓
handleSubmit():
  if (mailEnabled) {
    发送 formData + wechatTempToken (包含 email)
  } else {
    发送 { ...formData, email: undefined, wechatTempToken }  ← BUG 所在
  }
    ↓
后端 registration.service.ts:
  if (!mailEnabled) {
    usersService.create({ email: email || undefined, ... })
  }
    ↓
后端 users.service.ts:
  if (requireEmailVerification && !email) {
    throw '邮箱验证已启用，邮箱为必填项'  ← 报错!
  }
```

---

## 问题总结

| 项目 | 说明 |
|------|------|
| **问题类型** | 前后端配置逻辑不一致 |
| **影响范围** | 微信登录注册流程（当 mailEnabled=false 且 requireEmailVerification=true） |
| **根因位置** | `packages/frontend/src/pages/Register.tsx:501-503` |
| **严重程度** | 高 - 导致用户无法完成注册 |

---

## 补充分析：短信注册场景

根据用户反馈，开启短信服务时使用手机号注册也会触发此错误。

### 问题定位

**后端** `packages/backend/src/auth/auth-facade.service.ts:283-289`:

```typescript
const user = await this.usersService.create({
  username,
  password,
  nickname: nickname || username,
  phone: formattedPhone,
  phoneVerified: true,
  // 注意：这里没有传递 email 参数！
});
```

**后端** `packages/backend/src/users/users.service.ts:65-66`:

```typescript
if (requireEmailVerification && !createUserDto.email) {
  throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
}
```

### 触发条件

当系统配置为：
| 配置项 | 值 |
|--------|-----|
| `smsEnabled` | `true` |
| `allowAutoRegisterOnPhoneLogin` | `true` |
| `requireEmailVerification` | `true` |

用户使用手机号注册 → 调用 `registerByPhone` → 不传 email → 触发错误

---

## 建议修复方案

### 方案一：修改手机号注册逻辑（推荐）

**文件**: `packages/backend/src/auth/auth-facade.service.ts`

在 `registerByPhone` 方法中，第 283 行之前添加判断：

```typescript
// 检查是否需要邮箱验证
const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>(
  'requireEmailVerification',
  false
);

// 如果开启了手机号验证，且需要邮箱验证，检查是否提供了邮箱（从 DTO 中获取）
// 或者：仅当未开启手机号验证时才要求邮箱必填
```

**更好的方案**：修改 `usersService.create()` 的逻辑——当 `phoneVerified=true` 时，即使 `requireEmailVerification=true` 也应该允许注册（因为手机号已经验证通过）。

**修改 users.service.ts**:
```typescript
// 只有当需要验证邮箱，且没有通过手机号验证时，才要求邮箱必填
if (requireEmailVerification && !createUserDto.email && !createUserDto.phoneVerified) {
  throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
}
```

但问题是 `createUserDto` 中没有 `phoneVerified` 字段。需要在 DTO 中添加或者在 service 中单独处理。

### 方案二：修改前端逻辑

**文件**: `packages/frontend/src/pages/Register.tsx`

当使用手机号注册时，也需要传递邮箱（如果 requireEmailVerification=true）：

```typescript
if (phoneForm.phone && phoneForm.code && smsEnabled) {
  // 如果邮箱必填但没填，提示用户
  if (requireEmailVerification && !formData.email) {
    setError('邮箱验证已启用，请填写邮箱');
    return;
  }
  await authApi.registerByPhone({
    username: formData.username,
    password: formData.password,
    nickname: formData.nickname,
    email: requireEmailVerification ? formData.email : undefined,  // 添加邮箱
    phone: phoneForm.phone,
    code: phoneForm.code,
  });
}
```

---

## 建议修复方案（汇总）

### 优先修复：修改 users.service.ts

**文件**: `packages/backend/src/users/users.service.ts`

当前逻辑（第 64-67 行）：
```typescript
if (requireEmailVerification && !createUserDto.email) {
  throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
}
```

修改为：当手机号已验证时，不强制要求邮箱
```typescript
const hasVerifiedPhone = createUserDto.phone && createUserDto.phoneVerified;
if (requireEmailVerification && !createUserDto.email && !hasVerifiedPhone) {
  throw new BadRequestException('邮箱验证已启用，邮箱为必填项');
}
```

**理由**：当用户通过手机号验证码注册成功时，`phoneVerified=true`，说明用户身份已通过验证，此时不应该强制要求邮箱必填。

---

## 审查总结

| 问题 | 说明 |
|------|------|
| **根因** | 前端 UI 只根据 `mailEnabled`/`smsEnabled` 决定是否显示输入框，没有考虑 `requireEmailVerification`/`requirePhoneVerification` 独立为 true 的情况 |
| **结果** | 邮箱/手机号是必填项但输入框不显示 → 用户无法填写 → 提交后报错 |

---

## 推荐修复方案：修改前端 UI 逻辑

**核心原则**：只有必填项才显示对应输入框

### 1. 修改邮箱输入框显示条件

**文件**: `packages/frontend/src/pages/Register.tsx`
**位置**: 第 690 行

```jsx
// 修改前
{mailEnabled && (

// 修改后
{(mailEnabled || requireEmailVerification) && (
```

### 2. 修改手机号输入框显示条件

**文件**: `packages/frontend/src/pages/Register.tsx`
**位置**: 第 727 行

```jsx
// 修改前
{smsEnabled && (

// 修改后
{(smsEnabled || requirePhoneVerification) && (
```

### 3. 修改提交逻辑（配合 UI 修改）

**文件**: `packages/frontend/src/pages/Register.tsx`
**位置**: 第 501-503 行

```jsx
// 修改前
const registerData = mailEnabled
  ? { ...formData, wechatTempToken }
  : { ...formData, email: undefined, wechatTempToken };

// 修改后 - 改为根据是否需要邮箱来决定是否发送
const needEmail = mailEnabled || requireEmailVerification;
const registerData = needEmail
  ? { ...formData, wechatTempToken }
  : { ...formData, email: undefined, wechatTempToken };
```

### 4. 修改验证时的 relevantFields（可选）

**位置**: 第 457 行

```jsx
// 修改前
if (mailEnabled) relevantFields.push('email');

// 修改后
if (mailEnabled || requireEmailVerification) relevantFields.push('email');
```

---

## 修复效果

| 配置 | 旧行为 | 新行为 |
|------|--------|--------|
| mailEnabled=false, requireEmailVerification=true | 邮箱输入框不显示 → 报错 | 邮箱输入框显示 → 正常注册 |
| smsEnabled=false, requirePhoneVerification=true | 手机号输入框不显示 → 报错 | 手机号输入框显示 → 正常注册 |
| mailEnabled=true, requireEmailVerification=false | 邮箱输入框显示，非必填 | 邮箱输入框显示，非必填（不变） |

**这样从 UI 层面根本解决问题**：只有必填的字段才显示，用户必然会填写。

---

## 其他发现

### 1. 配置同步问题

- 前端 `RuntimeConfigContext.tsx` 有默认配置值
- 后端 `runtime-config.constants.ts` 也有默认配置值
- 但运行时的实际配置取决于数据库中的值

建议检查：
- 运行时数据库中 `requireEmailVerification` 是否被意外设置为 `true`
- 运行时 `mailEnabled` 是否为 `false`

### 2. 前端表单验证

在 `Register.tsx:446` 中：
```typescript
const validationError = validateRegisterForm(dataToValidate, {
  validateEmail: mailEnabled && requireEmailVerification,
});
```

这里的逻辑是正确的（需要两个都为 true 才验证邮箱），但与提交时的逻辑不一致。

---

## 测试建议

1. 配置 `mailEnabled=false`, `requireEmailVerification=true` → 应能正常注册
2. 配置 `mailEnabled=true`, `requireEmailVerification=false` → 应能正常注册
3. 配置 `mailEnabled=true`, `requireEmailVerification=true` → 应跳转邮箱验证
4. 配置 `mailEnabled=false`, `requireEmailVerification=false` → 应能正常注册

---

## 结论

此 Bug 是由于前端注册表单提交时的逻辑只考虑了 `mailEnabled`，而没有同时考虑 `requireEmailVerification` 配置导致的。

**推荐使用方案一修复**（修改前端逻辑），修改量最小，且与现有验证逻辑保持一致。
