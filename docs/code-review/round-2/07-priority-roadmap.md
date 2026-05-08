# CloudCAD Round-1 代码审查 — 修复优先级路线图

> **生成日期**: 2026-05-08
> **数据来源**: round-1 全部 16 份审查报告
> **审查范围**: packages/backend + packages/frontend + packages/svnVersionTool + 构建配置
> **总发现问题数**: 约 312 个（严重/高 99 个，中 141 个，低 72 个）

---

## 一、全局 P0（严重+高）问题汇总

基于安全性 > 数据完整性 > 功能正确性 > 性能 > 代码质量 > 可维护性的排序维度，以下汇总所有 🔴严重 和 🔴高 级别问题。

### 1.1 按来源报告统计

| 报告编号 | 报告名称 | 严重 | 高 | 主要风险类别 |
|----------|---------|------|-----|-------------|
| 01 | 后端安全 | 2 | 3 | Session 公开端点、硬编码密钥、Tus fallback 密钥、Session 绕过 JWT |
| 02 | 前端安全 | 7 | 0 | innerHTML XSS(3)、localStorage Token(2)、GEMINI_API_KEY 泄漏、缺少 CSP |
| 03 | API 设计 | 0 | 3 | @Res() 绕过拦截器、空控制器、双缓存控制器 |
| 04 | 前端架构 | 2 | 2 | 巨型组件、模块级副作用、直接 API 调用 |
| 05 | 错误处理 | 0 | 3 | MxCadException 默认 200、UploadError 继承链、Prisma 异常缺失 |
| 06 | 前端性能 | 0 | 2 | FileItem 未 memo、缺虚拟滚动 |
| 07 | 数据库 | 0 | 5 | RefreshToken 缺外键、User 软删除查询、Redis KEYS 命令、连接池未生效 |
| 08 | NestJS DI | 0 | 0 | _(中 5 项，低 5 项)_ |
| 09 | TypeScript 安全 | 42 | 0 | 后端 strict 全面关闭、Promise\<any\> 泛滥、`as unknown as` 滥用 |
| 10 | 测试质量 | 0 | 2 | common/services 缺测试、conversion 零测试 |
| 11 | CAD 集成 | 0 | 1 | ErrorHandler 空壳静默丢弃所有错误 |
| 12 | Monorepo 构建 | 0 | 8 | 无效依赖、空 package.json、TS 版本不一致、CI 重复、Docker 逻辑错误 等 |
| 13 | 代码重复 | 5 | 0 | 5 对完全相同的重复文件 |
| 14 | SVN 版本控制 | 5 | 0 | 命令注入(命令级)、密码明文、删除顺序、提交无回滚 |
| 15 | i18n/A11y | 0 | 12 | 无 i18n 框架、Modal 缺 ARIA、键盘导航缺失 等 |
| 16 | 并发异步 | 4 | 4 | TOCTOU 竞态、非分布式锁、Token 原子性、clearTrash 事务 |

### 1.2 严重+高 问题去重合并

| 类别 | 问题数 | 说明 |
|------|--------|------|
| **安全漏洞** | 15 | 含认证绕过、XSS、密钥泄露、命令注入、权限缺失 |
| **数据完整性** | 9 | 含 TOCTOU 竞态、事务缺失、删除顺序、Token 原子性 |
| **功能正确性** | 29 | 含异常处理、API 响应格式、类型安全、Bug |
| **性能** | 6 | 缺虚拟滚动、React.memo、KEYS 命令、缓存击穿 |
| **代码质量** | 27 | 含重复文件、tsconfig 关闭 strict、构建配置 |
| **可维护性** | 13 | 含巨型组件、i18n、A11y、测试缺失 |

---

## 二、修复阶段规划

### Phase 1（紧急修复）— 安全漏洞 + 数据丢失风险

**预计总工时**: 18-26 人天 | **建议周期**: Sprint 1-2（1-4 周）

