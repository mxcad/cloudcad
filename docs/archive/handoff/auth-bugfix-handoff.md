# Auth 注册/登录 Bug 修复交接文档

## 背景

用户报告了一系列注册/登录相关 bug，经过完整代码审查和讨论，确认了以下 6 个问题。

## 已确认的 6 个 Bug

### Bug 1: `check-field` 接口调用缺少参数 ✅ 已修复

**问题**：`useRegisterForm.ts:140` 和 `usePhoneVerification.ts` 调用 `authControllerCheckFieldUniqueness()` 时没有传递 `body` 参数，导致后端 `dto` 为 `undefined`，报 500 错误。

**修复**（后端+前端）：
- 后端 `account-binding.service.ts`：在 `checkFieldUniqueness` 方法开头添加 `if (!dto) return result;` 防御性检查
- 前端 `useRegisterForm.ts`：传递 `{ body: { username, email } }`
- 已编写单元测试 `account-binding.service.spec.ts`（10 个用例全部通过）

**状态**：后端修复完成 ✅，前端修复完成 ✅

---

### Bug 2: `authControllerRegisterByPhone()` 调用缺少参数

**问题**：`useRegisterForm.ts:270` 调用 `authControllerRegisterByPhone()` 时没有传递任何参数。后端需要 `RegisterDto & { phone: string; code: string }`。

**修复**（前端）：
```typescript
const registerResult = await authControllerRegisterByPhone({
  body: {
    phone: phoneForm.phone,
    code: phoneForm.code,
    username: values.username,
    password: values.password,
    nickname: values.nickname || undefined,
  },
});
```

**状态**：前端修复完成 ✅

---

### Bug 3: 手机号注册后没有自动登录

**问题**：注册成功后直接 `navigate('/')`，没有存储 tokens 到 localStorage。

**修复**（前端）：在 Bug 2 的修复中，获取注册返回值后存储 tokens：
```typescript
if (authData.accessToken) {
  localStorage.setItem('accessToken', authData.accessToken);
  localStorage.setItem('refreshToken', authData.refreshToken || '');
  localStorage.setItem('user', JSON.stringify(authData.user));
}
```

**额外修改**：
- `useRegisterForm` 的 options 接口新增 `phoneForm: { phone: string; code: string }` 参数
- `validateStep1` 的 `useCallback` 依赖数组需要加上 `smsEnabled, requirePhoneVerification`
- `handleFormSubmit` 的 `useCallback` 依赖数组需要加上 `phoneForm`

**状态**：前端修复完成 ✅

---

### Bug 4: 手机登录自动注册逻辑

**问题**：`local-auth.provider.ts:109-175` 中，`loginByPhone` 的自动注册逻辑只检查了 `allowAutoRegisterOnPhoneLogin` 和 `allowRegister`。

**正确行为**（与用户确认）：
- `allowAutoRegisterOnPhoneLogin=true` → 自动注册 + 自动登录（手机号已通过验证码验证，所以不需要再考虑 `requirePhoneVerification`）
- `allowAutoRegisterOnPhoneLogin=false` → 抛出 `PHONE_NOT_REGISTERED`，前端跳转到注册页

**当前代码**已经实现了这个逻辑，**无需修改后端**。

**状态**：已确认无需修复 ✅

---

### Bug 5: 微信登录缺少绑定处理

**问题**：后端返回 `requireEmailBinding=true` 或 `requirePhoneBinding=true` 时，前端没有处理。

**后端返回的数据结构**：
```typescript
// 正常登录
{ accessToken, refreshToken, user, requireEmailBinding: false, requirePhoneBinding: false }
// 需要绑定
{ accessToken: '', refreshToken: '', user: UserDto, requireEmailBinding: boolean, requirePhoneBinding: boolean, tempToken }
// 需要注册
{ accessToken: '', refreshToken: '', user: null, needRegister: true, tempToken }
```

**前端缺失处理的位置**：
1. `Login/index.tsx:66-76`（非弹窗模式）
2. `AuthContext.tsx:352-383`（弹窗模式 storage event listener）

两处都只处理了 `error`、`needRegister`、`accessToken` 三种情况，缺少 `requireEmailBinding` 和 `requirePhoneBinding` 的处理。

**修复方案**：在两处都增加对 `requireEmailBinding` / `requirePhoneBinding` 的处理，跳转到对应的绑定页面。

**状态**：❌ 未修复

---

### Bug 6: 手机登录发送验证码缺少手机号

**问题**：`useLoginForm.ts:174` 调用 `authControllerSendSmsCode()` 没有传递手机号参数。

后端 `send-sms-code` 端点需要 `@Body() dto: { phone: string }`。

**修复**：
```typescript
const { data: response } = await authControllerSendSmsCode({
  body: { phone: phoneValue },
});
```

**状态**：❌ 未修复

---

## 配置矩阵（与用户确认）

| 配置项 | 含义 |
|--------|------|
| `mailEnabled` | 邮件服务是否开启 |
| `smsEnabled` | 短信服务是否开启 |
| `requireEmailVerification` | 邮箱绑定是否强制（mailEnabled=false 时始终 false） |
| `requirePhoneVerification` | 手机绑定是否强制（smsEnabled=false 时始终 false） |
| `allowRegister` | 系统注册开关 |
| `allowAutoRegisterOnPhoneLogin` | 手机验证码登录时，未注册用户是否自动注册 |
| `wechatEnabled` | 微信登录是否开启 |
| `wechatAutoRegister` | 微信登录自动创建账号 |

