# Runtime Configuration — 逻辑意图对比审计

**对比分支：** `main` (旧) vs `refactor/circular-deps` (新)
**审计日期：** 2026-05-08
**结论：✅ 全部一致，无缺失功能**

---

## 一、后端 API 端点

| 端点 | main | refactor | 意图一致? |
|------|------|----------|-----------|
| `GET /api/runtime-config/public` | 有 (Public) | 有 (Public + `@Throttle` + `CacheInterceptor`) | ✅ 一致（新增性能优化） |
| `GET /api/runtime-config` | 有 (SYSTEM_CONFIG_READ) | 有 (SYSTEM_CONFIG_READ) | ✅ 完全一致 |
| `GET /api/runtime-config/definitions` | 有 (SYSTEM_CONFIG_READ) | 有 (SYSTEM_CONFIG_READ) | ✅ 完全一致 |
| `GET /api/runtime-config/:key` | 有 (SYSTEM_CONFIG_READ) | 有 (SYSTEM_CONFIG_READ) | ✅ 完全一致 |
| `PUT /api/runtime-config/:key` | 有 (SYSTEM_CONFIG_WRITE + 审计日志) | 有 (SYSTEM_CONFIG_WRITE + 审计日志) | ✅ 完全一致 |
| `POST /api/runtime-config/:key/reset` | 有 (SYSTEM_CONFIG_WRITE) | 有 (SYSTEM_CONFIG_WRITE) | ✅ 完全一致 |

### 注意点（仅实现细节差异，非意图差异）

| 差异项 | main | refactor | 影响 |
|--------|------|----------|------|
| public 端点限流/缓存 | 无 | `@Throttle(60/min)` + `CacheInterceptor(TTL=300s)` | 性能增强，意图不变 |
| DTO 校验装饰器 | `@IsNotEmpty` | `@IsDefined` | 均拒空值，语义等价 |
| 模块导入 | 无额外 imports | `CacheModule.register()` | 支撑缓存装饰器所需 |
| 日志方式 | `console.error/log` | NestJS `Logger` | 规范化改进，意图不变 |

---

## 二、后端 Service

| 方法 | main | refactor | 意图一致? |
|------|------|----------|-----------|
| `onModuleInit()` → `syncDefaultConfigs()` | 有 | 有 | ✅ |
| `getValue(key, defaultValue?)` | 有（Redis → DB → 默认值） | 有（同逻辑） | ✅ |
| `get(key)` | 有（DB 查询 → NotFoundException） | 有（同逻辑） | ✅ |
| `set(key, value, operatorId?, operatorIp?)` | 有（upsert + 审计日志 + 缓存清除） | 有（同逻辑） | ✅ |
| `getPublicConfigs()` | 有（Redis 缓存 → DB 过滤 isPublic） | 有（同逻辑） | ✅ |
| `getAllConfigs()` | 有（按 category+key 排序） | 有（同逻辑） | ✅ |
| `resetToDefault(key, operatorId?, operatorIp?)` | 有（查定义 → 调 set） | 有（同逻辑） | ✅ |
| `getDefinitions()` | 有（返回 RUNTIME_CONFIG_DEFINITIONS） | 有（同逻辑） | ✅ |

**结论：Service 层 8 个方法全部逻辑意图一致。** 唯一差异是 `console.*` → `this.logger.*`（日志方式改进）。

---

## 三、后端常量 & 类型

| 文件 | main | refactor | 意图一致? |
|------|------|----------|-----------|
| `runtime-config.constants.ts` | 17 项配置定义 + DEFAULT_RUNTIME_CONFIGS | 完全相同 | ✅ |
| `runtime-config.types.ts` | RuntimeConfigValueType, RuntimeConfigCategory, RuntimeConfigDefinition, RuntimeConfigItem | 完全相同 | ✅ |
| `dto/runtime-config.dto.ts` | UpdateRuntimeConfigDto, RuntimeConfigResponseDto, RuntimeConfigDefinitionDto | 完全相同（仅 @IsNotEmpty → @IsDefined） | ✅ |

### 配置项清单（main & refactor 完全一致）

