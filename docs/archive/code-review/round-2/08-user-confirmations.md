
# Round 1 审查 — 需要用户确认问题汇总

> 汇总日期：2026-05-08
> 数据来源：`docs/code-review/round-1/` 下全部 16 份审查报告
> 汇总范围：所有标记为"需要用户确认"、"需用户确认"或类似标记的问题

---

## 统计概览

| 主题分组 | 问题数量 |
|----------|----------|
| CAD 引擎（mxcad-app 黑盒） | 11 |
| API 设计 | 12 |
| 架构决策 | 13 |
| 业务逻辑 | 12 |
| 安全策略 | 9 |
| 数据库与缓存 | 5 |
| 构建与部署 | 8 |
| 可访问性 | 2 |
| 代码重复清理 | 6 |
| 测试策略 | 5 |
| **合计** | **83** |

---

## 一、CAD 引擎（mxcad-app 黑盒行为）

以下问题由于 mxcad-app 是第三方黑盒，审查者无法从代码层面确认实际行为，需要与 mxcad-app 提供方或团队确认。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| CAD-01 | 11-cad-integration §1.2.2 | `import "mxcad-app/style"` 顶层静态导入是否与预加载设计意图一致 | 预加载注释说"不要手动 import style"，但 index.ts:55 却静态导入了样式 | 是否存在样式冲突风险；是否应改为动态导入 |
| CAD-02 | 11-cad-integration §2.2.1 | WebGL 上下文丢失检测是否需要自行添加 | 不确定 mxcad-app 内部是否已处理 `webglcontextlost` 事件 | 避免重复监听或遗漏保护 |
| CAD-03 | 11-cad-integration §3.2.1 | 样式预加载矛盾（同 CAD-01） | 同一个问题，不同角度 | 同上 |
| CAD-04 | 11-cad-integration §3.2.2 | mxcad-app 初始化失败的已知失败模式 | 需要设计降级方案，但不知道 mxcad-app 有哪些典型失败场景 | 网络失败 / WASM不支持 / 版本不兼容 的区分 |
| CAD-05 | 11-cad-integration §3.2.3 | mxcad-app 内部是否有初始化超时机制 | `setupInitializationListener` 没有超时保护；需要知道 `mxcadApplicationCreatedMxCADObject` 事件何时不会触发 | 是否需要自行添加 30s 超时保护 |
| CAD-06 | 11-cad-integration §4.2.3 | 深色主题 CSS 是否充分保护了 mxcad-app 内部 UI | 当前 CSS 只保护了 `[role="dialog"]`，下拉菜单/tooltip/popover 可能被覆盖 | mxcad-app 是否有自己的深色主题机制 |
| CAD-07 | 11-cad-integration §6.2.1 | MxCADView 实例永不销毁的设计意图 | 注释说"永远不要清空全局容器"，但会导致 WebGL 上下文永不释放 | 是否为产品需求（快速恢复编辑）；mxcad-app 是否支持销毁与重建 |
| CAD-08 | 11-cad-integration §6.2.2 | 300ms 硬编码延迟的具体目的 | 代码中未注释延迟原因 | 是否可替换为 `requestAnimationFrame` 或事件驱动 |
| CAD-09 | 11-cad-integration §6.2.3 | 60 秒文件打开超时是否足够 | 大 DWG 文件（几百 MB）转换可能需要更长时间 | 实际文件大小范围；mxcad-app `openWebFile` 是否支持进度回调 |
| CAD-10 | 11-cad-integration §7.2.3 | mxcad-app `openWebFile` 可能抛出的错误类型 | 当前只对 `mxdrawObject` 错误重试，但可能有其他可重试错误 | 扩展重试覆盖范围 |
| CAD-11 | 06-frontend-performance §5.1 | CAD 哈希计算/缩略图生成移至 Web Worker | mxcad-app SDK（C++/WASM）是否支持在 Worker 中运行 | WASM 模块的线程安全性；OffscreenCanvas 支持 |

---

## 二、API 设计

