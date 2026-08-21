# Auth Token Storage Analysis

## 概述

本文档分析 CloudCAD 项目在登录成功后的 Token 存储方式，包括后端是否通过 Cookie 设置 JWT Token，以及前端如何存储和使用 Token。

## 1. 后端登录流程分析

### 1.1 登录接口返回值

**文件**: [packages/backend/src/auth/auth.controller.ts](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L101-L116)

```typescript
@Post('login')
@Public()
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '用户登录' })
async login(
  @Body() loginDto: LoginDto,
  @Req() req: SessionRequest
): Promise<AuthResponseDto> {
  return this.authService.login(loginDto, req);
}
```

登录成功后，返回 `AuthResponseDto`，包含：
- `accessToken`: JWT 访问令牌
- `refreshToken`: JWT 刷新令牌
- `user`: 用户信息

### 1.2 Token 生成逻辑

**文件**: [packages/backend/src/auth/services/auth-token.service.ts](file:///d:/project/cloudcad/packages/backend/src/auth/services/auth-token.service.ts#L38-L91)

```typescript
async generateTokens(user: UserForToken): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  // ... payload 构建 ...
  const [accessToken, refreshToken] = await Promise.all([
    this.jwtService.signAsync(accessPayload, {
      secret: jwtSecret,
      expiresIn: accessExpiresIn,
    }),
    this.jwtService.signAsync(refreshPayload, {
      secret: jwtSecret,
      expiresIn: refreshExpiresIn,
    }),
  ]);

  await this.storeRefreshToken(user.id, refreshToken);

  return {
    accessToken,
    refreshToken,
  };
}
```

**关键发现**: Token 以返回值形式返回，**不使用 `res.cookie()` 设置 Cookie**。

### 1.3 后端是否使用 res.cookie() 设置 JWT Token

**搜索结果**: 在 `packages/backend/src/auth/` 目录下，**没有找到任何 `res.cookie()` 设置 JWT Token 的代码**。

唯一的 Cookie 操作是在登出时清除 Session Cookie：

**文件**: [packages/backend/src/auth/auth.controller.ts](file:///d:/project/cloudcad/packages/backend/src/auth/auth.controller.ts#L134-L153)

```typescript
@Post('logout')
@HttpCode(HttpStatus.OK)
@ApiOperation({ summary: '用户登出' })
async logout(
  @Request() req: AuthenticatedRequest,
  @Req() request: ExpressRequest,
  @Res({ passthrough: true }) response: ExpressResponse
): Promise<{ message: string }> {
  const accessToken = request.headers.authorization?.replace('Bearer ', '');
  await this.authService.logout(req.user.id, accessToken, request);

  // 清除 Cookie
  const sessionName = this.configService.get('session.name');
  response.clearCookie(sessionName);  // 清除的是 Session Cookie，不是 JWT

  return { message: '登出成功' };
}
```

## 2. JWT 策略验证方式

### 2.1 JWT Strategy

**文件**: [packages/backend/src/auth/strategies/jwt.strategy.ts](file:///d:/project/cloudcad/packages/backend/src/auth/strategies/jwt.strategy.ts#L39-L43)

```typescript
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: jwtSecret,
});
```

**关键发现**: JWT Strategy **仅支持从 Authorization Header 读取 Token**，不支持从 Cookie 读取。

### 2.2 Refresh Token Strategy

**文件**: [packages/backend/src/auth/strategies/refresh-token.strategy.ts](file:///d:/project/cloudcad/packages/backend/src/auth/strategies/refresh-token.strategy.ts#L39-L43)

```typescript
super({
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
  ignoreExpiration: false,
  secretOrKey: jwtSecret,
});
```

**关键发现**: Refresh Token Strategy **同样仅支持从 Authorization Header 读取 Token**。

## 3. 前端 Token 存储方式

### 3.1 AuthContext 存储逻辑

**文件**: [packages/frontend/src/contexts/AuthContext.tsx](file:///d:/project/cloudcad/packages/frontend/src/contexts/AuthContext.tsx#L130-L174)

```typescript
const login = useCallback(async (account: string, password: string) => {
  // ...
  const response = await client.AuthController_login(null, {
    account,
    password,
  } as LoginDto);

  const {
    accessToken,
    refreshToken,
    user: userData,
  } = response.data as unknown as AuthResponseData;

  // 存储到本地存储
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
  localStorage.setItem('user', JSON.stringify(userData));
  // ...
}, []);
```

**关键发现**: 前端将 Token **存储在 localStorage 中**。

### 3.2 请求拦截器 Token 注入

**文件**: [packages/frontend/src/services/apiClient.ts](file:///d:/project/cloudcad/packages/frontend/src/services/apiClient.ts#L106-L120)

```typescript
function setupInterceptors(instance: AxiosInstance) {
  // 请求拦截器
  instance.interceptors.request.use(
    (config) => {
      const token = localStorage.getItem('accessToken');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      // ...
      return config;
    },
    (error) => Promise.reject(error)
  );
}
```

**关键发现**: 前端每次请求时从 **localStorage 读取 Token** 并设置到 **Authorization Header**。

### 3.3 Token 自动刷新

**文件**: [packages/frontend/src/services/apiClient.ts](file:///d:/project/cloudcad/packages/frontend/src/services/apiClient.ts#L166-L199)

```typescript
if (
  axiosError.response?.status === 401 &&
  !originalRequest._retry &&
  !isLoginEndpoint &&
  !isProfileEndpoint
) {
  originalRequest._retry = true;
  const refreshToken = localStorage.getItem('refreshToken');

  if (!refreshToken) {
    clearAuthAndRedirect();
    return Promise.reject(error);
  }

  try {
    // ... 调用刷新接口 ...
    const { accessToken, refreshToken: newRefreshToken } = response.data.data;
    localStorage.setItem('accessToken', accessToken);
    if (newRefreshToken)
      localStorage.setItem('refreshToken', newRefreshToken);
    // ...
  } catch {
    clearAuthAndRedirect();
    return Promise.reject(error);
  }
}
```

### 3.4 登出时清除 Token

**文件**: [packages/frontend/src/contexts/AuthContext.tsx](file:///d:/project/cloudcad/packages/frontend/src/contexts/AuthContext.tsx#L300-L343)

```typescript
const logout = useCallback(async () => {
  // 1. 调用后端 API 注销
  await client.AuthController_logout();
  // ...
  } finally {
    // 2. 清除本地存储
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    // ...
  }
}, []);
```

## 4. 总结

### 4.1 Token 存储方式对比

| 组件 | 存储位置 | 说明 |
|------|---------|------|
| 后端登录接口 | 无 Cookie | 仅返回 JSON 响应体 |
| 后端 Session | Cookie | 仅存储 Session ID，不存储 JWT |
| JWT Strategy | Authorization Header | 仅从 Header 读取 Token |
| 前端 | localStorage | 存储 accessToken 和 refreshToken |

### 4.2 完整认证流程

```
1. 用户登录 (POST /v1/auth/login)
   ├── 后端验证用户名密码
   ├── 生成 accessToken 和 refreshToken
   ├── 返回 JSON 响应 (无 Cookie 设置)
   └── 存储 refreshToken 到数据库

2. 前端收到登录响应
   ├── 将 accessToken 存入 localStorage
   ├── 将 refreshToken 存入 localStorage
   └── 将用户信息存入 localStorage

3. 前端发起认证请求
   ├── 从 localStorage 读取 accessToken
   └── 设置 Authorization: Bearer <token> Header

4. Token 过期时
   ├── 后端返回 401
   ├── 前端拦截器从 localStorage 读取 refreshToken
   ├── 调用 POST /v1/auth/refresh
   └── 新 Token 存入 localStorage

5. 用户登出
   ├── 调用后端 POST /v1/auth/logout
   ├── 后端清除 Session 和 RefreshToken 黑名单
   ├── 前端清除 localStorage
   └── 跳转登录页
```

### 4.3 结论

1. **后端不会通过 `res.cookie()` 设置包含 JWT Token 的 Cookie**
2. **后端 JWT 验证策略仅支持从 Authorization Header 读取 Token**
3. **前端使用 localStorage 存储 Token（accessToken 和 refreshToken）**
4. **前端每次请求通过 Authorization Header 携带 Token**

这种设计是纯粹的 Token-based 认证方式，而非 Cookie-based 认证。Token 完全由前端管理，后端仅负责验证 Header 中的 Token。