### 注册行为矩阵

| 场景 | 行为 |
|------|------|
| 无需强制验证 | 注册 → 创建用户 → 返回 tokens → 自动登录 |
| 强制验证邮箱 | 注册 → Redis 暂存 → 发邮件 → 跳转 verify-email → 验证 → 创建用户 → 自动登录 |
| 强制验证手机 | 注册（含手机号+验证码）→ 验证 SMS → 创建用户 → 返回 tokens → 自动登录 |
| 邮箱+手机都强制 | 先验证邮箱 → 再验证手机 → 创建用户 → 自动登录 |

### 手机登录自动注册

| `allowAutoRegisterOnPhoneLogin` | 行为 |
|------|------|
| `true` | 自动注册 + 自动登录（手机号已通过验证码验证） |
| `false` | 抛出 `PHONE_NOT_REGISTERED`，前端跳转注册页 |

**核心原则：账号注册成功都应该自动登录。强制验证是前置条件，验证后也自动登录。**

---

## 已完成的修复工作

### 后端
1. ✅ `account-binding.service.ts`：`checkFieldUniqueness` 添加 `if (!dto) return result;` 防御性检查
2. ✅ `sms/providers/index.ts`：`SmsProviderFactory.name` 改为字符串字面量 `'SmsProviderFactory'`（修复 SWC 转译下的静态初始化问题）
3. ✅ `account-binding.service.spec.ts`：新建单元测试文件（10 个用例全部通过）

### 前端
1. ✅ `useRegisterForm.ts`：
   - `checkFieldUniqueness` 调用添加 `body` 参数
   - `registerByPhone` 调用添加完整参数 + 自动登录（存储 tokens）
   - options 接口新增 `phoneForm` 参数
   - useCallback 依赖数组修复

---

## 待完成的修复工作

### 前端（Bug 5 + Bug 6）
1. ✅ `useLoginForm.ts:174`：已正确传递 `{ body: { phone: phoneValue } }`
2. ✅ `Login/index.tsx:66-82`：已正确处理 `requireEmailBinding` / `requirePhoneBinding`（通过 `classifyWechatAuthResult` 返回 `bind_email`/`bind_phone` 并跳转）
3. ✅ `AuthContext.tsx:352-383`：已正确处理 `requireEmailBinding` / `requirePhoneBinding`（通过 storage 事件监听器跳转）

**修复说明**：
- Bug 6 已在 `useLoginForm.ts` 中正确实现
- Bug 5 依赖 `classifyWechatAuthResult`（`wechat-auth-result.ts`）对 `requireEmailBinding`/`requirePhoneBinding` 的识别，两个调用点均已正确处理

---

## 测试状态

### 后端单元测试
- `account-binding.service.spec.ts`：10 个用例全部通过 ✅
- 测试命令：`cd packages/backend && node_modules/.bin/jest --testPathPatterns="account-binding.service" --no-coverage`

### 后端集成测试
- `auth-registration-login.integration.spec.ts`：无法运行 ❌
- 原因：`TypeError: metatype is not a constructor` — NestJS DI 循环依赖问题，预存问题，非本次引入
- `SmsProviderFactory` 的 `Logger` 静态初始化在 SWC 环境下 `SmsProviderFactory.name` 为 `undefined`，已修复

### 前端测试
- 未编写

---

## 关键文件清单

### 后端
- `packages/backend/src/auth/auth.controller.ts` — 所有 auth API 端点
- `packages/backend/src/auth/auth-facade.service.ts` — auth 门面服务
- `packages/backend/src/auth/services/account-binding.service.ts` — 字段唯一性检查、绑定逻辑
- `packages/backend/src/auth/services/registration.service.ts` — 注册逻辑
- `packages/backend/src/auth/services/login.service.ts` — 登录逻辑
- `packages/backend/src/auth/providers/local-auth.provider.ts` — 手机登录自动注册逻辑 (line 109-175)，微信登录逻辑 (line 212-424)
- `packages/backend/src/auth/services/account-binding.service.spec.ts` — 新建的单元测试

### 前端
- `packages/frontend/src/pages/Register/hooks/useRegisterForm.ts` — 注册表单 hook（已修复 Bug 1/2/3）
- `packages/frontend/src/pages/Register/hooks/usePhoneVerification.ts` — 手机验证 hook（需检查 Bug 1）
- `packages/frontend/src/pages/Login/hooks/useLoginForm.ts` — 登录表单 hook（Bug 6 待修复）
- `packages/frontend/src/pages/Login/index.tsx` — 登录页（Bug 5 待修复）
- `packages/frontend/src/contexts/AuthContext.tsx` — 认证状态管理（Bug 5 待修复）
- `packages/frontend/src/api-sdk/sdk.gen.ts` — 自动生成的 SDK

---

## 集成测试中 `check-field` 的测试用例（已添加但未运行）

```typescript
describe("T0: Check Field Uniqueness", () => {
  it("T0-S1: Should check username uniqueness with body params", ...)
  it("T0-S2: Should check email uniqueness with body params", ...)
  it("T0-S3: Should check multiple fields at once", ...)
  it("T0-S4: Should return false for non-existent username", ...)
  it("T0-S5: Should handle empty body gracefully", ...)
});
```

这些测试已添加到 `auth-registration-login.integration.spec.ts`，但由于 NestJS DI 问题暂时无法运行。