涉及路由变更、响应格式统一、接口废弃等需要前后端协调的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| API-01 | 03-api-design 问题1 | 多处 `@Res()` 绕过全局响应拦截器，格式不统一 | MxCAD-App 客户端可能依赖当前响应格式（如 `{code: -1}` 而非标准格式） | 涉及 MxCAD、缩略图、Session 等多个模块的响应格式变更 |
| API-02 | 03-api-design 问题2 | 两个缓存监控控制器功能重叠，需要合并 | 两个 Controller 路由前缀和端点都不一致 | 合并为 `/api/v1/cache` 还是保留两个路由 |
| API-03 | 03-api-design 问题6 | 角色管理路由层级扁平化 | 当前 `/roles/project-roles/*` 不够 RESTful | 标准 REST 设计为 `/project-roles/*` 和 `/projects/:id/roles` |
| API-04 | 03-api-design 问题7 | 版本控制端点未嵌套在项目资源下 | 当前 `/version-control/history?projectId=...&filePath=...` 通过 Query 传递所有参数 | 改为 `/projects/:id/files/:path/history` |
| API-05 | 03-api-design 问题8 | 字体管理 Controller 路由命名为 `font-management` | 其他 Controller 使用 kebab-case 资源名（`roles`、`users`） | 改为 `fonts` 是否更统一 |
| API-06 | 03-api-design 问题9 | Session 控制器是否仍在活跃使用 | 全部标记 `@Public()`，响应格式独立 | 如果已废弃，应标记 `@deprecated` |
| API-07 | 03-api-design 问题10 | 用户搜索端点合并 | `search/by-email` 和 `search` 功能重叠 | 合并为 `GET /users?search=...&field=email` |
| API-08 | 03-api-design 问题11 | 权限分配的 DELETE 方法使用 `@Body()` | DELETE 通常不使用请求体 | 考虑 `PATCH` + `{add, remove}` 或 `DELETE :id/permissions/:name` |
| API-09 | 03-api-design 问题14 | fonts.controller.ts 响应被双重包装 | Controller 手动构造了与拦截器相同格式的对象 | 前端可能已适配双重嵌套的 `data` |
| API-10 | 03-api-design 问题18 | deleteNode 端点同时接受 Body 和 Query 参数传递 `permanently` 标志 | 同一参数两个渠道，可能不一致 | 统一使用 Query 参数 |
| API-11 | 05-error-handling 问题1 | MxCadException 默认 HTTP 200 | MxCAD App 客户端可能依赖 HTTP 200 + `ret` 字段判断错误 | 改为 400/500 等标准状态码 |
| API-12 | 05-error-handling 问题3 | MxCadController 手动响应绕过全局 ExceptionFilter | 10+ 个方法使用 `@Res()` 返回 `{code: -1}` | 需要与前端协调响应格式变更 |

---

## 三、架构决策

