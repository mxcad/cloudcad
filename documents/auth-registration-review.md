# 注册登录功能全面审查报告

**审查日期：** 2026-04-22
**审查范围：** CloudCAD 注册登录完整功能及运行时配置

---

## 一、概述

本次审查覆盖了注册登录功能的完整路径，包括：
- 后端：`packages/backend/src/auth/` 模块
- 前端：`packages/frontend/src/` 中的注册/登录页面和上下文
- 运行时配置：`packages/backend/src/runtime-config/`

---

## 二、运行时配置清单

### 2.1 与注册相关的配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `allowRegister` | boolean | `true` | 总开关：是否允许注册 |
| `allowAutoRegisterOnPhoneLogin` | boolean | **`false`** | 手机验证码登录时自动注册 |
| `mailEnabled` | boolean | `false` | 邮件服务开关 |
| `requireEmailVerification` | boolean | `false` | 是否强制邮箱验证 |
| `smsEnabled` | boolean | `false` | 短信服务开关 |
| `requirePhoneVerification` | boolean | `false` | 是否强制手机号验证 |
| `wechatEnabled` | boolean | `false` | 微信登录开关 |
| `wechatAutoRegister` | boolean | `false` | 微信登录自动创建账号 |

---

## 三、注册路径梳理

### 3.1 普通邮箱注册

**路径：** `/register` → POST `/auth/register`

**逻辑分支图：**
```
allowRegister = false?
    ├── YES → 抛出异常 "系统已关闭注册功能"
    └── NO
        ↓
    邮箱已存在?
        ├── YES → 抛出异常 "邮箱已被注册"
        └── NO
            ↓
        用户名已存在?
            ├── YES → 抛出异常 "用户名已被使用"
            └── NO
                ↓
            wechatTempToken 存在?
                ├── YES → 验证并解析微信数据
                └── NO
                ↓
            mailEnabled = false?
                ├── YES → 直接创建用户（无验证）→ 返回 token
                └── NO
                    ↓
                requireEmailVerification = false?
                    ├── YES → 直接创建用户 → 返回 token
                    └── NO
                        ↓
                        邮箱未提供?
                            ├── YES → 抛出异常 "邮箱验证已启用，注册需要提供邮箱地址"
                            └── NO
                                ↓
                            将注册信息存入 Redis → 发送验证邮件 → 返回 "验证码已发送"
```

**配置分支：**
| mailEnabled | requireEmailVerification | 行为 |
|-------------|-------------------------|------|
| false | * | 直接创建用户，返回 token |
| true | false | 直接创建用户，返回 token |
| true | true | 需邮箱验证，发送验证码 |

---

### 3.2 手机号注册

**路径：** `/register` (手机号 Tab) → POST `/auth/register-phone`

**逻辑分支图：**
```
allowRegister = false?
    ├── YES → 抛出异常 "系统已关闭注册功能"
    └── NO
        ↓
    短信验证码验证
        └── 失败 → 抛出异常
        ↓
    手机号已存在?
        ├── YES → 抛出异常 "手机号已被注册"
        └── NO
            ↓
        用户名已存在?
            ├── YES → 抛出异常 "用户名已被使用"
            └── NO
                ↓
            创建用户（phoneVerified = true）→ 返回 token
```

**⚠️ 发现问题 1：** `registerByPhone` **没有检查 `allowAutoRegisterOnPhoneLogin` 配置！**

---

### 3.3 微信登录注册

**路径：** 微信授权 → GET `/auth/wechat/callback` → 微信用户数据

**逻辑分支图：**
```
微信用户已绑定账号?
    ├── YES → 检查账号状态
    │       ↓
    │   账号状态 = ACTIVE?
    │       ├── YES → 更新昵称头像 → 返回 token
    │       └── NO → 抛出异常 "账号已被禁用"
    │
    └── NO
        ↓
    wechatAutoRegister = true?
        ├── YES → 自动创建用户 → 返回 token
        └── NO → 返回 needRegister=true, tempToken
                ↓
                前端跳转到注册页携带 tempToken
```