| # | 问题 | 来源报告 | 严重度 | 修复方向 | 工时 | 需确认 | 并行组 |
|---|------|---------|--------|---------|------|--------|--------|
| 1.1 | **删除 `POST /session/create` 公开端点** | 01-后端安全 | 🔴严重 | 移除 `@Public()` 或删除端点 | 0.5d | ✅ | A |
| 1.2 | **移除 `configuration.ts` 硬编码默认密钥** | 01-后端安全 | 🔴严重 | 生产强制环境变量，移除 fallback | 1d | ✅ | A |
| 1.3 | **移除 `file-download-handler.service.ts` 硬编码签名密钥** | 01-后端安全 | 🔴高 | 生产强制 `FILE_DOWNLOAD_SIGN_SECRET` | 0.5d | 否 | A |
| 1.4 | **移除 `tus-auth.middleware.ts` 硬编码 JWT fallback** | 01-后端安全 | 🔴高 | 抛错而非回退到 `'your-secret-key'` | 0.5d | 否 | A |
| 1.5 | **Session 认证绕过 JWT 验证** | 01-后端安全 | 🔴高 | Session 认证增加 DB 用户状态检查 | 1d | ✅ | A |
| 1.6 | **移除下载端点手动 CORS 头** | 01-后端安全 | 🟡中 | 统一使用全局 CORS 配置 | 0.5d | 否 | A |
| 1.7 | **svnVersionTool 命令注入** | 14-SVN | 🔴严重 | `exec`→`spawn`/`execFile` | 3d | ✅ | **B** |
| 1.8 | **svnVersionTool 密码明文通过命令行** | 14-SVN | 🔴严重 | `--password-from-stdin` + 环境变量 | 2d | ✅ | **B** |
| 1.9 | **永久删除顺序导致数据丢失** | 14-SVN | 🔴严重 | 先删物理文件→再删 DB→再删 SVN | 2d | ✅ | **C** |
| 1.10 | **SVN 提交失败无 revert 回滚** | 14-SVN | 🔴严重 | 实现 `svn revert` 命令+自动清理 | 2d | ✅ | **B** |
| 1.11 | **SVN/DB 操作不在同一事务** | 16-并发 | 🔴严重 | 补偿事务或先 SVN 再 DB | 2d | ✅ | B |
| 1.12 | **`storeRefreshToken` 非原子** | 16-并发 | 🔴严重 | `$transaction` 包裹 deleteMany+create | 1d | 否 | A |
| 1.13 | **`clearTrash` 非事务客户端传入** | 16-并发 | 🔴严重 | `$transaction` 包裹整个 clearTrash | 1.5d | 否 | C |
| 1.14 | **文件名唯一性 TOCTOU 竞态** | 16-并发 | 🔴严重 | 唯一性检查合并到创建事务 OR 唯一索引 | 2d | ✅ | C |
| 1.15 | **GEMINI_API_KEY 编译进前端 Bundle** | 02-前端安全 | 🔴严重 | 移除 `define`，改为后端代理 | 1d | 否 | D |
| 1.16 | **innerHTML filename 未转义 XSS** | 02-前端安全 | 🔴严重 | `textContent` 或 DOMPurify | 1d | ✅ | D |
| 1.17 | **accessToken/refreshToken localStorage 明文** | 02-前端安全 | 🔴严重 | httpOnly Cookie（短期 sessionStorage） | 3d | ✅ | D |
| 1.18 | **用户对象含权限信息存 localStorage** | 02-前端安全 | 🔴严重 | 仅内存维护，不持久化权限 | 1.5d | ✅ | D |

**Phase 1 并行分组**：
- **组 A**（后端认证安全）：1.1 ~ 1.6, 1.12 — 集中在 `auth/` + `config/` 模块
- **组 B**（SVN 安全+数据完整性）：1.7, 1.8, 1.10, 1.11 — 集中在 `svnVersionTool/` + `version-control/`
- **组 C**（文件操作数据完整性）：1.9, 1.13, 1.14 — 集中在 `file-operations/` + `file-system/`
- **组 D**（前端安全）：1.15 ~ 1.18 — 集中在 `vite.config.ts` + `AuthContext.tsx` + `mxcadManager/`

> 四组之间无代码冲突，可由 4 名开发者并行修复。

---

### Phase 2（高优先级）— 功能正确性问题

**预计总工时**: 22-32 人天 | **建议周期**: Sprint 3-4（4-6 周）

