---
name: config-management
description: AUTO-TRIGGER on: process.env, .env, 环境变量, configuration, ConfigService, RuntimeConfig, runtime-config, apiConfig, serverConfig, getConfig, tourGuides, 添加配置, 修改配置项. 三层配置体系（后端环境变量+运行时配置+前端配置）.
---

# 配置管理

> 后端三层 + 前端约定

## 配置体系

```
部署配置中心 (Layer 0)  →  packages/config-service/server.js
    ↓ 写入 .env
环境变量配置 (Layer 1)  →  packages/backend/src/config/
    ↓ NestJS ConfigModule
运行时配置 (Layer 2)    →  packages/backend/src/runtime-config/
    ↓ API
前端配置               →  packages/frontend/src/config/ + contexts/RuntimeConfigContext
```

## 决策：选哪层

| 类型 | 存放位置 | 示例 |
|------|---------|------|
| 基础设施（数据库、端口、密钥） | 环境变量 (Layer 1) | `DB_HOST`, `JWT_SECRET` |
| 业务可调参数（限制、开关） | 运行时配置 (Layer 2) | `maxFileSize`, `featureFlag` |
| 前端静态配置（API地址、超时） | `src/config/*.ts` | `API_BASE_URL`, `API_TIMEOUT` |
| 前端动态配置（品牌、公共设置） | `RuntimeConfigContext` | `appName`, `logo` |

## 后端：环境变量配置

### 2.1 添加新配置项的完整流程

```
Step 1: 定义接口 (app.config.ts)
   ↓
Step 2: 解析环境变量 (configuration.ts)
   ↓
Step 3: 使用配置 (注入 ConfigService 或直接使用)
```

### 2.2 Step 1: 定义接口

**文件**：`packages/backend/src/config/app.config.ts`

```typescript
// 1. 定义配置接口（如果不存在）
export interface NewFeatureConfig {
  /** 功能开关 */
  enabled: boolean;
  /** 超时时间（毫秒） */
  timeout: number;
}

// 2. 添加到 AppConfig 接口
export interface AppConfig {
  // ... 现有配置
  newFeature: NewFeatureConfig;  // 添加新配置
}
```

### 2.3 Step 2: 解析环境变量

**文件**：`packages/backend/src/config/configuration.ts`

```typescript
export default (): AppConfig => ({
  // ... 现有配置

  // 添加新配置
  newFeature: {
    enabled: parseBoolean(process.env.NEW_FEATURE_ENABLED, false),
    timeout: parseInt(process.env.NEW_FEATURE_TIMEOUT || '30000', 10) || 30000,
  },
});
```

### 2.4 Step 3: 使用配置

**方式 A：在 main.ts 中使用**

```typescript
// packages/backend/src/main.ts
async function bootstrap() {
  // ... 等待配置加载
  await ConfigModule.envVariablesLoaded;
  const config = configuration();

  // 直接使用配置
  if (config.newFeature.enabled) {
    logger.log('新功能已启用');
  }
}
```

**方式 B：在 Service 中注入 ConfigService**

```typescript
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SomeService {
  constructor(private configService: ConfigService) {}

  someMethod() {
    // 使用 get() 获取配置
    const enabled = this.configService.get('newFeature.enabled', false);
    const timeout = this.configService.get('newFeature.timeout', 30000);
  }
}
```

### 2.5 辅助函数

`configuration.ts` 提供了以下辅助函数：

```typescript
// 解析布尔值
parseBoolean(value: string | undefined, defaultValue: boolean): boolean

// 解析字符串数组（逗号分隔）
parseStringArray(value: string | undefined, defaultValue: string[]): string[]

// 解析路径为绝对路径
resolvePath(inputPath: string): string
```

### 2.6 错误示例

```typescript
// ❌ 错误 - 直接使用 process.env
const port = process.env.MY_PORT || '3000';

// ❌ 错误 - 在 Service 中直接调用 configuration()
import configuration from '../config/configuration';
const config = configuration();  // 每次调用都重新解析

// ✅ 正确 - 通过 ConfigService 获取
const port = this.configService.get('myFeature.port', 3000);

// ✅ 正确 - 在 main.ts 中使用 configuration()
const config = configuration();
```

---

## 三、运行时配置

### 3.1 添加新的运行时配置项

**文件**：`packages/backend/src/runtime-config/runtime-config.constants.ts`

```typescript
export const RUNTIME_CONFIG_DEFINITIONS: RuntimeConfigDefinition[] = [
  // ... 现有配置

  // 添加新配置项
  {
    key: 'newFeatureLimit',
    type: 'number',
    category: 'feature',
    description: '新功能数量限制',
    defaultValue: 100,
    isPublic: false,  // 是否对未登录用户可见
  },
];
```

### 3.2 使用运行时配置