**⚠️ 发现问题 2：** 微信登录的 `wechatAutoRegister` **没有检查 `allowRegister` 配置！**

---

### 3.4 手机号验证码登录（自动注册）

**路径：** `/login` (手机号 Tab) → POST `/auth/login-phone`

**逻辑分支图：**
```
短信验证码验证
    ↓
手机号已注册?
    ├── YES → 验证账号状态 → 返回 token
    │
    └── NO
        ↓
    allowAutoRegisterOnPhoneLogin = true AND allowRegister = true?
        ├── YES → 自动创建用户（phoneVerified = true）→ 返回 token
        └── NO → 抛出异常 "手机号未注册，请先注册"
                (状态码 412)
```

**⚠️ 发现问题 3：** `allowAutoRegisterOnPhoneLogin` 的**默认值不一致**！
- 定义文件 `runtime-config.constants.ts`: `defaultValue: false`
- 使用处 `auth-facade.service.ts` 第 135-137 行: `true`

---

## 四、登录路径梳理

### 4.1 账号密码登录

**路径：** `/login` → POST `/auth/login`

**逻辑分支图：**
```
验证账号密码
    ↓
账号状态 = ACTIVE?
    ├── NO → 抛出异常 "账号已被禁用"
    └── YES
        ↓
密码验证
    ↓
mailEnabled = true AND requireEmailVerification = true AND 邮箱未验证?
    ├── 邮箱为空?
    │   ├── YES → 生成临时 token → 抛出异常 code="EMAIL_REQUIRED"
    │   └── NO → 抛出异常 code="EMAIL_NOT_VERIFIED"
    └── NO
        ↓
smsEnabled = true AND requirePhoneVerification = true AND 手机号未验证?
    ├── 手机号为空?
    │   ├── YES → 生成临时 token → 抛出异常 code="PHONE_REQUIRED"
    │   └── NO → 抛出异常 code="PHONE_NOT_VERIFIED"
    └── NO
        ↓
返回 token
```

---

### 4.2 手机号验证码登录

**路径：** `/login` (手机号 Tab) → POST `/auth/login-phone`

**（同上 3.4 自动注册逻辑）**

---

## 五、配置冲突分析

### 5.1 严重冲突

#### 冲突 1：allowAutoRegisterOnPhoneLogin 默认值不一致

| 位置 | 默认值 |
|------|--------|
| `runtime-config.constants.ts` | `false` |
| `auth-facade.service.ts:135` | `true` |

**影响：** 代码中使用默认值 `true`，但配置定义默认 `false`，导致行为不符合配置定义意图。

