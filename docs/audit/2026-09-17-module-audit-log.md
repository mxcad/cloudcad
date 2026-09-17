# 模块审查记录（2026-09-17）

目标：逐模块审查前后端与公共包，只修复确实不对的地方，不过度实现。
每个点：先全面理清逻辑 → 修复 → 验证（测试/类型）→ 提交 → push。

审查顺序：公共契约层 → conversion-service → backend mxcad 转换链路 →
backend 核心业务（auth/permission/share/storage/public-file）→ frontend 核心 →
config-service / storage-service / engine-exec。

约定：
- 工作区有并行会话未提交改动（batch-download / conversion / frontend / 移动端认证等），
  一律不碰、不提交他人文件；提交用显式路径。
- 每个修复点单独一节：现象 → 根因 → 修复 → 验证证据 → 提交号。
- 需要决策的点：决策 + 理由 + 备选方案，记录在本文件。

---

## 1. @cloudcad/contracts（契约层）

### 1.1 buildEngineParams 字符串字段空值语义回归（已修复）

**现象**：`buildEngineParams`（mxcad 两级参数契约的唯一翻译点，ADR-0064/0069）对
6 个字符串字段（`layout_name` / `bd_pt1_x` / `bd_pt1_y` / `bd_pt2_x` / `bd_pt2_y` /
`open_file_md5`）用 `!== undefined` 判定，会把调用方显式传入的空字符串 `''` 转发给引擎。

**根因**：7931287 之前的旧代码两侧判定不一致——
- backend 进程内 param：这 6 个字段全部 truthy（`if (options.bd_pt1_x)`），`''` 被省略；
- conversion-service 旧 `_buildParam`：`layout_name` truthy，`bd_pt*`/`open_file_md5` 用 `!== undefined`。

df252a4 收敛成单一契约时把 6 个字段**统一**成 `!== undefined`，等于同时改了 backend
（layout_name/bd_pt*/open_file_md5 从 truthy→非undefined）和 runner（layout_name 从
truthy→非undefined）两侧行为，且契约注释给的统一理由「0 是合法角度、false 是合法的
create_clip_block」**只适用于数值/布尔字段，对字符串不成立**。

**为何是缺陷**：`''` 不是这些字段的合法值（空布局名/空坐标/空 MD5 无意义），而引擎是
黑盒且对字段「有无」敏感（缺区域字段时 cut_dwg/print_to_pdf 静默回 `{"message":"false"}`）。
前端把 CAD 引擎回调的 `box.param`/`params` 原样 spread 进请求（initMxCAD.ts），空字符串
场景真实可达。转发 `''` 会让引擎按「有值但为空」处理，print_to_pdf 可能从「整页成功」
退化成失败——这是重构引入的静默行为变化，非既有行为。

**决策**：按「字段值的合法域」分三类判定，恢复重构前 backend 的既有安全行为：
- 字符串字段（outname/cmd/colorPolicy/outjpg/layout_name/bd_pt*/open_file_md5）→ truthy（省略 `''`）；
- 数值字段（roate_angle/view_angle/dwgVersion）→ `!== undefined`（0 是合法角度/版本）；
- 布尔字段（create_clip_block）→ `!== undefined`（false 是合法值）。

**不改动项（已评估）**：
- `deriveContentKey`（conversion-service/lib/utils.ts）仍用 `!== undefined` 收集字段：
  与 buildEngineParams 的 `''` 省略不一致只会导致「同产物不同 key」的**漏去重**（效率问题），
  不会造成错误合并（`''` 与缺失的 key 不同，两个任务不会被误并），故不动，避免扩大改动面。
- engine-exec 只是低层 spawn 封装（接收已序列化的 paramStr），不参与参数构造，无消费方遗漏。

**修复**：`packages/contracts/src/conversion/mxcad-engine-contract.ts` 6 行判定改回 truthy
+ 注释改为按合法域分三类的准确说明。

**验证**：
- `pnpm --filter @cloudcad/contracts build` 重建 dist（dist 是 gitignore，消费方按需重建）；
- 新增 `packages/conversion-service/test/runner.test.ts` 用例「空字符串字符串字段省略、
  0/数值/false 保留」锁定新行为；
- conversion-service `pnpm test` 132/132 全绿（含新增用例）；
- contracts `scan:purity` + `type-check` 通过。

**提交**：ade2be6（已 push）。

---

## 2. backend mxcad conversion 链路

### 2.1 buildAccessFilter 个人空间文件被整体漏掉（已修复）