```typescript
import { RuntimeConfigService } from '../runtime-config/runtime-config.service';

@Injectable()
export class SomeService {
  constructor(private readonly runtimeConfigService: RuntimeConfigService) {}

  async someMethod() {
    // 获取配置值，提供默认值
    const limit = await this.runtimeConfigService.getValue<number>('newFeatureLimit', 100);

    // 获取完整配置项
    const config = await this.runtimeConfigService.get('newFeatureLimit');
    // config: { key, value, type, category, description }
  }
}
```

### 3.3 运行时配置的模块依赖

需要在 Module 中导入 `RuntimeConfigModule`：

```typescript
import { RuntimeConfigModule } from '../runtime-config/runtime-config.module';

@Module({
  imports: [RuntimeConfigModule],
  // ...
})
export class SomeModule {}
```

---

## 四、部署配置中心

### 4.1 概述

部署配置中心是一个独立的 Web 服务（`packages/config-service`），用于：

- 管理 `.env` 文件
- 启动/停止服务
- 测试数据库和 Redis 连接

### 4.2 添加新的可配置项

**文件**：`packages/config-service/server.js`

```javascript
const CONFIG_GROUPS = [
  {
    name: '新功能配置',
    key: 'newFeature',
    controllable: true,  // true = 修改后重启即可生效
    description: '修改后重启服务即可生效',
    items: [
      { key: 'NEW_FEATURE_ENABLED', label: '启用新功能', type: 'boolean', sensitive: false },
      { key: 'NEW_FEATURE_TIMEOUT', label: '超时时间', type: 'number', sensitive: false },
    ]
  },
];
```

### 4.3 配置项类型

| type | 说明 |
|------|------|
| `text` | 普通文本 |
| `number` | 数字 |
| `boolean` | 布尔值 |
| `password` | 密码（显示为掩码） |
| `secret` | 敏感信息（显示为"已设置/未设置"） |

---

## 前端：配置约定

### 静态配置
| 文件 | 用途 |
|------|------|
| `src/config/apiConfig.ts` | API 基地址、超时、上传分片配置 |
| `src/config/serverConfig.ts` | CAD 引擎配置（wasm、AI、字体），从 `mxServerConfig.json` 加载 |
| `src/config/getConfig.ts` | 通用配置获取，内置内存缓存 |
| `src/config/tourGuides.ts` | 引导流程注册表 |
| `src/config/tours/*.ts` | 各引导流程定义 |
| `src/constants/appConfig.ts` | 品牌信息、分页默认值 |

### 动态配置（来自后端运行时配置）
```typescript
// 通过 RuntimeConfigContext 获取，无需手动 fetch
const { config } = useRuntimeConfig();
// config 自动从后端 RuntimeConfigController_getPublicConfigs 同步
```

### 前端配置原则
- 静态配置放 `src/config/`，不写死魔法数字
- 动态配置通过 `RuntimeConfigContext`，不直接 fetch
- 禁止在组件中 `import.meta.env` 或 `process.env`

## 检查清单

### 添加环境变量配置

- [ ] 在 `app.config.ts` 中定义接口
- [ ] 在 `configuration.ts` 中解析环境变量
- [ ] 使用 `configService.get()` 或 `configuration()` 获取配置
- [ ] 在 `.env.example` 中添加示例
- [ ] 如需部署配置中心管理，在 `config-service/server.js` 中添加

### 添加运行时配置

- [ ] 在 `runtime-config.constants.ts` 中添加定义
- [ ] 设置正确的 `type`、`category`、`defaultValue`
- [ ] 确定 `isPublic` 值（是否对未登录用户可见）
- [ ] 在使用处通过 `RuntimeConfigService.getValue()` 获取

---

## 六、常见错误

### 错误 1：直接使用 process.env

```typescript
// ❌ 错误
const dbHost = process.env.DB_HOST;

// ✅ 正确
const dbHost = this.configService.get('database.host', 'localhost');
```

### 错误 2：忘记添加接口定义

```typescript
// ❌ 错误 - 只在 configuration.ts 添加，缺少类型定义
export default (): AppConfig => ({
  newFeature: { enabled: true },  // TypeScript 报错
}));

// ✅ 正确 - 先在 app.config.ts 定义接口
```

### 错误 3：混淆配置层级

```typescript
// ❌ 错误 - 把业务参数放到环境变量
// .env
MAX_FILE_SIZE=100

// ✅ 正确 - 业务参数使用运行时配置
// runtime-config.constants.ts
{ key: 'maxFileSize', type: 'number', defaultValue: 100 }
```

---

## 七、快速参考

| 操作 | 文件位置 |
|------|---------|
| 定义环境变量接口 | `packages/backend/src/config/app.config.ts` |
| 解析环境变量 | `packages/backend/src/config/configuration.ts` |
| 使用环境变量配置 | `ConfigService.get()` 或 `configuration()` |
| 定义运行时配置 | `packages/backend/src/runtime-config/runtime-config.constants.ts` |
| 使用运行时配置 | `RuntimeConfigService.getValue()` |
| 部署配置中心 | `packages/config-service/server.js` |