| # | 问题 | 来源报告 | 严重度 | 修复方向 | 工时 | 并行组 |
|---|------|---------|--------|---------|------|--------|
| 2.1 | **Prisma 异常处理缺失** | 05-错误处理 | 🔴高 | GlobalExceptionFilter 增加 Prisma 错误码映射 | 2d | A |
| 2.2 | **MxCadException 默认 HTTP 200** | 05-错误处理 | 🔴高 | 基类→500，子类按语义设正确码 | 1d | A |
| 2.3 | **UploadError 继承 Error 非 HttpException** | 05-错误处理 | 🔴高 | 重建为 HttpException 子类 | 2d | A |
| 2.4 | **RefreshToken 表缺外键+索引** | 07-数据库 | 🔴高 | 添加 FK + `@@index([userId])` | 1d | B |
| 2.5 | **User 查询缺 `deletedAt: null` 过滤** | 07-数据库 | 🔴高 | 全项目 User 查询补充过滤 | 2d | B |
| 2.6 | **Prisma 连接池配置未生效** | 07-数据库 | 🔴高 | 将 maxConnections 传入 PrismaPg 构造函数 | 0.5d | B |
| 2.7 | **Redis KEYS→SCAN 替换** | 07-数据库 | 🔴高 | 所有 `redis.keys()` 替换为 `SCAN` 游标迭代 | 1.5d | B |
| 2.8 | **mxcadManager ErrorHandler 空壳** | 11-CAD集成 | 🔴高 | 至少添加 `console.error` 输出 | 0.5d | C |
| 2.9 | **DTO 中 Prisma 枚举违规** | 07-数据库 | 🟡中 | 创建 API 枚举与 Prisma 脱钩 | 2d | B |
| 2.10 | **`commitNodeDirectory` 逐层提交** | 14-SVN | 🟡中 | `svn add --parents` 一次性提交 | 1.5d | D |
| 2.11 | **后端 `Promise<any>` 泛滥** | 09-TS安全 | 🔴严重 | 替换为具体类型/`unknown`+收窄 | 5d | A |
| 2.12 | **前端 `as unknown as` 滥用** | 09-TS安全 | 🔴严重 | 修复 Swagger 生成类型+`UnwrapApiResponse<T>` | 3d | C |
| 2.13 | **API 响应包装类型不匹配** | 09-TS安全 | 🔴严重 | 统一解包类型定义 | 2d | A |
| 2.14 | **`@Res()` 手动响应绕过全局拦截器** | 03-API设计 | 🔴高 | 迁移为标准 NestJS 异常抛出 | 3d | A |
| 2.15 | **空控制器 `policy-config.controller.ts`** | 03-API设计 | 🔴高 | 删除或补充实现 | 0.5d | A |
| 2.16 | **双缓存控制器合并** | 03-API设计 | 🔴高 | 合并为单一 `CacheController` | 1d | A |
| 2.17 | **`handleFileRequest` 嵌套 try-catch 丢失语义** | 05-错误处理 | 🟡中 | 外层判断异常类型返回对应状态码 | 0.5d | A |
| 2.18 | **生产环境缺全局兜底处理** | 05-错误处理 | 🟡中 | `main.ts` 添加 unhandledRejection 处理 | 0.5d | A |

**Phase 2 并行分组**：
- **组 A**（后端错误+API+TS）：2.1~2.3, 2.11, 2.13~2.18 — 集中的后端通用层
- **组 B**（数据库+缓存）：2.4~2.7, 2.9 — 集中在 Prisma/Redis 层
- **组 C**（前端 TS+CAD）：2.8, 2.12 — 前端修复
- **组 D**（SVN）：2.10 — SVN 专项

> **注意**: 组 B 依赖 Phase 1 中组 A 的 Prisma 异常处理（2.1）完成后再做数据库 Schema 变更。
> 组 A 的部分工作（2.11 后端 TS）依赖 Phase 1 组 A 完成后的稳定基础。

---

### Phase 3（中优先级）— 性能 + 架构改进

**预计总工时**: 20-28 人天 | **建议周期**: Sprint 5-6（6-8 周）