**现象**：`UnifiedConversionService.buildAccessFilter`（listTasks / retryTask 的跨用户
访问过滤）只匹配 `nodeType=PROJECT` 容器，个人空间下的文件（`projectId`→PERSONAL_SPACE
根）不在过滤范围内——其进行中/失败的转换任务不进转换面板，retryTask 报「任务不存在或无权」。

**根因**：文件节点的 `project` 关系指向其**容器根**（file-tree 创建时 `resolveProjectId`
沿祖先链上溯：项目文件→PROJECT 根，个人空间文件→PERSONAL_SPACE 根，写入 `projectId`）。
原实现是 3 个 OR 条件：
1. `{ project: { nodeType: PROJECT, OR: [ownerId, 成员] } }` —— 只匹配项目容器；
2. `{ nodeType: PROJECT, OR: [...] }` —— 匹配「文件节点自己是 PROJECT 根」，对文件查询是死分支；
3. `{ nodeType: PERSONAL_SPACE, OR: [...] }` —— 同上死分支。

条件 2/3 匹配的是节点自身类型而非其容器，对「查文件列表」永远不命中；条件 1 又只覆盖
PROJECT 容器，故个人空间文件被整体漏掉。

**修复**：收敛为单一条件「容器根可访问」，PROJECT 与 PERSONAL_SPACE 两类容器都覆盖：
`{ project: { OR: [ {nodeType: PROJECT, OR: containerAccess}, {nodeType: PERSONAL_SPACE, OR: containerAccess} ] } }`，
`containerAccess = [ownerId, projectMembers.some]`（个人空间实际无私有成员，成员条件恒不命中，
保留以对齐项目语义）。

**验证**：
- 单测：`conversion-task.service.spec.ts` 新增用例断言过滤形状同时含两类容器（31/31 绿）；
- 集成测试：`test/integration/conversion-task-layer.integration.spec.ts` 新增
  「listTasks 覆盖个人空间文件（属主可见/他人不可见）」，真实 PG 验证（2/2 绿）。

**集成测试环境说明（决策记录）**：本地 PG 只有 `cloudcad` 库，集成测试默认找
`cloudcad_test`（`src/test/setup.ts`：`TEST_DATABASE_URL` 缺省 `5432/cloudcad_test`）。
此前本地跑集成测试恒红（`Database cloudcad_test does not exist`），属环境缺失非代码问题。
本次为本地验证建了 `cloudcad_test` 库并 `prisma migrate deploy`（backend 侧
`prisma/migrations`，全量应用成功），跑测时显式传
`TEST_DATABASE_URL=postgresql://postgres:wdx123456@localhost:5432/cloudcad_test`。
不入库（环境配置因人而异），CI 走 `scripts/test-db.mjs` 的 Docker 测试栈。

**集成测试夹具坑（已修）**：注册流程（`initialization.service.ts`）会自动给新用户创建
PERSONAL_SPACE，库内有部分唯一索引 `unique_personal_space ON (ownerId) WHERE
nodeType='PERSONAL_SPACE'`（每用户至多一个，Prisma schema 未声明、只在 migration 里）。
夹具若再 `create` 一个必然撞唯一约束 → 夹具改为 `findFirst` 查注册时自动创建的那个。

**提交**：见本节末。

### 2.2 两个 SSE controller 引用不存在的 `@ApiHide`（已修复）

**现象**：`conversion-task.controller.ts`（`tasks/stream`）与
`conversion-file.sse.controller.ts`（`file-stream`）从 `@nestjs/swagger` 导入 `ApiHide`
并用作装饰器——@nestjs/swagger 11.4.4 **没有** `ApiHide` 导出（只有 `ApiHideProperty`）。
后果：`tsc --noEmit` 3 处报错、ts-jest 集成测试无法启动；SWC 构建剥类型不报错故 dev 能跑，
但类型门禁与集成测试全红。

**根因**：快照 465f488 带入（意图是落实 ADR-0034「SSE 不进 Swagger/SDK」的豁免，
但用错了装饰器名）。

**决策**：不自建装饰器（曾尝试 SetMetadata + 路由扫描方案，`PATH_METADATA_KEY` 未导出、
Express 路由扫描不可靠，已弃），改用 @nestjs/swagger 原生 `@ApiExcludeEndpoint()`——
与并行会话已修好的 `notice-center.controller.ts`（同文件同问题）修法对齐，全仓 SSE 豁免
统一一种机制。