涉及技术选型、工具链、架构层面需要团队达成共识的决策。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| ARC-01 | 12-monorepo-build §3.1 | ESLint 自定义规则与 Biome 冲突 — 选择 lint 工具 | 自定义规则 `no-prisma-enum-in-api-property` 在 Biome 下不生效 | Biome vs ESLint 的取舍；是否需要保留此自定义规则 |
| ARC-02 | 12-monorepo-build §4.1 | 缺少 ESLint 配置文件 | 根 lint 脚本无法正常工作 | 创建 flat config 还是恢复 eslintrc |
| ARC-03 | 09-typescript-safety §1.2 | 后端 tsconfig 关闭了 7 个 strict 选项 | 后端关闭了 `strictNullChecks`、`noImplicitAny` 等关键检查 | 是否有意愿在未来开启 strict 模式 |
| ARC-04 | 09-typescript-safety §3.2 | Swagger 类型生成脚本中 body 类型误生成为 `never` | Profile hooks 中 14 处 `@ts-expect-error` 的根源 | 修复 `generate-api-types.js` 还是修复后端 DTO 的 Swagger 装饰器 |
| ARC-05 | 09-typescript-safety §6.1.3 | API 响应包装类型不匹配 — 前端 `as unknown as` 泛滥 | openapi-client-axios 生成的类型是内层数据，但 ResponseInterceptor 包装后结构不同 | 定义 `UnwrapApiResponse<T>` 工具类型或修复生成脚本 |
| ARC-06 | 16-async-concurrency 问题2 | ConcurrencyManager 是内存锁而非分布式锁 | 文档注释声称提供分布式锁，实际只在单进程内有效 | 多实例部署时需要 Redis 分布式锁 |
| ARC-07 | 16-async-concurrency 问题7 | 缓存事件风暴风险 | PermissionCacheService 的 Pub/Sub 模式可能触发缓存雪崩 | 缓存架构变更：去重 ID / 精确失效 / Keyspace Notifications |
| ARC-08 | 07-database-schema §7.3 | 缓存穿透保护未实现空值缓存 | `penetrationConfig` 定义了但未实际使用 | 是否需要实现布隆过滤器或空值缓存 |
| ARC-09 | 06-frontend-performance §2.1 | 引入虚拟滚动库 | 文件列表直接 `.map()` 渲染，无虚拟滚动 | 选择 `@tanstack/react-virtual` 还是 `react-window` |
| ARC-10 | 06-frontend-performance §7.3 | 替换 recharts 图表库 | recharts 全量导入体积大 | 是否可以用更轻量的方案 |
| ARC-11 | 06-frontend-performance §1.5 | CADEditorDirect 组件拆分方案 | 1332 行巨型组件需要拆分，但需理解业务边界 | 拆分后的 hook 命名和职责划分 |
| ARC-12 | 06-frontend-performance §4.3 | 后端提供多尺寸缩略图 API | 列表视图浪费带宽下载大尺寸缩略图 | small/medium/large 多尺寸 |
| ARC-13 | 06-frontend-performance §4.3 | 后端缩略图服务支持 WebP 格式 | CAD 缩略图通常 50-200KB，WebP 可减少 40-60% | 后端缩略图生成管线改造 |

---

## 四、业务逻辑

涉及核心业务流程、数据一致性、产品行为需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| BUS-01 | 16-async-concurrency 问题1 | 文件名唯一性检查 TOCTOU 竞态 — 需要数据库唯一索引 | 需创建 `parentId + name + deletedAt` 组合唯一索引 | 涉及 schema 变更，需评估现有数据是否满足唯一约束 |
| BUS-02 | 16-async-concurrency 问题5 | 批量恢复/删除无事务保护 — API 语义需明确 | 中途失败后已处理项无法回滚 | 是否需要严格的原子性，还是允许部分成功 |
| BUS-03 | 14-svn-version-control §2.2 | SVN 删除与数据库删除缺乏事务性保证 | 数据库删除成功但 SVN 删除失败时状态不一致 | 补偿事务 or 先 SVN 后数据库 or 标记"待清理"状态 |
| BUS-04 | 14-svn-version-control §2.3 | `rollbackToRevision` 存在功能性 Bug | 代码中将 `String(revision)` 传给了 username 参数，revision 未实际使用 | 修复逻辑：`svn update -r <revision>` + `svn commit` |
| BUS-05 | 14-svn-version-control §2.5 | Controller 接收 projectId 但 Service 未校验 filePath 关联 | 用户可能通过传入任意 projectId 绕过权限检查 | 需确认 `@RequireProjectPermission` 守卫是否已校验关联 |
| BUS-06 | 14-svn-version-control §4.2 | commitNodeDirectory 逐层提交产生大量 SVN 版本 | 深层目录创建时每层一个 commit，版本历史冗长 | 是否可改为 `svn add --parents` 一次性提交 |
| BUS-07 | 14-svn-version-control §5.3 | 提交时未校验文件锁状态 | 用户 B 可绕过前端锁直接上传覆盖文件 | 在 `commitNodeDirectory` 中添加锁状态检查 |
| BUS-08 | 14-svn-version-control §7.1 | 永久删除的步骤顺序存在数据丢失风险 | 当前顺序：数据库→物理文件→SVN，中间崩溃则不可恢复 | 先物理文件→再数据库→最后 SVN |
| BUS-09 | 14-svn-version-control §7.2 | SVN 提交失败无 revert 回滚 | 已 `svn add` 但 commit 失败的文件处于"已添加但未提交"状态 | 需要新增 `svn revert` 功能 |
| BUS-10 | 14-svn-version-control §7.3 | checkout 到非空目录可能冲突 | 没有使用 `--force` 参数 | 是否需要 `--force` 参数 |
| BUS-11 | 14-svn-version-control §7.4 | copyNode 复制后的物理文件路径与数据库不一致 | path 字段可能指向错误位置，且未同步到 SVN | 确保 path 反映真实物理路径 |
| BUS-12 | 05-error-handling 问题2 | UploadError 继承 Error 而非 HttpException | 导致全局 ExceptionFilter 无法识别 | 需要确认 `UploadError` 的抛出点和捕获点 |