| # | 问题 | 来源报告 | 严重度 | 修复方向 | 工时 | 并行组 |
|---|------|---------|--------|---------|------|--------|
| 3.1 | **FileItem 添加 React.memo** | 06-前端性能 | 🔴高 | `React.memo` + `useCallback` 稳定引用 | 2d | A |
| 3.2 | **引入虚拟滚动** | 06-前端性能 | 🔴高 | 安装 `@tanstack/react-virtual` | 3d | A |
| 3.3 | **缩略图 loading="lazy"** | 06-前端性能 | 🟠中高 | `<img loading="lazy" decoding="async">` | 0.5d | A |
| 3.4 | **文件哈希移至 Web Worker** | 06-前端性能 | 🟠中高 | spark-md5 在 Worker 中执行 | 2d | A |
| 3.5 | **Layout 时钟独立化** | 06-前端性能 | 🟡中 | `CurrentTime` 独立组件 | 0.5d | A |
| 3.6 | **后端逐步开启 `strictNullChecks`** | 09-TS安全 | 🔴严重 | 分模块逐步开启 | 8d | B |
| 3.7 | **前端 `UnwrapApiResponse<T>` 工具类型** | 09-TS安全 | 🟠高 | 统一 API 响应解包 | 1d | B |
| 3.8 | **`getOrLoad` 缓存击穿保护** | 16-并发 | 🟡中 | singleflight/互斥锁 | 2d | C |
| 3.9 | **`MultiLevelCacheService` 空值缓存** | 16-并发 | 🟡中 | 实现 `__NULL__` 标记缓存 | 1d | C |
| 3.10 | **`PermissionCacheService` 事件风暴** | 16-并发 | 🟠高 | 去重 ID + 精确失效 | 2d | C |
| 3.11 | **`CADEidtorDirect` 组件拆分** | 04-前端架构 | 🔴严重 | 提取 6 个 hook | 5d | A |
| 3.12 | **Profile 组件拆分** | 04-前端架构 | 🟠高 | 提取 4 个 hook | 3d | A |
| 3.13 | **DPI-002 InitializationService 双注册** | 08-NestJS DI | 🟡中 | 确认并消除双实例风险 | 1d | B |
| 3.14 | **后端升级 TypeScript 5.0.4→5.9.3** | 12-Monorepo | 🔴严重 | 版本统一 | 1d | B |

**Phase 3 并行分组**：
- **组 A**（前端性能+架构）：3.1~3.5, 3.11, 3.12
- **组 B**（后端 TS+DI+构建）：3.6, 3.7, 3.13, 3.14
- **组 C**（缓存+并发）：3.8~3.10

> 三组完全独立，无阻塞依赖。

---

### Phase 4（低优先级）— 代码质量 + 文档

**预计总工时**: 15-20 人天 | **建议周期**: Sprint 7-8（8-10 周）

| # | 问题 | 来源报告 | 严重度 | 修复方向 | 工时 | 并行组 |
|---|------|---------|--------|---------|------|--------|
| 4.1 | **删除 `permission.util.ts` 重复文件** | 13-代码重复 | 🔴严重 | 保留 `permission.utils.ts`，删除单数版本 | 0.5d | A |
| 4.2 | **删除 `validation.decorator.ts` 重复** | 13-代码重复 | 🔴严重 | 保留 `validation.decorators.ts` | 0.5d | A |
| 4.3 | **合并两个 `node-utils.ts`** | 13-代码重复 | 🔴严重 | 合并到 `common/utils/` | 2d | A |
| 4.4 | **删除重复 `file-validation.service.ts`** | 13-代码重复 | 🔴严重 | 统一为 `file-validation/` 子目录版本 | 1d | A |
| 4.5 | **删除重复 `file-download-export.service.ts`** | 13-代码重复 | 🔴严重 | 确定规范来源，删除重复 | 1d | A |
| 4.6 | **统一 CAD 文件检测函数** | 13-代码重复 | 🟡中 | 后端引用 `FileExtensionsService` | 1.5d | A |
| 4.7 | **统一文件名验证函数** | 13-代码重复 | 🟡中 | 单一 `FileNameValidator` 工具类 | 1d | A |
| 4.8 | **合并前后端 `formatDate`/`formatFileSize`** | 13-代码重复 | 🟡中 | 分别统一到 `dateUtils.ts`/`fileUtils.ts` | 1d | A |
| 4.9 | **25 处空 catch 块补充日志** | 05-错误处理 | 🟡中 | 标记为 ⚠️ 的补充 logger.warn | 1d | A |
| 4.10 | **补充缺失测试** | 10-测试质量 | 🔴高 | `role-inheritance` + `conversion` 模块 | 5d | B |
| 4.11 | **提升覆盖率阈值** | 10-测试质量 | 🟡中 | 后端 50%+、前端 40%+ | 1d | B |
| 4.12 | **修复 CI 工作流重复** | 12-Monorepo | 🔴严重 | 合并 ci.yml + test.yml | 1d | C |
| 4.13 | **修复 Docker 生产构建逻辑** | 12-Monorepo | 🔴严重 | 简化 `--prod` 优化逻辑 | 1d | C |
| 4.14 | **修复无效依赖 `"2": "3.0.0"`** | 12-Monorepo | 🔴严重 | 删除无效依赖 | 0.5d | C |

