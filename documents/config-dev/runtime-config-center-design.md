# 运行时配置中心设计方案

> 创建日期：2026-03-14
> 状态：已完成

## 1. 概述

运行时配置中心用于管理可在运行时动态修改的业务配置，修改后立即生效，无需重启服务。

**核心目标**：
- 动态调整业务参数
- 无需重启服务
- 管理员可在后台界面操作

## 2. 与部署配置的区别

| 特性 | 部署配置中心 | 运行时配置中心 |
|------|-------------|---------------|
| **存储位置** | .env 文件 | 数据库 + Redis 缓存 |
| **修改生效** | 需重启服务 | 立即生效 |
| **配置内容** | 数据库连接、SMTP密码、端口、密钥 | 功能开关、业务参数 |
| **所属服务** | 独立配置服务 (3002) | 主服务 (3001) |
| **管理入口** | 独立登录页面 | 主服务后台 |

## 3. 配置项定义

### 3.1 配置项列表

| 配置项 | 环境变量 | 类型 | 默认值 | 说明 |
|--------|----------|------|--------|------|
| MAIL_ENABLED | mailEnabled | boolean | false | 邮件服务开关 |
| REQUIRE_EMAIL_VERIFICATION | requireEmailVerification | boolean | false | 强制邮箱验证 |
| SUPPORT_EMAIL | supportEmail | string | - | 客服邮箱 |
| SUPPORT_PHONE | supportPhone | string | - | 客服电话 |
| MAX_FILE_SIZE | maxFileSize | number | 100 | 文件上传大小限制 (MB) |
| ALLOW_REGISTER | allowRegister | boolean | true | 用户注册开关 |
| SYSTEM_NOTICE | systemNotice | string | - | 系统公告 |

### 3.2 配置项属性

每个配置项包含以下属性：

```typescript
interface RuntimeConfigItem {
  key: string;           // 配置键名
  value: string | number | boolean;  // 配置值
  type: 'string' | 'number' | 'boolean';  // 值类型
  category: string;      // 分类
  description: string;   // 配置说明
  isPublic: boolean;     // 是否公开给前端
  updatedAt: Date;       // 最后更新时间
  updatedBy: string;     // 最后更新人
}
```

## 4. 数据库设计

### 4.1 数据表

```prisma
model RuntimeConfig {
  id          String   @id @default(cuid())
  key         String   @unique  // 配置键名
  value       String            // 配置值（JSON 序列化）
  type        String            // string | number | boolean
  category    String            // 分类
  description String?           // 配置说明
  isPublic    Boolean @default(false)  // 是否公开给前端
  updatedBy   String?           // 最后修改人 ID
  updatedAt   DateTime @updatedAt
  
  @@index([category])
  @@index([key])
  @@map("runtime_configs")
}
```

### 4.2 初始数据

系统启动时自动初始化默认配置：

```sql
INSERT INTO runtime_configs (key, value, type, category, description, isPublic) VALUES
('mailEnabled', 'false', 'boolean', 'mail', '邮件服务开关', true),
('requireEmailVerification', 'false', 'boolean', 'mail', '强制邮箱验证', true),
('supportEmail', '', 'string', 'support', '客服邮箱', true),
('supportPhone', '', 'string', 'support', '客服电话', true),
('maxFileSize', '100', 'number', 'file', '文件上传大小限制 (MB)', false),
('allowRegister', 'true', 'boolean', 'user', '用户注册开关', true),
('systemNotice', '', 'string', 'system', '系统公告', true);
```

## 5. 缓存设计

### 5.1 缓存策略

| 操作 | 缓存行为 |
|------|----------|
| 读取配置 | 先查 Redis，未命中则查数据库并写入缓存 |
| 修改配置 | 更新数据库 → 删除缓存（下次读取时重建） |
| 批量读取 | 先查 Redis，未命中则查数据库并写入缓存 |

### 5.2 缓存结构

```
Redis Key: runtime_config:{key}
Redis Key: runtime_config:all (所有公开配置)

TTL: 3600 秒（1 小时）
```

### 5.3 缓存服务

```typescript
@Injectable()
export class RuntimeConfigService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  async get<T>(key: string, defaultValue?: T): Promise<T> {
    // 1. 查 Redis 缓存
    const cached = await this.redis.get(`runtime_config:${key}`);
    if (cached !== null) {
      return JSON.parse(cached);
    }

    // 2. 查数据库
    const config = await this.prisma.runtimeConfig.findUnique({
      where: { key },
    });

    if (!config) {
      return defaultValue as T;
    }

    // 3. 写入缓存
    const value = this.parseValue(config.value, config.type);
    await this.redis.set(
      `runtime_config:${key}`,
      JSON.stringify(value),
      'EX',
      3600,
    );

    return value;
  }

  async set(key: string, value: unknown, updatedBy?: string): Promise<void> {
    // 1. 更新数据库
    await this.prisma.runtimeConfig.upsert({
      where: { key },
      update: {
        value: JSON.stringify(value),
        updatedBy,
      },
      create: {
        key,
        value: JSON.stringify(value),
        type: typeof value as string,
        updatedBy,
      },
    });

    // 2. 删除缓存
    await this.redis.del(`runtime_config:${key}`);
    await this.redis.del('runtime_config:all');
  }

  async getPublicConfigs(): Promise<Record<string, unknown>> {
    // 1. 查缓存
    const cached = await this.redis.get('runtime_config:all');
    if (cached !== null) {
      return JSON.parse(cached);
    }

    // 2. 查数据库
    const configs = await this.prisma.runtimeConfig.findMany({
      where: { isPublic: true },
    });

    // 3. 构建结果
    const result: Record<string, unknown> = {};
    for (const config of configs) {
      result[config.key] = this.parseValue(config.value, config.type);
    }

    // 4. 写入缓存
    await this.redis.set(
      'runtime_config:all',
      JSON.stringify(result),
      'EX',
      3600,
    );

    return result;
  }
}
```