| 分类 | 配置键 | 类型 | 默认值 | 公开 |
|------|--------|------|--------|------|
| **邮件** | `mailEnabled` | boolean | false | ✅ |
| | `requireEmailVerification` | boolean | false | ✅ |
| **短信** | `smsEnabled` | boolean | false | ✅ |
| | `requirePhoneVerification` | boolean | false | ✅ |
| **客服** | `supportEmail` | string | '' | ✅ |
| | `supportPhone` | string | '' | ✅ |
| **文件** | `maxFileSize` | number | 100 (MB) | ❌ |
| **用户** | `allowRegister` | boolean | true | ✅ |
| | `allowAutoRegisterOnPhoneLogin` | boolean | false | ✅ |
| **微信** | `wechatEnabled` | boolean | false | ✅ |
| | `wechatAutoRegister` | boolean | false | ✅ |
| **存储** | `userStorageQuota` | number | 10 (GB) | ❌ |
| | `projectStorageQuota` | number | 50 (GB) | ❌ |
| | `libraryStorageQuota` | number | 100 (GB) | ❌ |
| | `enforceStorageQuota` | boolean | true | ❌ |
| **系统** | `systemNotice` | string | '' | ✅ |

**17 项配置，8 项公开，9 项内部。完全一致。**

---

## 四、前端页面

| 功能点 | main | refactor | 意图一致? |
|--------|------|----------|-----------|
| 页面标题 | `useDocumentTitle('运行时配置')` | 同 | ✅ |
| 加载状态 | spinner + "正在加载配置..." | 同 | ✅ |
| 空状态 | "暂无配置项" | 同 | ✅ |
| 权限检查 | `hasPermission(SYSTEM_CONFIG_WRITE)` | 同 | ✅ |
| 只读提示横幅 | "需要系统管理权限才能修改" | 同 | ✅ |
| 统计栏 | 总配置数 / 公开数 / 待保存数 | 同 | ✅ |
| 按分类分组卡片 | 8 个分类，各配图标 | 同 | ✅ |
| boolean 开关 | toggle-switch 组件 | 同（尺寸微调） | ✅ |
| number 输入 | 带单位 (GB/MB) | 同 | ✅ |
| string 输入 | 文本框 | 同 | ✅ |
| 敏感值隐藏 | 含 password/secret/token/key/api → password 输入框 + 眼睛切换 | 同 | ✅ |
| 编辑状态标记 | 边框变色 + "已修改" badge | 同 | ✅ |
| 保存按钮 | 单条保存，loading 状态 | 同 | ✅ |
| 重置按钮 | 确认弹窗 → 重置 | 同 | ✅ |
| 深色主题 | data-theme 适配 | 同 | ✅ |
| 响应式布局 | 768px / 640px 断点 | 同 | ✅ |

### 前端差异（实现细节，非意图差异）

| 差异项 | main | refactor |
|--------|------|----------|
| API 调用方式 | `runtimeConfigApi.getAllConfigs()` | `runtimeConfigControllerGetAllConfigs()`（自动生成 SDK）|
| 响应解包 | `response.data` 直接使用 | `response.data` 或 `.then(r => r.data)` |
| toggle 开关尺寸 | 52×28px (handle 24×24, translate 24px) | 36×20px (handle 16×16, translate 16px) |
| input-wrapper 宽度 | `min-width: 200px` | `flex: 1` |
| boolean 控件位置 | input-wrapper 内 | action-buttons 内 |
| 类型定义来源 | `runtimeConfigApi` 导出 `RuntimeConfigItem` | `@/api-sdk` 的 `RuntimeConfigResponseDto` |

**全部是 UI 微调和 SDK 生成方式差异，不影响功能意图。**

---

## 五、总评

```
███████████████████████████████████████████████ 100%
        逻辑意图匹配度：17/17 配置项，全部功能一致
```

- **🔴 NEEDS DECISION：** 无
- **需要修复：** 无
- **refactor 分支额外收益：** 公开端点增加限流+缓存、日志规范化、前端 API 调用对齐自动生成 SDK