**文件位置：**
- 定义：[runtime-config.constants.ts#L91-97](file:///d:/web/MxCADOnline/cloudcad/packages/backend/src/runtime-config/runtime-config.constants.ts#L91-L97)
- 使用：[auth-facade.service.ts#L135-137](file:///d:/web/MxCADOnline/cloudcad/packages/backend/src/auth/auth-facade.service.ts#L135-L137)

---

#### 冲突 2：微信登录不检查 allowRegister 总开关

**代码片段（auth-facade.service.ts）：**
```typescript
const wechatAutoRegister = await this.runtimeConfigService.getValue<boolean>(
  'wechatAutoRegister',
  false
);
// ... 后续直接使用，没有检查 allowRegister
```

**问题：** 即使 `allowRegister=false`，微信登录仍可能自动注册用户。

---

#### 冲突 3：手机号注册不检查 allowAutoRegisterOnPhoneLogin

**代码片段（auth-facade.service.ts registerByPhone）：**
```typescript
async registerByPhone(registerDto, req) {
  const allowRegister = await this.runtimeConfigService.getValue<boolean>(
    'allowRegister',
    true
  );
  if (!allowRegister) {
    throw new BadRequestException('系统已关闭注册功能');
  }
  // 缺少 allowAutoRegisterOnPhoneLogin 检查
}
```

**问题：** `registerByPhone` 应该也检查 `allowAutoRegisterOnPhoneLogin`，因为它是专门用于"手机号注册"场景的接口。

---

### 5.2 中等问题

#### 问题 4：前端显示逻辑与后端验证逻辑的潜在不一致

**前端 Register.tsx：**
```typescript
// 第 58-63 行
const mailEnabled = runtimeConfig.mailEnabled;
const requireEmailVerification = runtimeConfig.requireEmailVerification ?? false;
const smsEnabled = runtimeConfig.smsEnabled ?? false;
const requirePhoneVerification = runtimeConfig.requirePhoneVerification ?? false;

// 第 375-393 行 - 验证逻辑
if (mailEnabled) {
  if (requireEmailVerification && !formData.email) {
    errors.email = '请输入邮箱';
  }
}
```

**后端 registration.service.ts：**
```typescript
// 第 96-98 行
const mailEnabled = await this.runtimeConfigService.getValue<boolean>(
  'mailEnabled',
  false
);

// 第 131-139 行
const requireEmailVerification = await this.runtimeConfigService.getValue<boolean>(
  'requireEmailVerification',
  false
);

if (requireEmailVerification && !email) {
  throw new BadRequestException('邮箱验证已启用，注册需要提供邮箱地址');
}
```

**潜在问题：** 如果 `mailEnabled=false` 但 `requireEmailVerification=true`（配置错误情况），前端不会显示邮箱输入框（因为 `mailEnabled=false`），但后端会抛出异常。

---

## 六、配置与逻辑正确性检查表

### 6.1 注册总开关检查

| 配置 | 前端检查 | 后端检查 | 文件位置 |
|------|----------|----------|----------|
| `allowRegister` | ✅ Register.tsx L124 | ✅ registration.service.ts L45-51 | 正确 |
| `allowRegister` | - | ✅ auth-facade.service.ts L243-249 (registerByPhone) | 正确 |

---

### 6.2 邮箱注册分支

| 配置组合 | 预期行为 | 代码实现 | 状态 |
|----------|----------|----------|------|
| mailEnabled=false | 直接创建用户 | registration.service.ts L101-129 | ✅ |
| mailEnabled=true, requireEmailVerification=false | 直接创建用户 | registration.service.ts L141-169 | ✅ |
| mailEnabled=true, requireEmailVerification=true | 发送验证邮件 | registration.service.ts L171-199 | ✅ |
| requireEmailVerification=true, email=null | 抛出异常 | registration.service.ts L137-139 | ✅ |

---

### 6.3 手机号注册分支

| 配置 | 预期行为 | 代码实现 | 状态 |
|------|----------|----------|------|
| allowRegister=false | 抛出异常 | registerByPhone L243-249 | ✅ |
| 验证码错误 | 抛出异常 | registerByPhone L251-257 | ✅ |
| allowAutoRegisterOnPhoneLogin | 应检查但**未检查** | registerByPhone | ❌ |

---

### 6.4 微信登录分支

| 配置 | 预期行为 | 代码实现 | 状态 |
|------|----------|----------|------|
| wechatAutoRegister=false | 返回 needRegister | loginWithWechat L418-442 | ✅ |
| wechatAutoRegister=true | 自动创建用户 | loginWithWechat L362-417 | ✅ |
| allowRegister 总开关 | 应检查但**未检查** | loginWithWechat | ❌ |

---

### 6.5 手机号登录分支

| 配置 | 预期行为 | 代码实现 | 状态 |
|------|----------|----------|------|
| allowAutoRegisterOnPhoneLogin=false, allowRegister=true | 抛出 412 | loginByPhone L195-204 | ✅ |
| allowAutoRegisterOnPhoneLogin=true, allowRegister=true | 自动注册 | loginByPhone L146-168 | ✅ |
| allowRegister=false | 不应自动注册 | loginByPhone L140-145 | ✅ |

---

## 七、问题汇总

### 7.1 严重问题（必须修复）

| # | 问题描述 | 严重程度 | 位置 |
|---|----------|----------|------|
| 1 | `allowAutoRegisterOnPhoneLogin` 默认值不一致：定义为 `false`，使用处默认为 `true` | 高 | `runtime-config.constants.ts` vs `auth-facade.service.ts:135` |
| 2 | 微信登录不检查 `allowRegister` 总开关，可能绕过注册限制 | 高 | `auth-facade.service.ts:348-360` |
| 3 | `registerByPhone` 不检查 `allowAutoRegisterOnPhoneLogin`，与 `loginByPhone` 行为不一致 | 高 | `auth-facade.service.ts:237-300` |

### 7.2 中等问题（建议修复）

| # | 问题描述 | 严重程度 | 位置 |
|---|----------|----------|------|
| 4 | `mailEnabled=false` 时 `requireEmailVerification` 的验证逻辑无法被前端绕过，但配置错误组合可能导致奇怪行为 | 中 | `registration.service.ts` |

---

## 八、修复建议

### 8.1 修复 allowAutoRegisterOnPhoneLogin 默认值

**文件：** `packages/backend/src/auth/auth-facade.service.ts`

```typescript
// 第 135-137 行
const allowAutoRegister = await this.runtimeConfigService.getValue<boolean>(
  'allowAutoRegisterOnPhoneLogin',
  false  // 修改为 false，与配置定义一致
);
```

---

### 8.2 微信登录添加 allowRegister 检查

**文件：** `packages/backend/src/auth/auth-facade.service.ts`

在 `loginWithWechat` 方法中，微信自动注册前添加检查：

```typescript
// 在 wechatAutoRegister = true 的逻辑块内，添加：
const allowRegister = await this.runtimeConfigService.getValue<boolean>(
  'allowRegister',
  true
);

if (!allowRegister) {
  // 返回 needRegister，让用户走普通注册流程
  const tempToken = this.jwtService.sign(
    {
      sub: 'pending',
      type: 'wechat_temp',
      wechatId: wechatUser.openid,
      nickname: wechatUser.nickname,
      avatar: wechatUser.headimgurl,
    },
    {
      secret: this.configService.get<string>('JWT_SECRET'),
      expiresIn: '30m',
    }
  );

  return {
    accessToken: '',
    refreshToken: '',
    user: null as any,
    requireEmailBinding: false,
    requirePhoneBinding: false,
    needRegister: true,
    tempToken,
  };
}
```

---

### 8.3 registerByPhone 添加 allowAutoRegisterOnPhoneLogin 检查

**文件：** `packages/backend/src/auth/auth-facade.service.ts`

```typescript
async registerByPhone(registerDto, req) {
  const allowRegister = await this.runtimeConfigService.getValue<boolean>(
    'allowRegister',
    true
  );
  if (!allowRegister) {
    throw new BadRequestException('系统已关闭注册功能');
  }

  // 新增：检查 allowAutoRegisterOnPhoneLogin
  const allowAutoRegister = await this.runtimeConfigService.getValue<boolean>(
    'allowAutoRegisterOnPhoneLogin',
    false
  );
  if (!allowAutoRegister) {
    throw new BadRequestException('手机号注册未启用，请使用邮箱注册');
  }

  // ... 后续逻辑
}
```

---

## 九、结论

本次审查发现了 **3 个严重问题** 和 **1 个中等问题**：

1. **配置默认值不一致** - `allowAutoRegisterOnPhoneLogin` 在定义处是 `false`，但在代码使用处默认 `true`
2. **微信登录绕过注册限制** - `wechatAutoRegister` 不检查 `allowRegister` 总开关
3. **手机号注册接口缺少权限控制** - `registerByPhone` 应该检查 `allowAutoRegisterOnPhoneLogin`

建议优先修复以上问题，以确保配置系统的一致性和安全性。

---

**报告生成：** 2026-04-22
**审查工具：** Claude Code