## 6. 前端集成

### 6.1 初始化接口

**GET /api/system/config**

返回前端需要知道的所有公开配置：

```json
{
  "mailEnabled": false,
  "requireEmailVerification": false,
  "supportEmail": "support@example.com",
  "supportPhone": "400-xxx-xxxx",
  "allowRegister": true,
  "systemNotice": "系统维护中..."
}
```

### 6.2 前端调用时机

```
前端启动
    │
    ▼
调用 GET /api/system/config
    │
    ▼
存储到全局状态 (Context/Store)
    │
    ▼
各组件按需使用
```

### 6.3 配置变更后

- 前端刷新页面即可获取最新配置
- 无需重新登录
- 无需重启服务

## 7. 后台管理界面

### 7.1 入口位置

主服务后台 → 系统设置 → 运行时配置

### 7.2 界面设计

```
┌─────────────────────────────────────────────────────────────┐
│  系统设置 > 运行时配置                                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ 邮件配置 ─────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  邮件服务开关      [ 关闭 ▼ ]                          │ │
│  │  强制邮箱验证      [ 关闭 ▼ ]                          │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 客服信息 ─────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  客服邮箱          [________________________]          │ │
│  │  客服电话          [________________________]          │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 用户管理 ─────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  用户注册开关      [ 开启 ▼ ]                          │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌─ 系统公告 ─────────────────────────────────────────────┐ │
│  │                                                        │ │
│  │  公告内容          [________________________]          │ │
│  │                    [________________________]          │ │
│  │                                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                                                             │
│                              [ 保存配置 ]  [ 重置默认 ]      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 7.3 权限要求

- 需要 `system:config:read` 权限查看配置
- 需要 `system:config:write` 权限修改配置

## 8. API 设计

### 8.1 公开接口

| API | 方法 | 说明 | 权限 |
|-----|------|------|------|
| `/api/system/config` | GET | 获取前端所需的公开配置 | 无需登录 |

### 8.2 管理接口

| API | 方法 | 说明 | 权限 |
|-----|------|------|------|
| `/api/admin/runtime-configs` | GET | 获取所有配置项 | system:config:read |
| `/api/admin/runtime-configs/:key` | GET | 获取单个配置项 | system:config:read |
| `/api/admin/runtime-configs/:key` | PUT | 更新配置项 | system:config:write |
| `/api/admin/runtime-configs/:key/reset` | POST | 重置为默认值 | system:config:write |

## 9. 审计日志

### 9.1 日志记录

每次配置修改记录以下信息：

| 字段 | 说明 |
|------|------|
| 操作人 | 修改配置的用户 |
| 配置键 | 被修改的配置项 |
| 旧值 | 修改前的值 |
| 新值 | 修改后的值 |
| 操作时间 | 修改时间 |
| IP 地址 | 操作来源 IP |

### 9.2 日志表结构

```prisma
model RuntimeConfigLog {
  id        String   @id @default(cuid())
  key       String   // 配置键名
  oldValue  String?  // 旧值
  newValue  String   // 新值
  operatorId String  // 操作人 ID
  operatorIp String? // 操作 IP
  createdAt DateTime @default(now())

  @@index([key])
  @@index([createdAt])
  @@map("runtime_config_logs")
}
```

## 10. 与邮件服务开关的集成

运行时配置中心与邮件服务开关紧密配合：

### 10.1 配置项

| 配置项 | 作用 |
|--------|------|
| `mailEnabled` | 控制是否启用邮件服务 |
| `requireEmailVerification` | 控制是否强制邮箱验证 |

### 10.2 使用方式

```typescript
// 在 AuthService 中使用
@Injectable()
export class AuthService {
  constructor(
    private runtimeConfig: RuntimeConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const mailEnabled = await this.runtimeConfig.get<boolean>('mailEnabled');
    
    if (mailEnabled) {
      // 发送验证码流程
    } else {
      // 直接创建用户
    }
  }

  async login(dto: LoginDto) {
    const requireVerification = await this.runtimeConfig.get<boolean>(
      'requireEmailVerification'
    );
    
    if (requireVerification && !user.email) {
      throw new UnauthorizedException('请先绑定邮箱');
    }
    
    // 正常登录流程
  }
}
```

## 11. 变更文件清单

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `packages/backend/prisma/schema.prisma` | 修改 | 添加 RuntimeConfig、RuntimeConfigLog 模型 |
| `packages/backend/src/runtime-config/runtime-config.module.ts` | 新增 | 运行时配置模块 |
| `packages/backend/src/runtime-config/runtime-config.service.ts` | 新增 | 配置服务 |
| `packages/backend/src/runtime-config/runtime-config.controller.ts` | 新增 | API 控制器 |
| `packages/backend/src/system/system.controller.ts` | 修改 | 添加公开配置接口 |
| `packages/frontend/src/pages/admin/RuntimeConfig.tsx` | 新增 | 后台管理页面 |
| `packages/frontend/src/services/runtimeConfigApi.ts` | 新增 | API 封装 |

## 12. 相关文档

- [邮件服务开关设计方案](./mail-service-toggle-design.md)
- [部署引导与配置中心方案](./deployment-setup-wizard-design.md)