**Phase 4 并行分组**：
- **组 A**（代码去重+错误处理）：4.1~4.9
- **组 B**（测试补充）：4.10, 4.11
- **组 C**（CI/CD+Docker）：4.12~4.14

---

### Phase 5（长期规划）— 大规模改造

**预计总工时**: 20-35 人天 | **建议周期**: Sprint 9+（后续版本）

| # | 问题 | 来源报告 | 工时 | 备注 |
|---|------|---------|------|------|
| 5.1 | **后端全面开启 `strictNullChecks`** | 09-TS安全 | 8d | Phase 3 已逐步开启，此阶段完成剩余模块 |
| 5.2 | **引入 i18n 框架** | 15-i18n | 8d | react-i18next + 翻译文件 + 语言检测 |
| 5.3 | **后端国际化** | 15-i18n | 5d | Accept-Language 解析 + 翻译映射 |
| 5.4 | **Modal/ConfirmDialog ARIA 修复** | 15-a11y | 3d | 迁移到 Radix UI Dialog 或手动补全 |
| 5.5 | **键盘导航完善** | 15-a11y | 2d | Escape 处理 + 焦点捕获 |
| 5.6 | **色彩对比度 WCAG AA** | 15-a11y | 1d | muted/tertiary 色值调整 |
| 5.7 | **`mxcadManager/index.ts` 巨型文件拆分** | 04-前端架构 | 3d | 提取 4-5 个子模块 |
| 5.8 | **`VersionControlService` 与 Provider 去重** | 14-SVN | 3d | Service 代理到 Provider |
| 5.9 | **CAD 相关所有需确认项** | 11-CAD | 3d | 与 mxcad-app 厂商协调后修复 |
| 5.10 | **前后端验证规则统一** | 13-代码重复 | 1d | 共享常量文件 |

---

## 三、阻塞依赖关系图

```
Phase 1 ──────────────────────────────────────────────────────────────
  │
  ├─ 组A(认证安全) ─── 无前置依赖 ──────────────────────────────────→ Phase 2 组A
  │                                                                     (后端错误+API)
  ├─ 组B(SVN 安全) ─── 无前置依赖 ──────────────────────────────────→ Phase 2 组D
  │                                                                     (SVN 专项)
  ├─ 组C(文件完整性) ─ 无前置依赖 ──────────────────────────────────→ Phase 2 组B
  │                                                                     (数据库)
  └─ 组D(前端安全) ─── 无前置依赖 ──────────────────────────────────→ Phase 2 组C
                                                                        (前端 TS)

Phase 2 ──────────────────────────────────────────────────────────────
  │
  ├─ 组A ──→ Phase 3 组B (后端 TS strict)    [依赖: 2.1 Prisma异常处理完成]
  ├─ 组B ──→ Phase 3 组C (缓存优化)          [依赖: 2.7 Redis SCAN 完成]
  ├─ 组C ──→ Phase 3 组A (前端性能)          [独立]
  └─ 组D ──→ Phase 4 组A (代码去重)          [依赖: Phase 1 组B SVN 稳定]

Phase 3 ──────────────────────────────────────────────────────────────
  │
  ├─ 组A ──→ Phase 4 组B (测试补充)          [依赖: 3.11 组件拆分稳定]
  ├─ 组B ──→ Phase 5 (strictNullChecks 收尾) [依赖: 3.6 分模块开启]
  └─ 组C ──→ Phase 4 组A (可并行)            [独立]

Phase 4 ──────────────────────────────────────────────────────────────
  │
  └─→ Phase 5 (大规模改造可随时启动，无强制前置依赖)
```