**坑**：`@ApiExcludeEndpoint()` **不支持类级**使用（装饰器返回类型
`void | TypedPropertyDescriptor<unknown>` 与类装饰器签名不兼容，报 TS1238/TS1270），
只能加在方法上。两个 controller 各只有一个 SSE 端点，方法级覆盖即完整。

**修复**：两处 import 的 `ApiHide` 换为 `ApiExcludeEndpoint`，装饰器加到对应
`@Get` 方法上，注释同步改写。

**验证**：backend `tsc --noEmit` 0 错；单测 31/31；集成测试 2/2（见 2.1）。

**提交**：d4fcff6（已 push）。

---

## 3. backend permission 核心

审查范围：permission.service.ts / role-inheritance.service.ts /
permission-cache.service.ts / context-permission.strategy.ts / store-permission.strategy.ts。

### 3.1 ContextPermissionStrategy.verifyUserExists 用户不存在也放行（已修复）

**现象**：`verifyUserExists` 对 `prisma.user.findUnique` 的返回值不做判断，只要不抛
异常就 `return true`——而 `findUnique` 查无用户返回 `null` 而非抛异常，故「用户不存在」
与「用户存在」同样返回 `true`，`checkContextRules` 对不存在的用户放行。

**根因**：写该方法时把「查无」当成了异常路径，漏了 null 判定。

**当前影响面评估**：`checkContextRules` 唯一调用链是
`checkSystemPermissionWithContext` → 先过 `checkSystemPermission`（其内部
`checkUserPermissionWithInheritance` 已按 `deletedAt: null` 查用户、不存在即 false）→
再进上下文规则。故现有链路上该缺陷被上游检查掩盖，不可利用；但方法契约（「验证用户
存在」）被违反，任何直接调用 `checkContextRules` 的路径都会对不存在用户放行，属潜在
安全缺陷，修复成本一行。

**修复**：`verifyUserExists` 改为 `return user !== null`。

**验证**：spec 新增 2 例——`findUnique` 返回 null 时拒绝、抛异常时拒绝（5/5 绿）。

**提交**：a855800（已 push）。

**审查无缺陷项**：
- `permission.service.ts`：单查/批量查都走 `getRolePermissions`（含继承），语义一致；
  异常一律 fail-closed（返回 false / 空列表）。
- `role-inheritance.service.ts`：递归带 `MAX_HIERARCHY_DEPTH=50` 深度上限防环；
  「角色未找到」不缓存空结果（防启动竞态把权限永久置空）、「角色存在但无权限」才缓存
  `'null'`，区分正确。
- `permission-cache.service.ts`：订阅客户端挂了 error 监听（防 Redis 不可达时
  未处理 error 事件崩进程）；失效事件带 5s 时效防循环；`parseInt(userId)` 对 UUID
  得 NaN，但 set/delete 两侧同变换、键自洽，非缺陷。
- `store-permission.strategy.ts`：薄委托，store 缺失返回 null 走默认路径，正确。

---

## 4. backend auth 核心

### 4.1 无密码账号（password=null）密码登录抛 500，破坏防枚举（已修复）

**现象**：`UserRecord.password: string | null`（微信注册等无密码账号为 null）。
`login.service.ts` 的 `bcrypt.compare(password, user.password)` 在 hash 为 null 时
**reject**（bcryptjs 实测：`Illegal arguments: string, object`）→ 未处理异常 →
500 Internal Server Error，而非该文件精心设计的通用 401「账号或密码错误」。

**为何是缺陷**：
1. 功能面：攻击者/用户用密码登录一个微信账号得到 500（而非 401），错误语义错误；
2. 安全面：该文件多处注释强调防枚举（禁用/不存在/密码错误统一文案），500 vs 401
   的差异让攻击者能区分「该账号是无密码账号」——枚举面被破坏。

**根因**：写密码校验时未考虑 `password: null` 合法值（类型上允许）。

**修复**：`login.service.ts` 与 `password.service.ts`（`validateUser`，同缺陷类，
契约公开方法）改为 `user.password ? await bcrypt.compare(...) : false`——无密码账号
走「密码错误」同路径（失败计数 + 通用 401 / 返回 null）。

**同缺陷类排查（不修项及理由）**：
- `admin-auth.service.ts:153`：同一 `findLoginUserIncludingDeleted` 查询，但 compare
  之前有角色门禁（非 ADMIN 先拒绝），能到 compare 的只有 ADMIN（管理员必有密码），
  null 仅可能来自数据异常，且其审计/防枚举路径对 null 无额外暴露面 → 不改，保持手术性。