---

## 五、安全策略

涉及认证、授权、数据保护等安全决策需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| SEC-01 | 01-backend-security §1.1 | Session 创建端点为公开 API，可伪造任意用户身份 | 需要确认是否为调试用途遗留代码 | 应立即删除或添加认证 |
| SEC-02 | 01-backend-security §1.2 | Session 认证绕过 JWT 验证 | 需确认 Session 中的 `userRole` 是否在登录时正确设置且不可篡改 | Session 安全性全面审查 |
| SEC-03 | 01-backend-security §1.4 | CSRF Token 仅做长度校验未验证内容 | 需确认 CSRF Token 的完整生命周期是否已在 Controller 层单独实现 | Redis 存储的"存-验"机制 |
| SEC-04 | 01-backend-security §1.5 | `@RequireProjectPermission` Guard 从多处提取 nodeId 可能被操纵 | 需确认 Controller 层使用的 nodeId 来源是否与 Guard 一致 | params vs body vs query 优先级 |
| SEC-05 | 01-backend-security §1.6 | 搜索接口无权限控制 | 需确认 SearchService 内部是否已按用户权限过滤结果 | 如果未过滤，需添加权限要求 |
| SEC-06 | 01-backend-security §2.4 | SVN 操作通过外部包执行，需确认命令注入防护 | 需确认 `@cloudcad/svn-version-tool` 内部是否使用 `spawn` 数组形式 | 审查外部包源码 |
| SEC-07 | 01-backend-security §3.1 | 配置文件中多个硬编码默认密钥 | 需确认生产部署是否确保 `JWT_SECRET`、`DB_PASSWORD`、`SESSION_SECRET` 已正确设置 | 强制要求环境变量，移除硬编码 fallback |
| SEC-08 | 01-backend-security §7.2 | SMS IP 采集依赖 `x-forwarded-for` 头 | 需确认生产环境反向代理是否过滤/覆盖此头 | 防止客户端伪造 IP |
| SEC-09 | 02-frontend-security §2.2 | 用户对象（含角色/权限信息）存储在 localStorage | 涉及认证信息持久化策略 | 是否仅缓存 ID 和显示名称，权限检查始终从后端获取 |

---

## 六、数据库与缓存

涉及数据库 schema 变更、缓存策略等需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| DB-01 | 07-database-schema §1.1 | `CacheEntry` 表是否仍在使用 | 项目已实现 Redis 三级缓存，此表可能处于闲置状态 | 如果不用则删除 |
| DB-02 | 07-database-schema §1.2 | `Asset` 和 `Font` 表缺少 `deletedAt` 字段 | 与其他表的软删除机制不一致 | 统一使用 `deletedAt` 还是仅 `status` 字段 |
| DB-03 | 07-database-schema §1.4 | `UploadSession` 表缺少外键和索引 | `status` 使用 String 而非枚举 | 添加外键 or 改为枚举 |
| DB-04 | 07-database-schema §1.5 | `RuntimeConfig` 表缺少操作者外键 | 审计日志类字段可能指向已删除用户 | 是否添加外键（可能需要 `ON DELETE SET NULL`） |
| DB-05 | 07-database-schema §1.7 | `PROJECT_CREATE` 被放在系统权限枚举中 | 它是项目级别的操作权限 | 移到 `ProjectPermission` 还是保持在 `Permission` |

---

## 七、构建与部署

