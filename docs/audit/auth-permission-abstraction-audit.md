# 认证模块与权限模块抽象接口分析

汇报人：Trea

## 一、认证模块是否已有类似 IAuthProvider 的抽象接口？

### 1.1 扫描结果

扫描 `apps/backend/src/auth/` 目录下的所有 .ts 文件，**未发现 IAuthProvider 接口定义**。

当前 auth 模块中存在的接口：

| 文件路径 | 接口名称 | 说明 |
|---------|---------|------|
| `auth/interfaces/jwt-payload.interface.ts` | `JwtAccessPayload` | JWT 访问令牌载荷 |
| `auth/interfaces/jwt-payload.interface.ts` | `JwtRefreshPayload` | JWT 刷新令牌载荷 |
| `auth/interfaces/jwt-payload.interface.ts` | `UserForToken` | 用于生成 Token 的用户信息 |
| `auth/interfaces/jwt-payload.interface.ts` | `SessionRequest` | Session 请求扩展 |
| `auth/interfaces/jwt-payload.interface.ts` | `WechatTempPayload` | 微信临时令牌载荷 |
| `auth/services/wechat.service.ts` | `WechatUserInfo` | 微信用户信息 |
| `auth/services/sms/interfaces/sms-provider.interface.ts` | `SmsProvider` | **短信服务商统一抽象接口** |

### 1.2 SmsProvider 接口参考（唯一 Provider 抽象）