- `user-password.service.ts changePassword`：已用 `if (hasPassword)` 守卫，无缺陷。
- `users.service.ts validatePassword` / `auth-facade validateUser` 透传链：生产无调用方
  （TOB 扩展点），底层 `password.service.ts` 已修，透传层无独立逻辑。

**验证**：
- login.service.spec 新增「无密码账号密码登录：不抛 500，走防枚举通用 401 并计数」
  （断言 `bcrypt.compare` 未被调用 + `recordLoginFailure` 被调用 + 不发 token）；
- password.service.spec 新增 validateUser 两例（null 密码返回 null 且不调 compare；
  正常密码返回去密码用户）；
- 两 spec 22/22 绿；backend `tsc --noEmit` 0 错。

**提交**：38d9cdb（已 push）。

**auth 核心审查无缺陷项（已读）**：
- `jwt.strategy.executor.ts`：有 token 强制 JWT 验证不降级 session（有意设计，防陈旧
  token 静默换 session）；session 回退路径查黑名单 + DB 状态 + 实时角色，fail-closed；
  抓取令牌认证仅对 @ScrapeAuth 端点生效且需配置 SCRAPE_TOKEN。
- `jwt.strategy.ts`：token 类型/黑名单/用户黑名单/状态/MFA 强制/口令到期六道检查，
  异常一律 401/403 不泄露；JWT user 对象里 nickname/phone 等硬编码 null 字段经 grep
  确认无消费方（profile 走 DB 查询），安全。
- `refresh-token.strategy.ts` / `auth-token.service.ts`：refresh 走 DB 存储校验 +
  轮换（旧 token 删除）+ 上限 10 个/用户/client；logout 按 client_id 删 refresh +
  access 进黑名单至过期 + 销毁 session；`client_id` 机制对 exe 设备流自洽
  （设备流自签含 client_id 的 token 并入库），web 流恒 null 路径，行为一致。
- `token-blacklist.service.ts`：Redis 故障时 `isBlacklisted`/`isUserBlacklisted`
  fail-closed（返回 true 拒绝）；SCAN 迭代不用 KEYS。
- `login.service.ts` 其余：限流+失败锁定前置、先认证后注销恢复副作用、防枚举统一
  文案、ADMIN 禁走普通入口、冷静期自动恢复仅 SELF 注销——逻辑正确。
- **观察项（不修，记录）**：`blacklistUserTokens`（用户级黑名单写入）生产无调用方，
  用户禁用实际走 DB status=非ACTIVE 路径（jwt.strategy 每请求查），用户黑名单检查
  恒 false 属遗留防御；`client_type: 'exe'` 只写不读（预留字段，exe 客户端可能解码
  自用，不删）。

### 4.2 auth 其余链路审查结论 + 明文密码决策（无代码改动）

**已读且无缺陷**：
- `registration.service.ts`：限流前置、防枚举统一文案、微信 tempToken 校验、
  冷静期/邮箱验证分支完整。
- `mfa.service.ts` / `totp.ts`：TOTP secret AES-256-GCM 密文存库（密钥 SHA-256
  归一化）、setup 幂等复用、RFC 6238 自实现（HMAC-SHA1/6 位/30s/±1 窗/恒定时间比较）
  正确；解密失败/格式非法一律返回 false 不泄露。
- `session-transfer.service.ts`：一次性转移凭证（Redis 60s TTL）+ Lua GETDEL 原子
  消费即焚（杜绝重放）+ 旧会话彻底销毁（旧 access 黑名单 + 旧 web refresh 删除 +
  session regenerate 防会话固定）+ 新会话建立；redirect 仅接受同源单斜杠路径（排除
  `//` 协议相对）；跨用户替换有显式日志。
- `account-rate-limit.service.ts`：频率限流（INCR+EXPIRE 滑动窗口）+ 失败锁定
  （独立 key，阈值内累计→锁定期，锁期内正确密码也拒绝）+ Redis 故障降级进程内计数
  + 暴力破解 P1 告警；主流程锁期内不再记失败，进程内「窗口重置丢锁」边界不可达。
- `csrf.guard.ts`：double-submit cookie（cookie+header 恒定时间比较）+ Bearer 存在
  时跳过（Authorization 头不跨源自动附带，CSRF 天然免疫）+ 轮换 token；前端每次
  请求重读 cookie（clientSetup.ts），主流程恒带 Bearer 故 CSRF 仅在 cookie-only
  回退路径生效，轮换并发竞态为理论边界。