涉及 CI/CD、Docker、monorepo 配置等需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| BLD-01 | 12-monorepo-build §1.1 | 无效依赖 `"2": "3.0.0"` | 无效 npm 包名，可能是编辑错误 | 确认来源和用途后删除 |
| BLD-02 | 12-monorepo-build §1.2 | `config-service` 和 `server-tasks` 缺少 package.json | `pnpm install` 会报错 | 修复 package.json 还是修改 workspace 配置 |
| BLD-03 | 12-monorepo-build §5.1 | CI 两个工作流重复触发 | 相同触发条件导致 CI 时间翻倍 | 合并为一个工作流 |
| BLD-04 | 12-monorepo-build §5.3 | 权限测试可能重复运行 | `test:ci` 已包含所有测试，但 test.yml 又单独运行权限测试 | 确认 Jest 配置覆盖范围 |
| BLD-05 | 12-monorepo-build §6.2 | COOPERATE_PORT 端口映射错误 | 默认值 3000 与实际协同服务端口 3091 不符 | 确认实际端口 |
| BLD-06 | 12-monorepo-build §6.4 | PostgreSQL 端口暴露到主机 | 生产环境通常不需要外部访问数据库 | 是否需要从主机直接访问数据库 |
| BLD-07 | 12-monorepo-build §7.1 | `effect` 包是否为孤立依赖 | 所有子包均未引用此包 | 确认用途后决定保留或移除 |
| BLD-08 | 12-monorepo-build §8.1 | `.env.bak` 文件可能未被 gitignore 忽略 | 可能包含真实凭据且已被提交 | 检查 git 追踪状态并移除 |

---

## 八、可访问性

涉及 i18n 和 a11y 需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| A11Y-01 | 15-i18n-a11y §1 | 国际化基础设施完全缺失 | 需要团队确定 i18n 技术选型（i18next / react-intl）、目标语言列表、翻译流程 | 影响范围极大，需架构决策 |
| A11Y-02 | 15-i18n-a11y §9 | CAD 编辑器 Canvas 无障碍标记 | CAD 引擎由第三方 `mxcad-app` 控制 | 可能需要与厂商协调添加 `aria-label` 和 `role` |

---

## 九、代码重复清理

涉及需要文件删除、架构调整的代码重复问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| DUP-01 | 13-code-duplication §1.1 | `permission.util.ts` 与 `permission.utils.ts` 完全重复 | 删除其中一个文件 | 保留 `permission.utils.ts`（有外部引用） |
| DUP-02 | 13-code-duplication §1.2 | `validation.decorator.ts` 与 `validation.decorators.ts` 完全重复 | 删除其中一个文件 | 保留 `validation.decorators.ts` |
| DUP-03 | 13-code-duplication §1.3 | 两个 `NodeUtils` 类大量功能重叠 | 涉及架构调整，合并为共享类 | 保留 `common/utils/node-utils.ts`，`file-system/utils/` 版本改为引用 |
| DUP-04 | 13-code-duplication §3.1 | `file-validation.service.ts` 双份 | 确认保留哪个版本 | 统一使用 `file-system/file-validation/` 子目录版本 |
| DUP-05 | 13-code-duplication §3.2 | `file-download-export.service.ts` 双份 | 确认保留哪个版本 | 与服务目录结构重构一并处理 |
| DUP-06 | 14-svn-version-control §2.1 | VersionControlService 与 SvnVersionControlProvider 大量代码重复 | 大范围重构，需评估所有依赖方 | Service 代理到 Provider 还是废弃 Service |

---

## 十、测试策略

涉及测试覆盖率、测试架构需要确认的问题。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| TST-01 | 10-test-quality 问题1 | 大量核心 service 缺乏单元测试，需排定优先级 | 涉及资源分配和工作量估算 | P0: role-inheritance、permission-cache；P1: storage-manager、file-lock |
| TST-02 | 10-test-quality 问题2 | conversion 模块完全无测试，需确认测试策略 | conversion 涉及子进程调用，需明确 mock 策略 | 单元测试 vs 集成测试的边界 |
| TST-03 | 10-test-quality 问题4 | Controller 层少测试 — 单元测试 vs E2E 测试 | 21 个 controller 仅 3 个有测试 | 选择单元测试还是 E2E 覆盖 |
| TST-04 | 10-test-quality 问题7 | 后端全局覆盖率阈值设置为 0 | 需确认阈值数值 | 建议 branches ≥ 50% |
| TST-05 | 10-test-quality 问题8 | 前端 vitest 配置缺少覆盖率阈值 | 需确认前端阈值数值 | 建议 lines ≥ 40% |

