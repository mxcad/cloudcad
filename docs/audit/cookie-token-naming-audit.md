# Cookie / Token 命名审计报告

**审计日期：** 2026-05-02
**审计范围：** `packages/` 目录（前端 + 后端）

---

## 1. 发现的 Cookie 名称

| Cookie 名称 | 类型 | 用途 | 配置位置 |
|-------------|------|------|----------|
| `mxcad.sid` | Session Cookie | 存储 Session ID（express-session） | [packages/backend/src/config/configuration.ts#L152](file:///d:/project/cloudcad/packages/backend/src/config/configuration.ts#L152) |
| `auth_token` | JWT Cookie | 存储 JWT Access Token（httpOnly Cookie，供 `<img>` 标签等无法携带 Authorization 头的场景使用） | [packages/backend/src/auth/auth.controller.ts#L843](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L843) |

### 1.1 `mxcad.sid` 详情

- **默认值：** `mxcad.sid`
- **可配置项：** `SESSION_NAME` 环境变量
- **存储方式：** Redis（通过 `connect-redis`，前缀为 `mxcad:sess:`）
- **配置代码：**

```typescript
// packages/backend/src/config/configuration.ts#L144-161
session: {
  secret: process.env.SESSION_SECRET || ...,
  name: process.env.SESSION_NAME || 'mxcad.sid',  // ← Cookie 名称
  cookieSecure: ...,
  cookieSameSite: 'lax',
  cookieDomain: ...,
  maxAge: 86400000, // 24小时
},
```

```typescript
// packages/backend/src/main.ts#L91-94
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'mxcad:sess:',  // ← Redis key 前缀
});
```

- **清除代码：**

```typescript
// packages/backend/src/auth/auth.controller.ts#L158-159
const sessionName = this.configService.get('session.name');
response.clearCookie(sessionName);  // 清除 mxcad.sid
```

### 1.2 `auth_token` 详情

- **用途：** 专为 `<img>` 标签等无法携带 `Authorization` 头的请求设计的 JWT Cookie
- **设置代码：**

```typescript
// packages/backend/src/auth/auth.controller.ts#L839-850
private setAuthCookie(response: ExpressResponse, accessToken: string): void {
  const cookieSecure = this.configService.get<boolean>('session.cookieSecure');
  const maxAge = 60 * 60 * 1000; // 1 小时

  response.cookie('auth_token', accessToken, {  // ← Cookie 名称硬编码
    httpOnly: true,
    secure: cookieSecure ?? false,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}
```

- **读取代码（JWT 策略）：**

```typescript
// packages/backend/src/auth/strategies/jwt.strategy.ts#L40-54
jwtFromRequest: ExtractJwt.fromExtractors([
  ExtractJwt.fromAuthHeaderAsBearerToken(),
  (request) => {
    let token = null;
    if (request?.cookies) {
      token = request.cookies['auth_token'];  // ← 从 Cookie 读取
    }
    if (!token && request?.headers?.cookie) {
      const match = request.headers.cookie.match(/auth_token=([^;]+)/);  // ← 从 header 解析
      if (match) {
        token = decodeURIComponent(match[1]);
      }
    }
    return token;
  },
]),
```

- **清除代码：**

```typescript
// packages/backend/src/auth/auth.controller.ts#L160
response.clearCookie('auth_token', { path: '/' });
```

- **被设置的时机：**
  - 用户注册成功后（`register`）
  - 用户登录成功后（`login`）
  - Token 刷新成功后（`refresh`）
  - 绑定邮箱/手机并登录成功后
  - 手机号验证码登录成功后

---

## 2. 发现的 localStorage Key 名称

| Key 名称 | 用途 | 使用位置（部分） |
|----------|------|-----------------|
| `accessToken` | 存储 JWT Access Token | apiClient.ts, AuthContext.tsx, authCheck.ts, Login.tsx, EmailVerification.tsx, PhoneVerification.tsx, mxcadManager.ts |
| `refreshToken` | 存储 JWT Refresh Token | apiClient.ts, AuthContext.tsx, authCheck.ts, Login.tsx, EmailVerification.tsx, PhoneVerification.tsx |
| `user` | 存储用户信息（JSON） | apiClient.ts, AuthContext.tsx, authCheck.ts, Login.tsx, EmailVerification.tsx, PhoneVerification.tsx, mxcadManager.ts |
| `personalSpaceId` | 缓存私人空间 ID | AuthContext.tsx |
| `mxcad-personal-space-id` | 缓存私人空间 ID | AuthContext.tsx |
| `wechat_auth_result` | 微信登录结果（跨窗口传递） | AuthContext.tsx, Login.tsx |
| `wechatTempToken` | 微信临时 Token（sessionStorage） | AuthContext.tsx |
| `mx-user-dark` | 主题偏好 | CADEditorDirect.tsx, PageSkeleton.tsx |
| `library:viewMode` | 库面板视图模式 | useLibraryPanel.ts, useLibrary.ts |
| `fileSystemStore` | 文件系统状态 | ResourceList.tsx |

### 2.1 主要 Token 存储详情

**前端 API Client（apiClient.ts）：**

```typescript
// packages/frontend/src/services/apiClient.ts#L108-113
instance.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  // ...
});

// packages/frontend/src/services/apiClient.ts#L174-190
// Token 刷新时
const refreshToken = localStorage.getItem('refreshToken');
// ...
localStorage.setItem('accessToken', accessToken);
if (newRefreshToken) localStorage.setItem('refreshToken', newRefreshToken);
```

**前端 AuthContext（AuthContext.tsx）：**

```typescript
// packages/frontend/src/contexts/AuthContext.tsx#L155-157
localStorage.setItem('accessToken', accessToken);
localStorage.setItem('refreshToken', refreshToken);
localStorage.setItem('user', JSON.stringify(userData));

// packages/frontend/src/contexts/AuthContext.tsx#L312-315
localStorage.removeItem('accessToken');
localStorage.removeItem('refreshToken');
localStorage.removeItem('user');
```

---

## 3. Cookie / Token 操作代码位置汇总

### 3.1 后端 Cookie 操作

| 操作 | 文件位置 | 行号 |
|------|----------|------|
| 设置 `auth_token` Cookie | [auth.controller.ts](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L839-L850) | 839-850 |
| 清除 `auth_token` Cookie | [auth.controller.ts](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L160) | 160 |
| 清除 Session Cookie (`mxcad.sid`) | [auth.controller.ts](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L158-L159) | 158-159 |
| Session 中间件配置（cookie name） | [main.ts](file:///d:/project/cloudcad/packages/backend/src/main.ts#L97-L112) | 97-112 |
| Redis Session store prefix | [main.ts](file:///d:/project/cloudcad/packages/backend/src/main.ts#L91-L94) | 91-94 |
| Session name 配置 | [configuration.ts](file:///d:/project/cloudcad/packages/backend/src/config/configuration.ts#L152) | 152 |
| JWT 策略读取 `auth_token` | [jwt.strategy.ts](file:///d:/project/cloudcad/packages/backend/src/auth/strategies/jwt.strategy.ts#L44-L52) | 44-52 |
| 混合认证 Guard（Session 认证） | [mixed-auth.guard.ts](file:///d:/project/cloudcad/packages/backend/src/common/guards/mixed-auth.guard.ts) | 全文 |

### 3.2 前端 localStorage 操作（Token 相关）

| 操作 | 文件位置 | 行号 |
|------|----------|------|
| 读取/写入 `accessToken`, `refreshToken`, `user` | [apiClient.ts](file:///d:/project/cloudcad/packages/frontend/src/services/apiClient.ts#L110,L174,L188-L190,L205-L207,L239-L241) | 多处 |
| 读取/写入/清除认证信息 | [AuthContext.tsx](file:///d:/project/cloudcad/packages/frontend/src/contexts/AuthContext.tsx#L64-L113,L155-L157,L193-L195,L245-L247,L269-L271,L289-L291,L312-L315,L371-L373) | 多处 |
| 清除认证信息 | [authCheck.ts](file:///d:/project/cloudcad/packages/frontend/src/utils/authCheck.ts#L106-L108) | 106-108 |
| 微信登录结果存储 | [Login.tsx](file:///d:/project/cloudcad/packages/frontend/src/pages/Login.tsx#L84-L97) | 84-97 |
| 邮箱验证 Token 存储 | [EmailVerification.tsx](file:///d:/project/cloudcad/packages/frontend/src/pages/EmailVerification.tsx#L135-L153) | 135-153 |
| 手机验证 Token 存储 | [PhoneVerification.tsx](file:///d:/project/cloudcad/packages/frontend/src/pages/PhoneVerification.tsx#L115-L117) | 115-117 |

---

## 4. 与计划使用的 `auth_token` 名称的对比分析

### 4.1 冲突分析

**结论：存在完全命名冲突。**

计划使用的名称 `auth_token` 已经在后端代码中被**硬编码**使用：

| 位置 | 当前用途 | 说明 |
|------|----------|------|
| [auth.controller.ts#L843](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L843) | JWT Cookie 名称 | 后端登录成功后设置此 Cookie |
| [jwt.strategy.ts#L45](file:///d:/project/cloudcad/packages/backend/src/auth/strategies/jwt.strategy.ts#L45) | JWT 提取来源 | 从 Cookie 中提取 `auth_token` 进行 JWT 验证 |
| [auth.controller.ts#L160](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L160) | Cookie 清除 | 退出登录时清除此 Cookie |

### 4.2 影响范围

如果继续使用 `auth_token` 作为 Cookie 名称，**不会有命名冲突问题**，因为：
1. 后端已经在使用 `auth_token` 作为 JWT Cookie 的名称
2. 前端从未使用 `auth_token` 这个 localStorage key（前端使用的是 `accessToken`）

### 4.3 建议

由于 `auth_token` 已经被后端使用，如果计划统一命名，建议：

1. **方案 A（推荐）：** 保持现状 - 后端使用 `auth_token` 作为 Cookie 名称，前端使用 `accessToken` 作为 localStorage 名称。这是当前的实际状态，已经正常工作。

2. **方案 B：** 如果需要统一命名（如统一为 `auth_token`），需要修改：
   - 前端 `apiClient.ts` 中的 `localStorage.getItem('accessToken')` 改为 `localStorage.getItem('auth_token')`
   - 前端 `AuthContext.tsx` 中所有 `accessToken` 相关操作
   - 前端 `authCheck.ts` 中所有 `accessToken` 相关操作
   - 前端所有使用 `accessToken` 的页面组件

---

## 5. 审计总结

| 项目 | 状态 |
|------|------|
| Cookie 名称数量 | 2 个（`mxcad.sid`, `auth_token`） |
| localStorage Token Key 数量 | 3 个（`accessToken`, `refreshToken`, `user`） |
| 与计划 `auth_token` 的冲突 | **存在**（`auth_token` 已被后端使用） |
| Cookie 设置操作位置 | 1 处（auth.controller.ts） |
| Cookie 清除操作位置 | 2 处（auth.controller.ts:158-160） |
| localStorage Token 操作位置 | 前端 20+ 处 |

**关键发现：**
1. `auth_token` 已被后端使用，不建议作为新的统一命名
2. 前端使用 `accessToken` 作为 localStorage key，与后端 Cookie 名称 `auth_token` 并存
3. 两种存储机制并存：`httpOnly Cookie`（`auth_token`）用于特殊场景 + `localStorage`（`accessToken`）用于常规 API 请求