[apps/backend/src/auth/services/sms/interfaces/sms-provider.interface.ts](file:///d:/project/cloudcad/apps/backend/src/auth/services/sms/interfaces/sms-provider.interface.ts)

```typescript
export interface SmsProvider {
  readonly name: string;
  sendVerificationCode(phone: string, code: string): Promise<SendResult>;
  sendTemplate(phone: string, templateId: string, params: Record<string, string>): Promise<SendResult>;
  healthCheck(): Promise<boolean>;
}
```

该接口已有多种实现：
- `AliyunSmsProvider`
- `TencentSmsProvider`
- `MockSmsProvider`

### 1.3 IAuthProvider 接口建议定义

基于 [AuthFacadeService](file:///d:/project/cloudcad/apps/backend/src/auth/auth-facade.service.ts) 的公开方法，建议 IAuthProvider 接口应包含：

```typescript
export interface IAuthProvider {
  /** 用户注册 */
  register(registerDto: RegisterDto, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 邮箱验证激活 */
  verifyEmailAndActivate(email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 用户登录（用户名/邮箱+密码） */
  login(loginDto: LoginDto, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 手机号验证码登录 */
  loginByPhone(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 微信登录 */
  loginWithWechat(code: string, state: string): Promise<WechatLoginResponseDto>;

  /** 刷新令牌 */
  refreshToken(refreshToken: string): Promise<AuthResponseDto>;

  /** 用户登出 */
  logout(userId: string, accessToken?: string, req?: any): Promise<void>;

  /** 验证用户凭据 */
  validateUser(email: string, password: string): Promise<any>;

  /** 忘记密码 */
  forgotPassword(email?: string, phone?: string): Promise<{ message: string; mailEnabled: boolean; smsEnabled: boolean; supportEmail?: string; supportPhone?: string; }>;

  /** 重置密码 */
  resetPassword(email?: string, phone?: string, code?: string, newPassword?: string): Promise<{ message: string }>;

  /** 发送绑定邮箱验证码 */
  sendBindEmailCode(userId: string, email: string, isRebind?: boolean): Promise<{ message: string }>;

  /** 验证绑定邮箱 */
  verifyBindEmail(userId: string, email: string, code: string): Promise<{ message: string }>;

  /** 绑定手机号 */
  bindPhone(userId: string, phone: string, code: string): Promise<{ success: boolean; message: string }>;

  /** 绑定微信 */
  bindWechat(userId: string, code: string, state: string): Promise<WechatBindResponseDto>;

  /** 解绑微信 */
  unbindWechat(userId: string): Promise<WechatUnbindResponseDto>;

  /** 生成 Token */
  generateTokens(user: UserForToken): Promise<{ accessToken: string; refreshToken: string }>;

  /** 验证手机号并登录 */
  verifyPhoneAndLogin(phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 绑定邮箱并登录 */
  bindEmailAndLogin(tempToken: string, email: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 绑定手机号并登录 */
  bindPhoneAndLogin(tempToken: string, phone: string, code: string, req?: SessionRequest): Promise<AuthResponseDto>;

  /** 验证邮箱并完成手机号注册 */
  verifyEmailAndRegisterPhone(email: string, emailCode: string, registerData: any, req?: SessionRequest): Promise<AuthResponseDto>;
}
```

**建议**：如果需要抽象 IAuthProvider，建议将 AuthFacadeService 拆分为更细粒度的接口，如：
- `IAuthenticationProvider` - 负责认证（登录、注册）
- `IAccountBindingProvider` - 负责账号绑定（邮箱、手机、微信）
- `IPasswordManagementProvider` - 负责密码管理

---

## 二、认证模块和权限模块的关系

### 2.1 AuthFacadeService 依赖分析

查看 [auth-facade.service.ts](file:///d:/project/cloudcad/apps/backend/src/auth/auth-facade.service.ts) 的构造函数：

```typescript
constructor(
  private prisma: DatabaseService,
  private jwtService: JwtService,
  private configService: ConfigService,
  private tokenBlacklistService: TokenBlacklistService,
  private emailVerificationService: EmailVerificationService,
  private smsVerificationService: SmsVerificationService,
  private wechatService: WechatService,
  private initializationService: InitializationService,
  private runtimeConfigService: RuntimeConfigService,
  @Inject(USER_SERVICE) private readonly userService: IUserService,
  @InjectRedis() private readonly redis: Redis,
  private registrationService: RegistrationService,
  private loginService: LoginService,
  private passwordService: PasswordService,
  private accountBindingService: AccountBindingService,
  private authTokenService: AuthTokenService
)
```

**结论**：AuthFacadeService **不直接依赖 PermissionService 或 ProjectPermissionService**。

### 2.2 认证和授权是否已分离

**已分离**。认证模块和权限模块的关系如下：

| 模块 | 职责 | 关键文件 |
|------|------|---------|
| 认证模块 (Auth) | "你是谁？" - 验证用户身份，提供 JWT token | `auth/auth-facade.service.ts` |
| 权限模块 (Permission) | "你能做什么？" - 检查用户权限 | `common/services/permission.service.ts` |
| 项目权限模块 (ProjectPermission) | "你在某项目中能做什么？" | `roles/project-permission.service.ts` |

### 2.3 权限信息来源

认证模块获取用户权限的方式：

1. **登录时从数据库查询**：`loginByPhone()` 等方法直接从 Prisma 查询用户角色和权限
2. **JWT Strategy 中查询**：[jwt.strategy.ts](file:///d:/project/cloudcad/apps/backend/src/auth/strategies/jwt.strategy.ts) 从数据库加载用户完整信息（包括权限）

```typescript
// jwt.strategy.ts 中的 validate 方法
const user = await this.prisma.user.findUnique({
  where: { id: payload.sub },
  select: {
    id: true,
    email: true,
    // ...
    role: {
      select: {
        id: true,
        name: true,
        // ...
        permissions: {
          select: { permission: true },
        },
      },
    },
  },
});

// 将权限放入 JWT token
return {
  ...user,
  permissions: role.permissions.map((p) => p.permission),
};
```

**结论**：认证和授权在代码层面**已完全分离**，但认证模块在登录时需要查询用户的角色权限信息以生成完整的 JWT。

---

## 三、权限模块是否已有 IPermissionStore 之类的抽象接口？

### 3.1 扫描结果

扫描 `apps/backend/src/` 目录，**未发现 IPermissionStore 接口定义**。

搜索结果：
- `IPermissionStore` - 无匹配
- `IPermissionProvider` - 无匹配
- `IPermissionRepository` - 无匹配

### 3.2 当前权限数据来源实现

权限数据完全通过 Prisma 直接访问数据库，**无任何抽象层**：

#### 3.2.1 系统权限数据来源

[permission.service.ts](file:///d:/project/cloudcad/apps/backend/src/common/services/permission.service.ts)

```typescript
constructor(
  private readonly prisma: DatabaseService,  // 直接注入 Prisma
  private readonly cacheService: PermissionCacheService,
  private readonly roleInheritanceService: RoleInheritanceService,
  @Optional()
  private readonly policyConfigService?: PolicyConfigService,
  @Optional()
  private readonly policyEngineService?: PolicyEngineService
) {}

// 直接查询数据库获取用户权限
private async checkUserSystemPermission(userId: string, permission: SystemPermission): Promise<boolean> {
  return await this.roleInheritanceService.checkUserPermissionWithInheritance(userId, permission);
}
```

#### 3.2.2 项目权限数据来源

[project-permission.service.ts](file:///d:/project/cloudcad/apps/backend/src/roles/project-permission.service.ts)

```typescript
constructor(
  private readonly prisma: DatabaseService,  // 直接注入 Prisma
  private readonly projectRolesService: ProjectRolesService,
  private readonly cacheService: PermissionCacheService
) {}

// 直接查询数据库
async getUserPermissions(userId: string, projectId: string): Promise<ProjectPermission[]> {
  const member = await this.prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    include: { projectRole: { include: { permissions: true } } },
  });
  // ...
}
```

#### 3.2.3 权限缓存实现

[permission-cache.service.ts](file:///d:/project/cloudcad/apps/backend/src/common/services/permission-cache.service.ts)

权限缓存基于 Redis 实现，但**仅作为缓存层**，底层仍是直连数据库：

```typescript
@Injectable()
export class PermissionCacheService {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> { /* Redis 读取 */ }
  async set<T>(key: string, value: T, ttl: number): Promise<void> { /* Redis 写入 */ }
  async delete(key: string): Promise<void> { /* Redis 删除 */ }
  async clearUserCache(userId: string): Promise<void> { /* 清理用户缓存 */ }
  async clearProjectCache(projectId: string): Promise<void> { /* 清理项目缓存 */ }
  async clearRoleCache(roleName: string): Promise<void> { /* 清理角色缓存 */ }
}
```

### 3.3 IPermissionStore 建议定义

如果需要抽象权限存储层，建议定义：

```typescript
/**
 * 权限存储接口
 *
 * 负责权限数据的存取，屏蔽底层实现（数据库/缓存）
 */
export interface IPermissionStore {
  /** 获取用户的系统权限 */
  getUserSystemPermissions(userId: string): Promise<SystemPermission[]>;

  /** 检查用户是否具有指定系统权限 */
  checkSystemPermission(userId: string, permission: SystemPermission): Promise<boolean>;

  /** 获取用户在项目中的权限 */
  getUserProjectPermissions(userId: string, projectId: string): Promise<ProjectPermission[]>;

  /** 检查用户在项目中是否具有指定权限 */
  checkProjectPermission(userId: string, projectId: string, permission: ProjectPermission): Promise<boolean>;

  /** 获取用户的角色 */
  getUserRole(userId: string): Promise<SystemRole | null>;

  /** 获取用户在项目中的角色 */
  getUserProjectRole(userId: string, projectId: string): Promise<ProjectRole | null>;

  /** 检查是否为项目所有者 */
  isProjectOwner(userId: string, projectId: string): Promise<boolean>;

  /** 清除用户权限缓存 */
  clearUserCache(userId: string): Promise<void>;

  /** 清除项目权限缓存 */
  clearProjectCache(projectId: string): Promise<void>;
}
```

---

## 总结

| 问题 | 结论 |
|------|------|
| 是否有 IAuthProvider 接口？ | **否**，无认证抽象接口。建议参考 SmsProvider 的模式进行抽象。 |
| AuthFacadeService 是否依赖 PermissionService？ | **否**，两者已完全解耦。认证模块只负责"你是谁"，权限模块负责"你能做什么"。 |
| 是否有 IPermissionStore 接口？ | **否**，权限数据直接通过 Prisma 访问数据库，无存储抽象层。 |

### 建议

1. **短期**：当前架构可继续使用，认证与权限已分离
2. **中期**：如需支持多租户或多数据库场景，建议引入 IPermissionStore 抽象
3. **长期**：如需支持多种认证方式（OAuth、SAML等），建议引入 IAuthProvider 抽象