---

## 十一、其他

不适合归入以上分类的确认项。

| 编号 | 来源报告 | 问题简述 | 为什么需要确认 | 建议关注点 |
|------|----------|----------|---------------|-----------|
| OTH-01 | 08-nestjs-di §DI-002 | `InitializationService` 在 AuthModule 和 CommonModule 双注册 | 需确认是故意设计还是疏忽 | 如果应为单例，从 AuthModule.providers 移除 |
| OTH-02 | 08-nestjs-di §DI-004 | `FileSystemPermissionService` / `FileDownloadExportService` 疑似重复 | 存在两个路径的相同文件 | 确认哪个是主版本 |
| OTH-03 | 04-frontend-architecture 问题3/4 | FileSystemContent.tsx 重复 — 保留哪个版本 | `components/file-system-manager/` vs `pages/FileSystemManager/` | 确认实际使用的版本后删除冗余 |
| OTH-04 | 04-frontend-architecture 问题6 | notificationStore 和 uiStore.toasts 功能重叠 | 涉及 UI 交互变更 | 统一为一种 Toast 系统 |
| OTH-05 | 05-error-handling 问题7 | 生产环境缺少全局 unhandledRejection 处理器 | 是否需要 `process.exit(1)` 取决于运维策略 | PM2/Docker 是否会自动重启 |
| OTH-06 | 05-error-handling 问题8 | 登录日志可能暴露用户账号信息（PII） | 取决于隐私合规需求 | 脱敏处理：`ab***@example.com` |
| OTH-07 | 07-database-schema §2.1 | 空基线迁移文件 | 确认是否需要保留 | 全新部署时枚举类型是否正常创建 |
| OTH-08 | 07-database-schema §2.2/2.3 | 迁移文件中废弃枚举值未能实际删除 | PostgreSQL 不支持直接删除枚举值 | 需要通过重建枚举类型的标准流程清理 |
| OTH-09 | 07-database-schema §4.1 | 已软删除用户仍可登录操作 | 涉及安全策略 | 在所有 User 查询中添加 `deletedAt: null` |
| OTH-10 | 07-database-schema §4.3 | Asset/Font 通过 status 实现删除 | 与其他表 `deletedAt` 机制不一致 | 统一为 `deletedAt` 还是保持 status |
| OTH-11 | 07-database-schema §5.1/5.2 | DTO 中使用 Prisma 枚举违反项目规则 | 涉及 API 契约变更 | 创建独立 API 枚举，Service 层转换 |
| OTH-12 | 16-async-concurrency 问题18 | 配额缓存无跨实例一致性 | 多实例部署下各实例缓存可能不一致 | 迁移到 Redis |

---

## 用户决策记录模板

以下模板供用户在审阅问题后填写决策结果。建议以 ✅ 同意 / ❌ 拒绝 / 🔄 需讨论 / ⏸️ 暂缓 标记每个问题。

```markdown
## 用户决策记录

### CAD-01: `import "mxcad-app/style"` 顶层导入
- **决策**: [ ] ✅ 同意改为动态导入  [ ] ❌ 保持现状  [ ] 🔄 需讨论
- **理由**: 
- **负责人**: 
- **截止日期**: 

### CAD-02: WebGL 上下文丢失检测
- **决策**: [ ] ✅ 添加检测  [ ] ❌ mxcad-app 已内部处理  [ ] 🔄 需确认
- **理由**: 
- **负责人**: 
- **截止日期**: 

<!-- ... 请为每个问题添加决策记录 ... -->

### 全局决策
- **是否需要建立 mxcad-app 黑盒文档**: [ ] 是  [ ] 否
- **i18n 实施时间线**: [ ] Q3 2026  [ ] Q4 2026  [ ] 2027+
- **后端 Strict 模式开启计划**: [ ] 逐步开启  [ ] 保持现状  [ ] 待评估
- **Lint 工具统一**: [ ] 全面转向 Biome  [ ] 全面转向 ESLint  [ ] 双轨并行
```

---

> **使用说明**: 建议团队在 round-2 启动会上逐项过一遍本清单，为每个问题标记决策，然后按优先级排入后续迭代。
