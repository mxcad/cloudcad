# 邮件服务开关设计方案

> 创建日期：2026-03-14
> 状态：已完成

## 1. 概述

实现邮件服务的可配置开关，支持：
- 默认禁用邮件服务，无需配置 SMTP 即可部署
- 通过环境变量启用邮件服务
- 强制邮箱验证的可选控制

## 2. 运行时配置项

> 配置存储于运行时配置中心，支持动态修改，立即生效。详见 [运行时配置中心设计方案](./runtime-config-center-design.md)。

| 配置键 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `mailEnabled` | boolean | false | 邮件服务开关 |
| `requireEmailVerification` | boolean | false | 强制邮箱验证（仅当 mailEnabled=true 时有效） |
| `supportEmail` | string | '' | 客服邮箱（邮件禁用时显示） |
| `supportPhone` | string | '' | 客服电话（邮件禁用时显示） |

**注意**：SMTP 配置仍使用环境变量（部署配置），因为涉及敏感信息：
```env
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASS=your-app-password
MAIL_FROM=CloudCAD <your-email@gmail.com>
```

## 3. 核心设计

### 3.1 邮箱绑定状态

**无需新增数据库字段**，直接使用 `email` 字段判断：

| email 字段值 | 含义 |
|--------------|------|
| null / 空 | 未绑定邮箱 |
| 有值 | 已绑定邮箱（已验证） |

### 3.2 注册流程

**注册表单**：用户名 + 密码 + 确认密码（无邮箱字段）

| mailEnabled | requireEmailVerification | 注册后状态 |
|-------------|-------------------------|------------|
| false | 不适用 | email=null, ACTIVE |
| true | false | email=null, ACTIVE |
| true | true | email=null, ACTIVE |

用户后续可在个人设置中绑定邮箱。

### 3.3 登录流程

```
用户登录请求
     │
     ▼
验证用户名/密码
     │
     ▼
检查 requireEmailVerification 配置
     │
     ├─ false ──> 正常登录，返回 token
     │
     └─ true ──> 检查 user.email
                     │
                     ├─ 有值 ──> 正常登录，返回 token
                     │
                     └─ null ──> 拒绝登录，「请先绑定邮箱」
```

### 3.4 忘记密码流程

| mailEnabled | 行为 |
|-------------|------|
| true | 发送验证码 → 验证后重置密码 |
| false | 显示提示：「请联系客服重置密码」+ supportEmail + supportPhone |

### 3.5 绑定邮箱流程

**入口**：个人设置页面

**流程**：
1. 用户输入邮箱
2. 发送验证码（需 mailEnabled=true）
3. 用户输入验证码
4. 验证通过，设置 user.email 字段
5. 绑定成功

**注意**：绑定邮箱后需重新登录，以更新 token 中的 email 信息。

## 4. JWT Token

**Payload 结构**：

```typescript
{
  sub: string;           // userId
  username: string;
  email: string | null;  // null 表示未绑定
  // ... 其他字段
}
```

## 5. 后端实现

### 5.1 配置读取

通过 `RuntimeConfigService` 获取运行时配置：

```typescript
// 在需要的地方注入 RuntimeConfigService
constructor(
  private runtimeConfig: RuntimeConfigService,
) {}

// 获取配置
const mailEnabled = await this.runtimeConfig.get<boolean>('mailEnabled');
const requireVerification = await this.runtimeConfig.get<boolean>('requireEmailVerification');
const supportEmail = await this.runtimeConfig.get<string>('supportEmail');
const supportPhone = await this.runtimeConfig.get<string>('supportPhone');
```

### 5.2 EmailVerificationGuard

```typescript
@Injectable()
export class EmailVerificationGuard implements CanActivate {
  constructor(private runtimeConfig: RuntimeConfigService) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requireEmailVerification = await this.runtimeConfig.get<boolean>('requireEmailVerification');
    
    // 未开启强制验证，直接通过
    if (!requireEmailVerification) {
      return true;
    }
    
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    
    // 强制验证 + 邮箱为空 = 拒绝访问
    if (!user.email) {
      throw new UnauthorizedException('请先绑定邮箱');
    }
    
    return true;
  }
}
```

### 5.3 AuthService 变更

| 方法 | mailEnabled=false | mailEnabled=true |
|------|-------------------|------------------|
| `register()` | 直接创建用户，返回 token | 直接创建用户，返回 token |
| `login()` | 正常登录 | 检查 requireEmailVerification |
| `forgotPassword()` | 返回客服联系信息 | 发送验证码 |
| `bindEmail()` | 返回错误「邮件服务未启用」 | 发送验证码，验证后绑定 |

### 5.4 API 说明

前端所需的配置信息通过运行时配置中心的公开接口获取：

**GET /api/system/config**

详见 [运行时配置中心设计方案](./runtime-config-center-design.md) 第 6 节。

## 6. 前端实现



### 6.1 注册页面



- 移除邮箱输入框

- 只保留：用户名 + 密码 + 确认密码



### 6.2 个人设置页面



- 显示邮箱绑定状态：「已绑定：xxx@example.com」/「未绑定」

- 未绑定时显示「绑定邮箱」按钮（mailEnabled=true 时）

- mailEnabled=false 时显示提示：「邮件服务未启用，请联系管理员」



### 6.3 忘记密码页面



| mailEnabled | 显示内容 |

|-------------|----------|

| true | 邮箱输入框 + 发送验证码 |

| false | 提示：「请联系客服重置密码」 + supportEmail + supportPhone |



### 6.4 登录后处理



当 `requireEmailVerification=true` 且用户 email 为空时：

- 登录成功后跳转到绑定邮箱页面

- 或在页面顶部显示提示条：「请先绑定邮箱以继续使用」

## 7. 部署场景

| 环境 | mailEnabled | requireEmailVerification | 说明 |
|------|-------------|-------------------------|------|
| 内部测试 | false | - | 无需配置 SMTP，快速部署 |
| 开放注册（非强制） | true | false | 用户可选择是否绑定邮箱 |
| 生产环境（强制） | true | true | 必须绑定邮箱才能使用 |

可通过后台「运行时配置」页面动态调整，无需重启服务。

## 8. 变更文件清单

> **前置依赖**：需先实现 [运行时配置中心](./runtime-config-center-design.md)

### 后端

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/auth/auth.service.ts` | 修改 | 注册、登录、忘记密码逻辑调整，使用 RuntimeConfigService |
| `src/auth/auth.controller.ts` | 修改 | 调整 forgotPassword 响应 |
| `src/auth/auth.module.ts` | 修改 | 注入 RuntimeConfigModule |
| `src/auth/guards/email-verification.guard.ts` | 新增 | 邮箱验证 Guard |
| `src/auth/dto/auth.dto.ts` | 修改 | 注册 DTO 移除邮箱必填 |

### 前端

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `src/pages/Register.tsx` | 修改 | 移除邮箱输入框 |
| `src/pages/Login.tsx` | 修改 | 登录后强制验证邮箱的处理 |
| `src/pages/ForgotPassword.tsx` | 修改 | 根据配置显示不同内容 |
| `src/pages/Settings.tsx` | 修改 | 新增绑定邮箱功能 |

## 9. 相关文档

- [运行时配置中心设计方案](./runtime-config-center-design.md) - 本方案的前置依赖