- `auth.controller.ts`（974 行）：薄控制器，全部委托 IAuthFacade/WechatCallbackService，
  仅含 cookie 设置（secure 按协议自适应，修离线 http 部署 cookie 被丢弃）+ 微信端点
  Cache-Control: no-store（state/txn/code 防 CDN 缓存串号），无业务逻辑违规。
- `local-auth.provider.ts`：手机/微信/邮箱各登录注册路径均有限流前置 + 验证码校验 +
  防枚举统一文案 + ADMIN 禁走普通入口 + 注销冷静期恢复；手机自动注册用随机强密码
  （randomBytes(9) base64url 12 位 + '!Aa'）。
- `admin-auth.service.ts`：安全分层完整——IP 黑名单（最前置）→ IP 白名单（fail-close，
  白名单外不消耗账号查询/限流/密码比对）→ 限流 → 防枚举 → 角色门禁 → 密码 → TOTP
  MFA（总闸 mfaEnforceEnabled，未绑定引导/缺码 MFA_REQUIRED/错码计限流+审计）→
  口令定期更换判定。

**决策：注册邮箱验证路径在 Redis 存明文密码（15 分钟窗口）——记录为已知权衡，不修**

`registration.service.ts` 在 `requireEmailVerification=true` 时把 `{email, username,
password, ...}`（含**明文密码**）存 `register:pending:<email>`（Redis，15min TTL），
邮箱验证通过后 `verifyEmailAndActivate` 读出明文调 `userService.create()`（内部再
`passwordHasher.hash()` 落库）。

- **为何是弱点**：明文凭据进缓存层，Redis dump/备份/日志可能含明文密码（DB 侧只有
  哈希，离线爆破慢；Redis 侧是明文）。
- **为何是有限/可接受**：窗口短（15min）、Redis 为本地受信基础设施、这是异步邮箱验证
  注册的标准做法（替代 UX——验证后要求重输密码——更差）。
- **为何不修（过度实现判断）**：正确修法（注册时即哈希、Redis 只存哈希）需要
  `CreateUserDto` 契约支持「预哈希密码」字段（否则 `create()` 会二次哈希致登录失效），
  属跨 `@cloudcad/contracts` + user-crud + registration 的多文件契约重构，超出「单点
  手术」范围。记为后续独立票（若做：CreateUserDto 加 `preHashedPassword?` 或
  `passwordHashed: boolean`，user-crud 据此跳过 hash，registration 先 hash 再存 Redis）。

---

## 5. public-file（公开文件服务，@Public 无认证端点）

### 5.1 路径包含性缺陷（已修 63ec97c）

公开端点的 `hash`/`filename`/`srcHash` 来自 URL 参数且 `srcFileHash` 无格式校验，
三处路径拼接缺包含性校验：

| 位置 | 缺陷 | 影响 |
|---|---|---|
| `findFileInDir` | `path.join(uploadPath, hash, filename)` 后直接 existsSync/流式返回 | `GET access/:hash/:filename` 路径遍历读文件：Linux 一级越界（hash=.. + 已知文件名）；**Windows 反斜杠也是分隔符，`..\..\` 可任意读文件**（Express 路由参数不含 `/` 挡不住 `\`） |
| `checkExtReferenceExists` | 同上，existsSync 直接返回 | `GET ext-reference/check` 任意文件**存在性探测 oracle**（query 参数可含 `/`，跨平台） |
| `uploadExtReference` | `resolvedSrcDir.startsWith(resolvedUploadPath)` 裸前缀比较 | `srcFileHash=../uploads-evil` 解析为 uploads 的同名前缀兄弟目录被误判为内部，且 `mkdirSync` 真建目录 + 写文件（100MB 上限内） |

修法：service 内新增 `isWithinUploadPath`（resolve 后 `startsWith(base + path.sep)`，
带分隔符后缀防同名前缀兄弟目录误判），三处统一走它；越界一律按「不存在/非法路径」
处理（404/400，不泄露存在性）。回归测试 `public-file.service.spec.ts` 8 例（真实
临时目录，断言即旧缺陷行为，有牙齿）。

其余端点无缺陷：`access/:filename`（平铺）走 findFilesByPrefix（目录列举过滤）+
DB 查 fileHash，无用户输入拼路径；`preloading/:hash` 的 hashDir 仅在 mxweb 命中后
使用（越界 hash 无命中早退）；`convert` 的 fileHash 走 findMxwebFile 同上安全。
DWG 分支的临时文件路径经文件名校验（无分隔符/无 ..）后不可能越出 srcDir，内层
两处 startsWith 校验冗余但无害，未动。