### 关键阻塞路径

1. **Prisma 异常处理 (2.1)** → 阻塞后续所有数据库 Schema 变更（外键、索引等需在有异常处理保护下进行）
2. **后端 TS 基础类型修复 (2.11)** → 阻塞 `strictNullChecks` 逐步开启 (3.6)
3. **CADEditorDirect 拆分 (3.11)** → 阻塞相关测试补充 (4.10)

---

## 四、最大并行化策略

### 4.1 Phase 1 最多 4 人并行

| 开发者 | 负责模块 | 涉及文件范围 | 冲突风险 |
|--------|---------|-------------|---------|
| Dev-A | 后端认证安全 + Token | `auth/`、`config/`、`common/filters/` | 无 |
| Dev-B | SVN 安全 + 回滚 | `svnVersionTool/`、`version-control/` | 无 |
| Dev-C | 文件操作完整性 | `file-operations/`、`file-system/` | 与 Dev-B 可能交叉 `version-control.service.ts` |
| Dev-D | 前端安全 | `vite.config.ts`、`AuthContext.tsx`、`mxcadManager/` | 无 |

### 4.2 Phase 2 最多 4 人并行

| 开发者 | 负责模块 | 备注 |
|--------|---------|------|
| Dev-A | 后端错误+API+TS | 共享 `common/filters/`、`mxcad/exceptions/` |
| Dev-B | 数据库+缓存 | 共享 `prisma/`、`redis/`、`common/services/` |
| Dev-C | 前端 TS 修复 | 共享 `frontend/src/types/`、`api-sdk/` |
| Dev-D | SVN 专项 | 独立 |

### 4.3 前后端完全解耦的阶段

- **Phase 1**: 前端安全(组D) 与 后端安全(组A/B/C) 完全独立
- **Phase 2**: 前端 TS(组C) 与 后端各组独立
- **Phase 3**: 前端性能(组A) 与 后端各组独立
- **Phase 4/5**: 前后端各自独立推进

---

## 五、汇总时间线

```
        Week 1-2    Week 3-4    Week 5-6    Week 7-8    Week 9-10   Week 11+
        ├──────────┼──────────┼──────────┼──────────┼──────────┼──────────
Phase 1 │██████████│          │          │          │          │
        │ 紧急安全  │          │          │          │          │
Phase 2 │          │██████████│██████████│          │          │
        │          │ 功能正确性 │          │          │          │
Phase 3 │          │          │██████████│██████████│          │
        │          │          │ 性能+架构  │          │          │
Phase 4 │          │          │          │██████████│██████████│
        │          │          │          │ 代码质量  │          │
Phase 5 │          │          │          │          │██████████│██████████
        │          │          │          │          │ 大规模改造 │
```

### 预计总工时

| Phase | 人天 | 并行人数 | 日历周 |
|-------|------|---------|--------|
| Phase 1 | 18-26 | 4 | 1-2 周 |
| Phase 2 | 22-32 | 4 | 2-4 周 |
| Phase 3 | 20-28 | 3 | 3-4 周 |
| Phase 4 | 15-20 | 3 | 2-3 周 |
| Phase 5 | 20-35 | 2-3 | 4-8 周 |
| **总计** | **95-141** | — | **12-21 周** |

> **注**: 如投入 4 名开发者全时参与，预计 12-16 周可完成 Phase 1-4。Phase 5 为长期规划，可并行推进。

---

## 六、风险与注意事项

1. **需用户确认的问题共计约 45 项**：在修复前需与团队/安全团队/产品经理确认，部分涉及 API 契约变更或架构决策
2. **mxcad-app 黑盒依赖**：CAD 引擎相关修复（ErrorHandler、Web Worker、WebGL 上下文）受限于 mxcad-app SDK 的能力边界
3. **SVN 命令行重构风险**：`exec`→`spawn` 改造属高风险重构，建议在测试环境充分验证
4. **数据库 Schema 变更**：外键、唯一索引创建需停机维护窗口
5. **TypeScript strict 开启**：后端 `strictNullChecks` 开启涉及大量类型修复，建议分模块渐进式推进

---

*本路线图基于 round-1 全部 16 份审查报告生成，所有问题均未修改代码。建议在每个 Phase 开始前评审本路线图，根据实际情况调整优先级。*
