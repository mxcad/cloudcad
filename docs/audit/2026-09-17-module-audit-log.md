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

### 5.2 share 模块（已修 2376c4a + 审查结论）

**已修：`validateShareFileAccess` 同节点判定裸 startsWith 前缀缺陷**
storagePath 来自 `filesData/*path` URL 路径参数（攻击者可控，`authorizeFilesDataAccess`
直接透传）。有效 shareToken 下 `storagePath.startsWith(mainPrefix)`（mainPrefix=
`YYYYMM/<nodeId>`）会让同月前缀兄弟目录 `YYYYMM/<nodeId>-evil/…` 被误判为同节点放行。
nodeId 为系统生成的 UUID，天然不存在这种兄弟目录，实际可利用性低，但按最小包含性
原则收紧为 `startsWith(mainPrefix + '/')`。新增 share.service.spec.ts 7 例（含撤销/
过期/已删文件 404 语义）。

**审查结论（无缺陷）**：createShare 权限分层完整（LIBRARY_DRAWING/LIBRARY_BLOCK
走系统权限、项目节点走 owner 或 FILE_SHARE、无项目节点走 ownerId）；resolveShare/
resolveShareNode/revokeShare/updateShare 的 token 生命周期判定（deletedAt/expiresAt/
creator-only）一致；listShares 的 search 走文件 id 集合不拼 SQL；`updateShare` 允许
创建者改任意过期时间（含延后）属设计语义（创建者控制有效期）。

**观察项（不修）**：`listShares` 的 sortBy/sortOrder 与 `updateShare` 的 expiresAt
为裸 `@Query`/`@IsString`，垃圾值（如 `sortBy=foo`、`expiresAt=garbage`）会落到
Prisma 校验错/Invalid Date → 500 而非 400。仅自家前端消费且恒发合法值，属轻微
健壮性缺口；修需定 400 vs 回落语义 + 补 DTO 校验，超出单点手术比例，记为后续可选票。

### 5.3 storage 模块（已修 59d46df + 审查结论）

**已修：LocalStorageProvider.validatePath 包含性判定补 path.sep 后缀**
裸 `startsWith(basePath)` 允许 `key='.'` 解析到存储根目录本身（现收紧为必须严格
位于其内）；后缀比较同时防同名前缀兄弟目录在解析语义变化时被误判为内部。实测
Node `path.resolve` 对 Windows 盘符相对路径（`C:x/…`，不命中 isAbsolute）按相对段
拼在 basePath 下、不越界，`..`/`~`/绝对路径已由前置校验挡住——故本处为防御性收紧
而非可现实利用的越界。新增 local-storage.provider.spec.ts 5 例钉住各向量不变量。
`/mxcad/file/` 绝对路径例外受 `..` 前置校验约束，只能落在该子树内，无越界。

**审查结论（无缺陷）**：StorageService 为 IStorageProvider 薄 facade（ADR-0026
可替换模块模式）；upload-token 端点走全局 JWT 守卫（无 @Public）+ path 校验
（`..`/`~`/绝对/盘符前缀全拒）+ 共享密钥 HS256 签发，storage-service 侧不查库校验；
http-storage.provider 的 key 全走 encodeURIComponent 无本地路径拼接。

---

## 6. frontend 核心（token / 上传）

### 6.1 JWT payload 解码 base64url 缺陷（已修 e8bc7b6）

后端 access token payload 含 `sub`（用户 UUID）+ `jti`（randomUUID）+ 中文用户名。
JWT 标准用 base64url（`-`/`_`）编码 payload，而前端 `atob(segment)` 只认 base64
（`+`/`/`）。实测：纯 ASCII 用户名 token 的 base64url 段几乎不含 `-`/`_`（0/200），
但**中文用户名 token 约 23.5% 含 `-`/`_`（47/200）**，原 `atob` 直接抛
`Invalid character` → 两处静默失效：
- `tokenUtils.isAccessTokenExpired` 恒返回 true（有效 token 被当过期）
- `tokenRefresh.getTokenRemainingMs` 返回 null → **主动刷新（过期前 5min）+
  `ensureFreshAuthCookie` cookie 保活全部静默失效**，mxcad 引擎 `<img>` 外部参照
  请求（只带 cookie 不带 Bearer）1h 后 401 破图。

修法：`tokenUtils` 新增 `decodeJwtPayload` 唯一出口（base64url→base64 + 补 padding +
**TextDecoder UTF-8 还原**——atob 返回 latin1 串，直接 JSON.parse 中文会乱码），
`isAccessTokenExpired` 与 `getTokenRemainingMs` 共用。新增 tokenUtils.spec.ts 6 例
（固定向量 payload 段含 `-`，旧实现必失败）。全仓其余 atob 调用点核对：collab
participant（非 JWT，try/catch 兜底）、wechat temp token（已做 base64url 转换）、
thumbnail dataURL / collab base64（标准 base64）均无同类缺陷。

### 6.2 分片合并 fileAlreadyExist 判定层级错误（已修 68e79d4）

`mxcadUploadUtils.uploadFile` 合并请求响应经 responseTransformer 解包后 `ret` 在
`data` 内（与末片上传分支 `uploadData.data.ret` 同层，SDK 类型 `UploadFileResponseDto`
= `{nodeId?, tz?, ret?}` 证实）。原合并路径查外层 `mergeData.ret` 恒为 undefined →
**全片已存在 + skip 策略重传**时 `isUseServerExistingFile` 误报 false（目录导入把
「跳过」计入「成功」，nodeId 仍正确故文件可正常打开）。修为 `mergeData.data?.ret`。
新增回归用例。

> ⚠️ 提交纪律披露：68e79d4 用 `git add -A -- mxcadUploadUtils.ts` 时，该文件工作树
> 本就含并行会话未提交的 forceUpload 分片门控改动（impl + 其 spec 用例，初始 git status
> 已标 M），被一并带入本次提交。该改动完整且 9/9 测试绿，无功能损害，但属误收并行
> 工作；本会话其余提交（public-file/share/storage/JWT/uploadManager）涉及文件均不在
> 初始脏集，已逐一核对干净。后续对「初始已 M 的文件」改用 hunk 级精确暂存。

### 6.3 UploadManager 在途取消复活（已修 f1fbac9）

`executeTask` 的 catch 分支有 `status === 'cancelled'` 判定，但 **success 路径**在
`await uploadSingleFile` 返回后无条件 `task.status = 'processing'`——上传在途时
`removeTask` 置 cancelled 会被 success 路径复活成 processing，已删除任务重新出现在
列表。补与 catch 对称的取消判定（`task` 在 await 前被赋 'uploading'，TS 收窄类型须
断言回 `UploadTask`）。新增回归用例（可控挂起上传 → 在途移除 → resolve 后仍 cancelled）。

---

## 7. storage-service（统一文件管理层，端口 3200，纯 Node 零依赖）

### 7.1 file-handler._resolvePath 前缀判界缺 path.sep 后缀（已修）

**现象**：`_resolvePath` 用 `filePath.replace(/\.\./g,'_').replace(/~/g,'_')` 中和相对
遍历后 `path.resolve(FILES_DATA_PATH, cleaned)`，再用**裸** `absolute.startsWith(
path.resolve(FILES_DATA_PATH))` 判越界——缺 `+ path.sep` 后缀，与 5.1/5.3 同类。

**根因**：`..`/`~` 替换挡住了相对遍历，但**绝对路径**（POSIX `/…files-123-evil/x`、
Windows 盘符 `D:\…files-123-evil\x`）不含 `..`/`~`，原样经 `path.resolve` 落到
「同名前缀兄弟目录」，裸 startsWith 误放行。

**威胁面评估**：storage-service 是内网服务，`server.js` 的 `checkSecret`（#419）对除
`/health` 与客户端直传 `POST /v1/files/upload` 外的全部路由校验 `x-internal-service-secret`
共享密钥，调用方为持密钥的 backend（可信）。且 upload 路径的 `filePath` 恒取
`tokenData.path`（backend 签发的 JWT，服务端已校验），`body.path` 仅为无 JWT path 时的
死回退。故该缺陷现实可利用性低，属**防御性收紧**（与 5.3 定性一致），非可现实利用越界。

**修复**：`_resolvePath` 判界改 `startsWith(base + path.sep)`。base 本身（非子路径）
不再被读/写命中，但真实用法恒为 `YYYYMM/nodeId/…` 子路径，无合法用法被破坏。
新增回归测试 `file-handler.test.js`「绝对路径逃逸到同名前缀兄弟目录必被拒」
（先断言前缀匹配成立证明缺陷前提，再断言 throws），9/9 绿。

### 7.2 审查结论（无缺陷，记录）

- **鉴权模型正确（非缺陷）**：`server.js checkSecret`（#419）对除 `/health`（只读探活）
  与 `POST /v1/files/upload`（客户端直传，走 JWT 上传令牌）外的全部路由校验
  `x-internal-service-secret`。`INTERNAL_SERVICE_SECRET` 空值=本地开发/未启用（向后兼容
  开关，生产必配）。CORS `Access-Control-Allow-Origin: *` 看似宽松，但
  `Access-Control-Allow-Headers` **刻意不含** `X-Internal-Service-Secret`——跨源浏览器
  预检即拦，攻击者无法从浏览器发出内部密钥头，故内部端点对浏览器实际不可达。
  曾一度误判「GET/PUT/DELETE 无鉴权」，读 server.js 后澄清为内网共享密钥隔离路线，不修。
- **svn-agent.js 无命令注入**：`spawn(process.execPath, [mxToolPath, ...args])` 传参数
  数组（非 exec 经 shell），`filePath`/`message` 特殊字符不被 shell 解释；带 30s 超时 +
  cat 50MB maxBuffer（spawn 无内置 maxBuffer，手动统计字节超限 SIGKILL）。正确。
- **token.js / utils.verifyToken**：HS256 HMAC 签名比对 + exp 过期校验，签名不符/过期
  一律返回 null（fail-closed）。正确。
- **lru-cache.js**：标准 LRU + TTL，超 maxFileSize 不入缓存、满则逐最旧、get 命中重排
  键序，逻辑正确。
- **观察项（不修）**：`router.js` 加载多节点路由表（groups[].basePath）并只在 `/health`
  暴露 `getNodes()`（prefix/node），但 file-handler 实际读写恒用 `FILES_DATA_PATH`，
  groups 的 basePath 未参与真实文件路由——多节点路由属「已接线但未完全实现」的预留能力，
  非缺陷（不修，避免过度实现；若将来启用须让 file-handler 按 prefix 选 basePath）。

---

## 8. config-service（部署配置中心，端口 3002，纯 Node 0 依赖，INITIAL_ADMIN_PASSWORD 鉴权）

### 8.1 database 备份文件名未校验 → 命令注入 + 路径遍历（已修）

**现象**：`routes/database.js` 三个端点把用户可控的 `filename` 直接 `path.join(BACKUP_DIR,
filename)` 后做文件操作，无任何格式校验：
- `/api/db/restore`（POST，`body.filename`）→ `restoreDatabase(filename)` →
  `spawnSync(psqlPath, args, { shell: process.platform === 'win32' })`——**Windows 下
  `shell:true` + 未净化参数 = 命令注入（RCE）**（Node 文档明确警告；实测 `spawnSync(...,
  {shell:true})` 参数含 `&` 即执行第二段命令）。同时 `path.join` 无包含性校验可越界读。
- `/api/db/download-token`（POST，`body.filename`）→ `createDownloadToken(filename)` →
  `/api/db/download/:token`（GET）→ `path.join(BACKUP_DIR, filename)` → **任意文件读**。
- `/api/db/backup/:filename`（DELETE）→ `decodeURIComponent(pathname.split('/').pop())`
  → `path.join(BACKUP_DIR, filename)` → `fs.unlinkSync`——**任意文件删**（URL 解析器保留
  `%2e%2e%2f`，`decodeURIComponent` 还原成 `../`，实测 `path.join` 越出 BACKUP_DIR）。

**威胁面**：三端点均需管理员会话（`authMiddleware`）。但 `INITIAL_ADMIN_PASSWORD` 未配置时
回落默认密码 `admin123`（弱、众所周知），且 CORS `*`，故「可达 3002 + 知道/猜到密码」即可
RCE / 删任意文件。属真实输入校验缺陷（非过度实现），修复为格式白名单校验。

**修复**：`lib/db-backup.js` 新增 `isValidBackupFilename(filename)` 唯一事实源
（`^db_backup_[\w-]+\.sql$`，与 `backupDatabase` 生成格式一致；无 `/`\` `\`/`..` 排除遍历，
无 `&`/`;`/`|`/空格 排除注入），`listBackupFiles` 的过滤也改用它（对真实备份文件行为不变，
对畸形名更严格）。`restoreDatabase` 顶部前置拦截；`database.js` 的 download-token /
download / delete 三端点各前置拦截（download 端点对 token 内 filename 再校验一次作纵深防御）。

**验证**：新增 `test/db-backup.test.js`（`isValidBackupFilename` 5 例覆盖合法/遍历/注入/
非字符串 + `restoreDatabase` 非法名前置拦截 2 例，断言即旧缺陷行为有牙齿——旧代码对
`../../etc/passwd` 返回「备份文件不存在」而非「非法的备份文件名」）；config-service 全量
`node --test test/` 46/46 绿。

### 8.2 pm2 服务控制服务名未白名单 → 命令注入（已修）

**现象**：`routes/service.js` 的 `restart/stop/start` 端点从 URL 路径段取 `serviceName`
（`pathname.split('/')[3]`）传给 `lib/pm2.js` 的 `restartService/stopService/startService`，
后者 `runPm2Command(['<cmd>', serviceName])`。系统 PM2 回退路径（无内嵌 runtime 时）
`shell: isWindows`（Windows 为 true）——`serviceName` 含字面 `&`/`;` 等元字符即命令注入
（实测 URL 路径段保留字面 `&`，`split('/')[3]` 得 `x&whoami`）。原代码仅拦 `config-service`，
其余任意名放行。

**修复**：`lib/pm2.js` 新增 `assertKnownService(serviceName)`（只允许 `PM2_SERVICES` 内的
精确名称，无元字符），三个控制函数顶部前置拦截。从源头杜绝注入（白名单名不可能含元字符）。

**验证**：`test/pm2.test.js` 新增 4 例（`restartService('x & whoami')` /
`stopService('nonexistent')` / `startService('../etc/passwd')` 均返回「非法的服务名」且
不触达 pm2；`restartService('config-service')` 不被白名单误拦、走专属分支）。46/46 绿。

### 8.3 审查结论（无缺陷 / 观察项，记录）

- **system-config.js 无注入**：改密端点（`/api/password/database`、`/api/password/redis`）
  的 `spawnSync(psql/redis-cli, …, { shell: false })` 全部 **shell:false**（与 db-backup 的
  shell:true 不同），参数不经 shell 解释；SQL 侧 `ALTER USER` 对 user/password 做了
  `"`/`'` 转义。正确。
- **brand.js 无路径缺陷**：`uploadLogo(buffer, mimeType)` 写固定 `LOGO_PATH`（multipart 的
  filename 不参与路径拼接），校验 MIME 白名单 + 2MB 上限。`updateConfig` 透传未声明字段是
  文档化的有意设计（前端「存在才覆盖」合并），非缺陷。
- **静态文件 startsWith 前缀缺陷不可达（不修）**：`server.js` 静态路由用
  `filePath.startsWith(PUBLIC_DIR/FRONTEND_DIST_DIR)`（缺 `+ path.sep`），但 pathname 来自
  WHATWG `new URL().pathname`（已剥离 `..` 段）且**不做 decodeURIComponent**，故 filePath 恒
  落在两个目录内、无法构造前缀兄弟路径——与 storage-service（有 decodeURIComponent 还原 `..`）
  不同，此处为不可达的冗余防御，不修（避免过度实现）。
- **观察项（不修）**：①`INITIAL_ADMIN_PASSWORD` 未配置时回落默认密码 `admin123`（部署应
  强制配置，代码已 log warn，属部署约束非代码逻辑缺陷）；②`env.js updateEnvFile` 对
  `/api/config` PUT 的 key 无白名单（可写任意 env 键），但调用方为受信管理员且是配置中心
  本职，加白名单属过度实现；③CORS `*` 由会话令牌鉴权兜底（敏感操作均需有效 session）。

---

## 9. engine-exec（mxcadAssembly 引擎执行层，backend 与 conversion-service 共用）

审查结论（**无缺陷**）：`runMxcadAssembly` 是引擎协议（spawn/参数转义/超时杀树/输出捕获）
的唯一实现。逐分支核对：
- **Windows 参数转义正确**：`windowsVerbatimArguments: !isLinux`（Windows 下 = true，Linux
  下 = false 且该选项无效）——含双引号 JSON 的 `arg` 原样传入，避免 Node 默认转义把 `"` 变
  `\"` 致 mxcadassembly 解析不到 srcpath（aaf2626 回归的修复，单测钉住 Linux 选项形状）。
- **进程组/进程树杀除正确**：Linux `detached:true` 使子进程成新组 leader，`kill(-pid)` 杀整组
  （不波及 backend 自身）；Windows `taskkill /PID <pid> /T /F` 杀进程树。`<pid>` 是 `child.pid`
  数值，拼进 taskkill 命令无注入面。
- **超时升级正确**：`timeoutMs` 后 SIGTERM 杀组，`killEscalationMs` 后未退再 SIGKILL；`settled`
  标志防重复 resolve；`error`/`close` 双事件先到先结算；始终 resolve（调用方解析 stdout 的
  `{"code":...}`，退出码恒 2123 不判成败）。
- **取消机制（#431）正确**：`onChild` 回调 kill 句柄走 SIGTERM→SIGKILL 升级。

**观察项（不修，过度实现判断）**：`onChild` 取消路径的升级计时器是局部变量 `t`（已 unref），
未赋给外层 `escalateTimer`，故 `finish` 不会清它——但子进程被杀后 `close` 触发 `finish`，该
`timer` 到期再 `killTree` 对已死进程组是幂等 no-op（try/catch 兜底），且 unref 不阻塞退出，
无实际危害。追踪它属过度实现，不动。

**验证**：`pnpm test` 6/6 绿（5 例 mock 覆盖正常/超时升级/spawn 失败/非零退出/onChild 取消，
1 例真实子进程验证孙进程随进程树被杀——非「进程能起来」的假绿）；`pnpm type-check` 0 错。

---

## 10. backend file-system（文件树 / 搜索 / 下载 / 校验，扩展审查）

审查范围：search（查询解析 + FTS）、file-download（导出/下载）、file-tree（节点创建/路径）、
file-validation（文件名/扩展名/魔数校验）+ 共用的 FileUtils / StorageManager。

审查结论（**无缺陷**）：该模块路径处理有分层校验，未发现路径遍历 / 注入 / SQL 注入：
- **search 无 SQL 注入**：`FtsQueryBuilder.matchIds` 用 `Prisma.sql` 模板，`plainto_tsquery('simple',
  ${keyword})` 的 `${keyword}` 是绑定参数（非字符串拼接），`LIMIT ${maxResults}` 是数值；
  `parseSortFilter` 的 `sortBy` 校验白名单 `['name','createdAt','updatedAt','size']`。
- **file-download 无遍历/注入**：文件系统路径全部来自 DB 的 `node.path`（系统生成，受信）；
  用户可控值均净化——pdf 参数经 `buildParamKey` 的 `[^a-zA-Z0-9]` 白名单、转换产物名经
  `[<>:"|?*]`/`..`/`~` 替换、ZIP 条目名经 `sanitizeFileName`（`/`\` `\`→`_` + 控制字符 + 长度）。
  快照/缓存 key 用 md5(内容) 内容寻址，无用户输入拼路径。
- **file-tree createFileNode 无遍历**：存储文件名 = `${nodeId}${extension}`（nodeId 为系统
  UUID），`extension` 经 `allowedExtensions` 白名单校验；路径由 `StorageManager.allocateNodeStorage`
  用系统生成的 `targetDirectory/nodeId` 构建，再经 `localStorageProvider.validatePath`（5.3 已修
  的包含性校验）兜底。
- **file-validation / FileUtils 校验严格**：`validateFilename` 用严格白名单
  `^[\u4e00-\u9fa5a-zA-Z0-9._\-\s]+$`（不含 `/`\` `\`/`<>:"|?*`）+ 拒前导点 + 拒危险字符；
  `sanitizeFilename` 剥离 `..`/分隔符/控制字符；扩展名走 `allowedExtensions` 白名单 + 魔数校验
  （DWG/DXF 结构）。多层防御，用户输入无法拼出越界路径。

**范围说明**：本模块 30+ 文件，本节覆盖其安全关键路径（搜索/下载/创建/校验 + 路径构建）。
其余读取类方法（getNode/getChildren/getTrashItems/resolvePath 等）走 Prisma 参数化查询 +
权限过滤（file-permission 已在第 3 节审查），无独立路径拼接风险。

---

## 11. backend file-operations（移动 / 复制 / 删除 / 项目 CRUD，扩展审查）

审查范围：node-copy-move（移动/复制 + 批量）、node-name（重命名/唯一名）、node-mutation.guard
（ADR-0037 变更不变量统一入口）、node-trash（软删/硬删/恢复/回收站 + 在途转换取消）、
project-crud（项目/文件夹创建 + 项目更新/查询）。

### 11.1 「容器目标必须是存活节点」不变量在 move/copy/建文件夹三处缺失 → 存活子树被连带硬删（已修）

**缺陷（不可逆数据丢失）**：`moveNode` / `copyNode`（node-copy-move.service.ts）与
`createNode` 建文件夹分支（project-crud.service.ts）取目标父节点时均用
`findUnique({ where: { id: targetParentId } })`——**不带 `deletedAt: null`**。而同一不变量在
`createFileNode`（file-tree，`deletedAt: null`）与 `restoreNode`（node-trash，`parentNode.deletedAt`
即抛「父节点已被删除」）处都有门禁，唯独这三处漏了。

**为何是数据丢失而非仅语义错**：`TreeWalker.getSubtreeIds` 默认 `includeDeleted: true`、
`getSubtreeFiles` 完全不过滤 `deletedAt`——两者都**包含存活后代**。于是链路成立：
1. 把存活节点移入/复制到回收站文件夹 T（或直接在 T 下建文件夹再上传文件，`createFileNode` 只查
   直接父、T 的子文件夹本身存活故放行）→ 存活子树被埋入 T 的已删子树，在活树中不可见；
2. T 后续被彻底删除（`permanentlyDeleteNode`/`permanentlyDeleteProject`）→ `getSubtreeIds(T)`/
   `getSubtreeFiles(T)` 把这棵**存活**子树一并纳入 → `deleteMany` 删 DB 行 + `deleteFileFromStorage`
   删物理存储。存活文件从未进过回收站即被物理销毁。

**可达性**：移动/复制/建文件夹的目标 id 均由客户端传入，`NodeMutationGuard` 只校验归属/角色、
不校验 `deletedAt`，故持有该回收站文件夹归属的用户即可触发（前端不会提供已删目录作目标，但
API 是安全边界）。

**修复（最小、对齐既有约定）**：三处目标父节点查询统一加 `deletedAt: null`。已删目标解析为
null → 复用既有 `target_parent_not_found` / `parent_not_found` 错误（404），**零新增 i18n 键**
（若改用独立「父节点已删除」提示需动 4 个语言文件，过度实现）。`node.controller.ts` 与
`library.controller.ts` 均经 `NodeCopyMoveService` 收口，一处修复覆盖文件侧 + 资源库侧全部入口。

**回归测试（有牙齿）**：mock 按 `where.deletedAt === null` 模拟真实 DB 的 `deletedAt` 过滤——
旧代码 where 无该字段（`undefined`）时 mock 返回已删父节点、操作继续推进（断言落库/权限断言
被调用而失败），新代码 where 带 `deletedAt: null` 时 mock 返 null、抛 404。move/copy/建文件夹
各 1 例，共 3 例。

**验证**：`pnpm jest file-operations` 6 套件 149/149 绿（含 3 例新回归）；`pnpm type-check` 0 错。

### 11.2 其余审查结论（无缺陷 / 观察项，记录）

- **node-name**：`generateUniqueName`/`checkNameUniqueness` 均带 `deletedAt: null`，重名后缀用
  转义正则取 maxCounter，正确。
- **node-mutation.guard（ADR-0037）**：权限（归属分派）→ 跨项目 6 域矩阵 → 配额，序列完整；
  库源 move 恒拒、库源 copy 豁免源权限（公开复制）、跨根配额归目标 owner，语义正确。
- **node-trash**：软删/硬删/恢复/清空回收站在途转换取消（best-effort，硬删排在事务前）、
  级联恢复、`deleteFileFromStorage` 的 `nodeDirectoryPath.endsWith(nodeId)` 路径校验 + fileHash
  引用计数去重，均正确。
- **project-crud**：项目创建走系统权限 `PROJECT_CREATE` + 项目数配额 + 事务内模板角色复制；
  查询 `sortBy` 白名单；更新/转移设置经 `assertMutationAllowed`/Controller 权限。无缺陷。

**观察项（不修，有理由）**：
- `NodeTrashService.softDeleteDescendants` / `deleteDescendantsWithFiles` / `deleteFileIfNotReferenced`
  **无生产调用者**（仅 spec 引用）——`deleteNode` 软删走的是内联级联（只置 `deletedAt`，不迁移
  子节点 `fileStatus`），而这两个方法是「更完整」的独立实现（含 PROCESSING→FAILED→DELETED 迁移）。
  按 AGENTS.md「未激活代码标注 + 登记 issue，不擅自删」，此处仅记录，不动代码。
- 内联软删级联不迁移子节点 `fileStatus` 的语义差异：删除时子树内 PROCESSING 文件恢复后会停在
  PROCESSING（`cancelInflightConversions` 已清 taskId，不会完成）。属低概率边界（删除瞬间恰有在途
  转换 + 随后恢复），且不影响数据安全，记录为观察项。

---

## 12. backend personal-space（个人空间）

审查范围：personal-space.service.ts（创建/获取/惰性改名）。

**服务本身无缺陷**：`createPersonalSpace` 无路径构建（根名是常量 `个人空间`，权限按 ownerId 由
PersonalPermissionStrategy 判定，不建成员行/不复制角色，ADR-00XX）；`getPersonalSpace` 的惰性改名
幂等（仅命中未自定义的旧默认名「我的图纸」）；`isPersonalSpace` 平凡。

### 12.1 通用删除端点可删个人空间 → 整棵子树数据丢失（已修，改动落在 node-trash）

**缺陷**：`PersonalPermissionStrategy.assertCan` 对 owner **放行任意动作**（仅校验 `ownerId ===
userId`）。而 `deleteProject` 有显式门禁「私人空间不支持删除操作」，但**通用的
`DELETE /nodes/:nodeId`**（node.controller，无路由级 `@RequireProjectPermission` 装饰器，仅
`@CsrfProtected`）走 `NodeTrashService.deleteNode`——后者**无 PERSONAL_SPACE 门禁**，只经
`assertMutationAllowed(userId,'delete',…)`（owner 恒放行）。于是 owner 可经此端点软删/硬删自己的
个人空间及其**整棵子树**（`permanently=true` 时 `getSubtreeIds`/`getSubtreeFiles` 连带物理删除全部
文件 + DB 行），绕过 deleteProject 的显式保护。`getPersonalSpace` 无 `deletedAt` 过滤（本因个人空间
不可删故安全），该洞一旦触发会使已删空间仍被返回，状态错乱。

**修复**：`deleteNode` 取到节点后、权限断言前加 `node.nodeType === PERSONAL_SPACE` 即抛
`private_space_no_delete`（复用既有 i18n 键，零新增）。置于权限断言前使匿名内部调用（userId 为空）
同样被拦。`deleteProject` 已在调用 `deleteNode` 前拦掉 PERSONAL_SPACE，故项目删除不受影响；
`batchDeleteNodes` 逐节点走 `deleteNode` 同样被覆盖。`permanentlyDeleteNode` 仅经回收站路径可达
（须先软删，而软删已被本门禁拦），故无需再补。

**回归测试**：node-trash.service.spec 新增 2 例（软删/硬删个人空间均抛 BadRequest，且不做权限断言、
不落库、不物理删除）。

**验证**：`pnpm jest file-operations` 6 套件 151/151 绿（含 2 例新回归）；`pnpm type-check` 0 错。

---

## 13. backend version-control（MX/SVN 版本控制集成，只读历史/内容/列表 + 提交）

审查范围：version-control.controller（3 个只读端点）、mx-version-control.provider（MX CLI 调用 +
路径处理）、mxVersionTool 包（CLI 包装层）+ 共用的 FileUtils.validatePath。

### 13.1 getFileHistory 漏 validatePath（三个只读端点中唯一未校验用户路径的）——已修

**缺陷**：`listDirectoryAtRevision`（L983）与 `getFileContentAtRevision`（L1046）都对用户传入的
`directoryPath`/`filePath` 调 `FileUtils.validatePath(path, filesDataPath)`（拒绝 `..`/`~`、绝对路径
按 `path.relative(base,target).startsWith('..')` 判界），但 `getFileHistory`（L762）**漏了这一步**：
它直接 `stripStoragePrefix(filePath)` 后把结果拼进 `file:///${mxRepoPath}/${directoryPath}` 仓库 URL
交给 MX CLI。于是 `filePath` 里的 `..`/`~` 原样进入 URL，经 CLI 解析可越出仓库根（与两个兄弟端点
的安全约定不一致）。

**修复**：`getFileHistory` 顶部（`ensureInitialized` 后）补 `FileUtils.validatePath(filePath,
filesDataPath)`，与两个兄弟端点对齐。

**回归测试**：mx-version-control.provider.spec 新增 1 例——mock `validatePath` 对含 `..` 的入参抛
BadRequest，断言 `getFileHistory('../../etc/passwd')` 抛错。旧代码不消费该 once 实现（不调
validatePath）→ 操作继续推进 → 断言失败（有牙齿）。

**验证**：`pnpm jest version-control` 3 套件 56/56 绿（含 1 例新回归）；`pnpm type-check` 0 错。

### 13.2 其余审查结论（无缺陷 / 观察项，记录）

- **无命令注入**：MX CLI 全部经 `@cloudcad/mx-version-tool` 的 `executeSpawn`/`executeExecFile`
  （arg-array，`getSpawnOptions`/`getExecOptions` 只设 `windowsHide` + `LD_LIBRARY_PATH`，**不设
  `shell:true`**）→ 用户路径作为参数向量传入，特殊字符无法注入命令。壳版 `executeCommand`
  （`exec` 字符串）**已导出但全仓 0 调用者**（死代码，仅记录）。
- **validatePath 判界正确**：先拒原始输入 `..`/`~`（normalize 前，防展开绕过），绝对路径用
  `path.relative(base,target).startsWith('..')`（比 storage-service 修复前的裸 `startsWith(base)` 更
  稳健，无同名前缀兄弟目录误放行）；相对路径因 `..` 已被拒 + 调用方 `resolveStoragePath`/
  `path.relative` 收敛到 filesDataPath 下，安全。
- **权限**：3 个只读端点均 `@RequireProjectPermission(VERSION_READ)`。

**观察项（不修，设计层面，记录待议）**：3 个端点的权限判据是 query 的 `projectId`，而实际访问的
文件由 `filePath`/`directoryPath` 决定，**filePath 未与 projectId 做归属绑定**。跨项目越权需知道
目标 nodeId（存储布局 `YYYYMM/nodeId` 中 nodeId 为随机 UUID，不可猜测），故实际风险低；若要根治
应改为按 filePath 解析归属项目再校验（属权限模型调整，非本点范围，留待专项）。

## 14. backend batch-download（批量下载：zip 打包 / 单文件直出 / 合并 / 下载端点）

审查范围：batch-download.controller（下载/合并/进度端点）、batch-download.service（任务生命周期 +
下载路径解析 + 合并）、batch-download-job（状态机 + 编排）、job-context（archiveEntries 构建 +
zip 名清洗 + 产物清单）、batch-download-orchestrator（源文件/转换产物入包）、archive-writer
（archiver 写盘）、folder-expander（文件夹展开）。重点：zip 打包/下载链路是否存在路径遍历 /
zip-slip / 任意文件读。

### 14.1 服务端路径全部由服务端生成，无用户可控串进入落盘/读取位置——无缺陷

逐一核对「用户可控串是否进入磁盘路径位置」：

- **主 zip 落盘名**：`job-context.createArchive` 以 `this.jobId`（Prisma UUID）为 `archiveName`，
  `archive-writer` 落盘 `path.join(outputDir, `${archiveName}.zip`)` → UUID 不含 `..`/分隔符，安全。
- **下载路径解析**：`service.getDownloadPath` 用 `path.resolve(exportDir, job.zipPath)`，而
  `job.zipPath = path.basename(zipPath)`（仅 `<jobId>.zip`，无路径段）→ 恒收敛在 exportDir 内。
  清理任务同用 `path.resolve(exportDir, job.zipPath)`，一致。
- **单文件直出（individual）**：`service.getItemDownload` 直接读 `item.sourcePath`。`sourcePath`
  由 orchestrator 生成——源文件 = `fileDownloadExportService.getFullPath(node.path)`（存储内部布局
  `YYYYMM/nodeId/...`），转换产物 = `conversionRunner` 的 `result.filePath`（转换输出目录）。**两者皆
  服务端生成的绝对路径，非用户输入**。
- **物理存储文件名**：`file-tree.createFileNode` 落盘名 = ``${fileNode.id}${extension}``（nodeId +
  扩展名），**不是**用户传入的 `name` → 即便 `name` 含 `..` 也不影响物理路径。
- **合并 zip**：`service.mergeZip` 的 `archiveName = merged-${Date.now()}`（服务端生成），条目名取
  `path.basename(fullPath)` 或 manifest 名（经 `sanitizeZipName`），安全。
- **Content-Disposition**：三个下载端点均用 `path.basename` 取文件名 + `encodeURIComponent` +
  `replace(/[^\x20-\x7E]/g,'_')` 兜底（去 CRLF/引号）→ 无响应头注入。

结论：**无服务端路径遍历 / 任意文件读 / zip-slip（服务端只创建 zip，从不解包）**。

### 14.2 zip 条目名 `..` 段缺口——客户端侧低风险，根因在上游，不在本模块修

- `job-context.sanitizeZipName` 已去控制字符、归一 `\`→`/`、去首尾 `/`、200 截断、去重，但**未剥离
  `..` 段**；`addEmptyDirectories` 的空目录条目（`${dir}/`）更未过 `sanitizeZipName`。故若节点名/
  文件夹名含 `..`，zip 条目名可带 `..`。
- **判为客户端侧低风险而非服务端缺陷**：本模块只**创建** zip（`archive.append`），从不解包；`..`
  条目名只在下拉用户本地解包时才可能触发 zip-slip，而现代 OS 解包器（Windows/macOS/7-Zip）默认
  已防护。在服务端剥离 `..` 属对客户端侧问题的过度防御（违反「不过度实现」），且治标不治本。
- **真正根因在上游**（见 14.3）：节点名/文件夹名能含 `..` 是因为上传入口未清洗文件名。

### 14.3 跨模块发现：mxcad 上传 `body.name` 未清洗（记入 mxcad upload 模块审查，届时修）

**发现**：`mxcad-upload.controller.uploadFile` 的 `name` 取自 **JSON body 字段 `body.name`**（非
multer `file.originalname`），DTO `UploadFilesDto.name` 仅 `@IsString()`——**无路径遍历/字符白名单/
长度校验**。该值经 `ingest`→`createFileNode` 原样落库为节点 `name`/`originalName`（`file-tree`
L156/L159），并被复用于：UI 展示、批量下载 zip 条目名（`tryAddOriginal` 直接用 `fileName`）、同名
去重（`name:{equals,mode:'insensitive'}`）。

**影响评估**：
- 物理存储安全（落盘名 = nodeId+ext，见 14.1）；
- 展示：React 默认转义，无 XSS；
- 批量下载 zip 条目名可带 `..`（14.2，客户端侧低风险）；
- Content-Disposition 已兜底（14.1）。
→ 属**输入校验卫生缺口（低-中危）**，非服务端可利用漏洞。

**决策**：按「一个模块一个点」纪律，本模块（batch-download）不改；在**mxcad upload 模块审查时**
于上传边界（controller/ingest 入口）用既有 `FileUtils.sanitizeFilename`（去路径分隔符/控制字符、
255 截断、拒 `.`/`..`）统一清洗 `body.name`——这是「单一事实源」边界，一次修好可保护全部下游
（展示/zip/去重/存储）。**mxcad upload 属高热高并发区，届时须先核工作区归属再动手。**

**验证**：batch-download 无代码改动，无需跑测试；结论基于逐文件路径追踪（controller/service/job/
job-context/orchestrator/archive-writer/folder-expander 全读）。

## 15. backend mxcad upload（图纸上传入口）——body.name 未清洗

### 15.1 body.name 落库前未清洗——已修（daa0dc1）

**缺陷**：`mxcad-upload.controller.uploadFile` 的 `name` 取自**客户端可控 JSON 字段 `body.name`**
（非 multer `file.originalname`），DTO `UploadFilesDto.name` 仅 `@IsString()`——无路径遍历/字符/
长度校验。该值经 `ingest`→`createFileNode` 原样落库为节点 `name`/`originalName`（`file-tree`
L156/L159），并被复用于：UI 展示、批量下载 zip 条目名（`tryAddOriginal` 直接用 `fileName`）、同名
去重（`name:{equals,mode:'insensitive'}`）。

**影响判定**：物理存储文件名 = ``${nodeId}${extension}``（`file-tree` L176，**非** `body.name`）
→ **无服务端文件写遍历**；展示 React 转义无 XSS；Content-Disposition 已兜底。故属**输入校验卫生
缺口（低-中危）**，非可利用服务端漏洞。但 `..`/路径段进入 `name`/`originalName` 会污染展示与
批量下载 zip 条目名（14.2 的根因），故修。

**修复**：`uploadFile` 边界（必填校验后）加 `body.name = FileUtils.sanitizeFilename(body.name)`。
**关键决策=选 `sanitizeFilename`（非白名单）而非 `validateFilename`（白名单）**：`validateFilename`
的正则 `^[\u4e00-\u9fa5a-zA-Z0-9._\-\s]+$` 会**拒括号/加号等合法字符**（如「图纸 (1).dwg」——Windows
自动生成的常见名），直接套用会造成**上传功能回归**；`sanitizeFilename` 用 `path.basename` 去路径段 +
去 `..`/危险字符 `<>:"|?*` + 去首尾点/空格 + 拒空，**保留合法特殊字符**，安全且不误伤。

**回归测试**：mxcad-upload.controller.spec 新增 3 例（有牙齿）——①`../../evil.dwg` 清洗为 `evil.dwg`
后进 ingest（旧代码传原串，断言 basename 失败）；②`..` 清洗后为空 → 400 且不进 ingest（旧代码不抛、
ingest 被调，双断言失败）；③`图纸 (1).dwg` 原样保留（守「勿用白名单误拒」的回归）。

**验证**：`pnpm jest mxcad-upload.controller.spec` 11/11 绿（含 3 例新回归）；`pnpm type-check` 0 错。

### 15.2 清洗收敛到 createFileNode（所有建节点入口的单一事实源）——已修（3319fac）

**问题**：15.1 只在 `uploadFile` 控制器清洗 `body.name`，但 `createFileNode`（file-tree）是**所有
文件节点创建的收敛点**——图纸上传 / 秒传 `checkExist` / 资源库 / 另存为 / 外部参照 / 物化器全部经它
落库。其中**秒传 `checkFileExist` 的 `body.filename`** 同样未清洗（`checkExist` 直接透传，无校验），
控制器级清洗覆盖不到。外部参照入口已有 `ExtRefValidatorService.validateFileName`（拒 `..`/`/`/`\`/
控制字符/`<>:"|?*`）故无需重复。

**决策**：把清洗**上移到 `createFileNode` 顶部**（`const name = FileUtils.sanitizeFilename(rawName)`），
一次覆盖全部建节点入口；**撤回 15.1 的控制器级清洗**（避免双重清洗，控制器/秒传等入口无需各自处理）。
`name`/`originalName` 均落清洗后的值；`extension` 是独立参数不受影响。

**回归测试**：3 例有牙齿回归从 mxcad-upload.controller.spec 迁到 file-tree.service.spec（断言
`create` 收到的 `data.name`/`data.originalName` 为清洗后值）——①`../../evil.dwg`→`evil.dwg`；
②`..` 清洗后为空 → 400 且不落库；③`图纸 (1).dwg` 原样保留。

**验证**：file-tree 50 + mxcad-upload 8 + materializer/library/save-as/drawing-ingest 51 全绿；
`pnpm type-check` 0 错。

## 16. backend mxcad infra/core —— filesData 文件服务路径遍历（任意文件读）——已修

### 16.1 `path.resolve(filesDataPath, 用户路径)` 无 containment，`..` 可逃逸读任意文件

**缺陷**：`mxcad-file-access.controller` 的 `filesData/*path` 通配符把 URL 路径段**原样**捕获为
`params.path`（含 `..` 段——Express 5 / path-to-regexp 8 的 `*path` 通配符**不做路径归一化**，
`..` 段原样进入参数数组，已用 `path-to-regexp.match` 实测确认：`/mxcad/filesData/202609/node-1/
../../../etc/passwd` → `params.path = ["202609","node-1","..","..","..","etc","passwd"]`）。
`extractPath` 将其 `join('/')` 成 `202609/node-1/../../../etc/passwd`，随后：

- `MxcadFileHandlerService.serveFile`：`path.resolve(filesDataPath, filename)` **无 containment** →
  `..` 段把绝对路径解析出 `filesDataPath`（实测 `path.resolve('/data/filesData','202609/node-1/
  ../../../etc/passwd')` = `D:\data\etc\passwd`），`fs.existsSync` 命中即 `streamFile` 外发；
- `MxcadFileHandlerService.findExternalReferencePath`（serveFile 的未命中回退）：
  `path.resolve(filesDataPath, dir)` 同样无 containment，`readdirSync` 列任意目录；
- `MxcadVersionHistoryService.handleHistoricalVersionRequest` / `resolveMxwebVersion`（带 `?v=` 的
  历史版本路径）：`path.resolve(filesDataPath, filename)` 同样无 containment。

**授权为何拦不住**：`getFilesDataFile`（GET）先走 `authorizeFilesDataAccess`，但它只取
`parts[1]`（nodeId）校验节点权限——攻击者用**自己拥有的任一节点**拼 `202609/{自己的nodeId}/
../../../../etc/passwd`，`parts[1]` 是合法 nodeId、权限通过，随后 `serveFile` 仍按含 `..` 的完整
路径读盘逃逸。即「有任一文件访问权即可读服务器任意文件」。

**更严重的入口**：`library.controller` 的 `drawing/filesData/*path` 与 `block/filesData/*path`
均为 **`@Public()`（完全无鉴权）**，且把通配符**直接**透传给 `libraryService.serveFile` →
`mxcadFileHandler.serveFile`（serveFile 内部无任何授权）。故本漏洞**未登录即可利用**——可读取
`/etc/passwd`、SSH 私钥、`.env`（DB 凭据/JWT secret）、源码等。属**严重（Critical）任意文件读**。

**修复**：新增 `FileUtils.resolveWithinRoot(root, relative)` 作为「用户可控路径拼到根目录再读盘」的
**唯一路径遍历防线**：先 `path.resolve` 再校验 `resolved === root || resolved.startsWith(root +
path.sep)`（加 `path.sep` 防 `root+"evil"` 兄弟目录前缀误判），逃逸即抛 `BadRequestException`
（复用既有 i18n 键 `error.mxcad.path_invalid`，4 语言均已存在）。在 4 处 live 解析点套用：
`serveFile`、`findExternalReferencePath`（其内层 catch 把抛错归为「未找到」→404）、
`handleHistoricalVersionRequest`、`resolveMxwebVersion`。version-history 入口 catch 补
`BadRequestException → 400` 分支（原会落入 500，遍历属客户端错误不当服务端错误）。

**未改（判定）**：
- `mxcad-file-access.controller.handleFilesDataFileRequest` 的非 version 分支为**死代码**（仅带
  `?v=` 时被调用且恒委托 version-history），按「不修死代码」保留；
- 其余 `path.resolve(filesDataPath, …)` 点（`async-conversion`/`external-reference-handler`）入参为
  **DB 存的 `node.path`**（服务端生成，非直接用户输入），属纵深防御、非本漏洞，留作后续独立点；
- `thumbnail.controller` 已 `.replace(/\.\./g,'_')` 剥离，无遍历。

**回归测试**（3 处，均有牙齿）：
- `file-utils.spec.ts`（新建）：`resolveWithinRoot` 7 例——正常路径/空路径/根内 `..`（不误伤）/
  直接逃逸/单段 `..`/深层逃逸/兄弟目录前缀（守 `+path.sep` 防经典 `startsWith(root)` 缺陷）；
- `mxcad-file-handler.service.spec.ts`（新建）：`serveFile` 2 例——逃逸 → 400 且不触 `createReadStream`、
  正常不存在路径 → 404（不受防护误伤）；
- `mxcad-version-history.service.spec.ts`：新增 2 例——逃逸 → 400 且不触版本库/转换、根内 `..` →
  正常 200（守「勿过度拦截」回归）。

**验证**：`pnpm jest file-utils + mxcad-file-handler + mxcad-version-history` 29 例全绿；受影响
library/thumbnail/version-control 53 例全绿；**后端全量单测 180 suites / 2474 tests 全绿**；
`pnpm type-check` 0 错。改动行 prettier 干净（两 service 文件 HEAD 本就非 prettier-clean，按项目
约定不 `--write` 重排既有行）。

### 16.2 infra 其余文件——无新缺陷（结论）

逐文件审查 mxcad infra 剩余文件，均无用户输入可达的注入/遍历/越权：
- `thumbnail-generation.service.ts`：`MxWebDwg2Jpg.exe` 经**参数文件**传参（`cadFilePath` 写入
  `paramFilePath`，命令只引用该文件路径）→ **无 shell 注入**；`outputDir`/`cadFilePath` 由
  materializer 传入 = 配置上传路径 + MD5 `fileHash`，非用户输入；`checkThumbnailExists`/
  `uploadThumbnail` 用 DB `node.path` + 固定 `thumbnail.jpg`。
- `file-system.service.ts`：低层文件工具（exists/mkdir/delete/mergeChunks/writeStatusFile），
  入参均由调用方（upload/conversion，已审）传 hash/配置路径，本层无独立用户输入入口。
- `thumbnail-utils.ts`：纯函数（固定 `thumbnail.jpg` 名、find/has/mime），无路径拼接风险。
- `cache-manager.service.ts`：内存 TTL 缓存，key 为 Map 键非文件路径。
- `linux-init.service.ts`：`execAsync` 命令（pgrep/pkill/chmod/mkdir/cp）全部用**配置派生路径**
  （`mxcad.assemblyPath` 环境变量）且双引号包裹，非用户输入 → 无命令注入（仅运维误配 .env 才
  可能，非用户可利用）。
- `thumbnail.controller.ts`（16.1 已述）：`node.path` 已 `.replace(/\.\./g,'_')` 剥离，无遍历。
→ infra 模块整体干净，无需再改。

## 17. mxcad save 子模块 — `copyPreloadingData` 的 `sourceFileHash` 潜在路径遍历（低危）

**范围**：`mxcad/save/` 全 4 文件（`mxcad-save.service.ts`、`save-as.service.ts`、
`save.controller.ts`、`save-mxweb-as.dto.ts`）。

**逐项排查结论**：

- `mxcad-save.service.ts`：`saveMxwebFile` 目标路径 = `storageManager.getFullPath(node.path)`
  （DB 源）；`file.path` 为 multer 临时路径；`file.originalname` 仅用于 `.mxweb` 后缀判断；
  `saveMxwebFileByHash` 的 `fileHash` 用作 `readdir` 结果的前缀过滤（`f.startsWith(fileHash) &&
  f.endsWith('.mxweb')`，readdir 只返回 basename，`../` 匹配不到真实条目 → 安全）。**干净**。
- `save.controller.ts`：`saveMxwebToNode` 由 `@RequireProjectPermission(CAD_SAVE)` 守卫；
  `saveMxwebAs` 强制 `userId`（未登录 401）+ 按 targetType 分派权限（personal 校 ownerId、
  library 校系统权限、project 校 CAD_SAVE 节点权限）。**干净**。
- `save-mxweb-as.dto.ts`：`format` 为 `@IsIn(['dwg','dxf','mxweb'])` 白名单（故
  `mxwebFileName = ${newNodeId}.${format}.mxweb` 无遍历）；`hash`/`fileName` 经 `readdir`
  前缀过滤 / 节点名清洗（`createFileNode` 修复 3319fac）安全。**唯一未校验的路径拼接输入 =
  `sourceFileHash`（仅 `@IsString() @IsOptional()`）**。
- `save-as.service.ts` `copyPreloadingData`：`sourceFileHash` 直接进三处 `path.join`——
  ①`path.join(uploadPath, `${sourceFileHash}.mxweb_preloading.json`)`、②`path.join(uploadPath,
  sourceFileHash)`、③`srcFileMd5` 回落 `sourceFileHash` 后 `path.join(nodeDirectory, srcFileMd5)`。
  攻击者（持 CAD_SAVE 权限的登录用户）可传 `../../etc` 等使路径逃逸出 `uploadPath`/
  `nodeDirectory`。**定级低危**：受 `fs.existsSync` 门禁（须目标处已存在
  `<traversal>.mxweb_preloading.json`/目录才可实际触发）+ 需鉴权 + 影响限于把目录复制进攻击者
  自身节点存储；但仍属「用户输入进 `path.join` 无包含校验」的真实缺陷，与 16.1 同类。
  `sourceNodeId` 分支的 `srcFileMd5 = sourcePreloading.srcFileMd5 || sourceNodeId` 均为服务端
  生成值（preloading.json 由上传时服务端写入 / 节点 UUID），**安全**。

**修复**：`copyPreloadingData` 的 uploads 查找分支加十六进制门禁——`sourceFileHash` 仅接受
`/^[a-f0-9]+$/i`（合法 MD5 为 32 位十六进制，含 `/`/`\`/`.`/`..` 等非十六进制字符一律拦截）；
不合法则 `logger.warn` 告警并跳过该分支（best-effort 复制，不阻断另存为）。对正常流程是 no-op。

**回归测试**：`save-as.service.spec.ts` 新增 `copyPreloadingData — sourceFileHash 路径遍历防护`
2 例——①`sourceFileHash='../../etc'` → 不触 `copyDirectoryContents` 且 `existsSync` 未被传入
含 `..` 的路径（守「恶意 hash 被拦截」）；②合法十六进制 hash → 正常进入 uploads 分支并对
`<hash>.mxweb_preloading.json` 做 `existsSync` 探测（守「勿过度拦截」）。`jest.mock('fs')` 工厂
补 `existsSync: jest.fn()`（原 spread 自真实 fs 的 getter 不可 `spyOn` 重定义；默认 `false`，
既有 6 例不传 `sourceFileHash` 故不受影响）。

**验证**：`pnpm jest save` 3 suites / 30 tests 全绿；`pnpm type-check` 0 错；两文件 HEAD 与工作树
均 prettier-clean（无新增漂移）。

## 18. mxcad core — multer 落盘路径遍历（**高危：未鉴权任意文件写入**）

**范围**：`mxcad/core/mxcad-core.module.ts` 的 `MulterModule.registerAsync` 工厂（`diskStorage`
的 `destination`/`filename` 回调）。

**根因**：`destination` 回调 `join(tempPath, `chunk_${req.body.hash}`)`、`filename` 回调
`` `${req.body.chunk}_${req.body.hash}` `` / `` `${req.body.hash}.${ext}` `` / `file.originalname`
均直接用客户端 multipart 字段 `hash`/`chunk`/`originalname` 拼路径。`hash` 仅 `@IsString()`（无格式
校验），而 **DTO 的 class-validator 校验发生在路由处理器——晚于 multer 拦截器**（NestJS 顺序
Guard→Interceptor→Handler；`AnyFilesInterceptor` 在 `intercept` 里跑 `multer.any()`，此时
`req.body.hash` 是未校验原始值）。`AnyFilesInterceptor({ defParamCharset:'utf8' })` 的 localOptions
不含 `storage`，故 `multer({ ...moduleOptions, ...localOptions })` 仍采用本模块的 `diskStorage`
（已读 `@nestjs/platform-express@11.1.27` 源码确认）。

**可达性**：`POST /mxcad/files/uploadFiles` 为 `@OptionalAuth()` + `@RequireProjectPermission
(FILE_CREATE)`（游客可上传，见 ecef755）。攻击者构造 multipart（`hash` 字段置于 file 之前）传
`hash=../../../../target` → `filename` 回调返回 `../../../../target.mxweb` → multer 把上传文件写到
`join(mxcadUploadPath, '../../../../target.mxweb')`，逃逸到任意路径。**未鉴权任意文件写入**（可覆盖
/etc/cron.d、写 shell 脚本等），比 16.1 的 filesData 任意读更严重。

**排查其他 MulterModule 配置（同缺陷类）**：
- `library.module.ts`：`filename = library_<Date.now()>_<randomBytes(8)hex>${extname(originalname)}`
  ——随机前缀 + `extname`（取 basename 扩展名，恒无分隔符）→ 单段，**安全**。
- `fonts.module.ts`：`MulterModule.register({ limits })` 无自定义 storage → multer 默认随机 hex
  文件名 → **安全**。
- `public-file.module.ts`：`memoryStorage()`（不落盘）→ **安全**。
→ 仅 `mxcad-core.module.ts` 中招。

**修复**：把两处回调的路径构造抽成框架无关纯函数 `multer-path.utils.ts`（`buildMulterChunkDir` /
`buildMulterFilename`），对 `hash`/`chunk`/`originalname` 统一 `path.basename()` 剥离路径段
（`basename` 结果恒不含 `/`/`\`，故 `join(root, …)` 必落在 root 内；合法 MD5 与常规文件名无分隔符，
no-op）。模块回调改为调用这两个函数。对正常上传零行为变化（合法 hash/originalname 经 basename 不变）。

**回归测试**：新建 `multer-path.utils.spec.ts` 7 例——`buildMulterChunkDir`（合法/遍历 `../../../../etc`
→ `chunk_etc` 且 `startsWith(root+sep)`/空 hash）、`buildMulterFilename`（合法 `<hash>.<ext>`、遍历
hash → `passwd.dwg` 无分隔符、分片 chunk+hash 均剥离、无 hash 时 originalname 经 basename）。

**验证**：`pnpm jest multer-path.utils.spec` 7/7 绿；`pnpm jest src/mxcad/core` 4 suites / 44 tests
全绿；`pnpm type-check` 0 错。`multer-path.utils.ts`/`spec` prettier-clean；`mxcad-core.module.ts`
HEAD 本就非 prettier-clean（`runtimeMaxFileSizeMB`/`controllers` 两行预存漂移，按约定不 `--write`），
仅确保我新增的 import 行单行干净。

## 19. mxcad external-ref / node / services 子模块 — 外部参照文件名路径遍历（任意文件读/写）——已修

**范围**：`mxcad/external-ref/*`（controller / facade / update / ref / validator / preloading /
handler）、`mxcad/node/filesystem-node.service.ts`、`mxcad/services/chunk-upload-manager.service.ts`。

**入口与鉴权**：`external-ref.controller.ts` 全部端点挂 `RequireProjectPermissionGuard` +
`CAD_EXTERNAL_REFERENCE`/`FILE_OPEN`（登录 + 项目权限），故非未鉴权漏洞，但 `fileName`/
`extRefFileName` 来自 URL/body 未校验，属**已鉴权任意文件读/写**。

### 19.1 四处 `fileName`/`extRefFileName` 直接拼路径——已修（basename）

| 方法 | 文件 | 风险 |
|---|---|---|
| `getExternalRefDownloadPath(nodeId, fileName)` | external-reference-update.service.ts | `path.join(storageRoot, extRefDir, fileName)` 作下载路径 → 任意文件读 |
| `checkExists(nodeId, fileName)` | external-reference-update.service.ts | `path.join(storageRoot, extRefDir, targetFileName)` → 任意路径存在性探测 |
| `handleExternalReferenceFile(…, extRefFileName, …)` | external-ref.service.ts | 拷贝目标 `path.join(dir, extRefFileName)` → 任意路径写 |
| `handleExternalReferenceImage(…, extRefFileName, …)` | external-ref.service.ts | 同上（图片） |

**修复**：各方法 `try {` 后首行加 `fileName = path.basename(fileName);` /
`extRefFileName = path.basename(extRefFileName);`（`basename` 结果恒无 `/`/`\`，`join(root,…)` 必落
root 内；合法参照名无分隔符，no-op）。与 16/17/18 同缺陷类、同修法。

**上传侧已安全（无需再修）**：`ext-ref-validator.validateFileName` 已拒 `..`/`/`/`\`/非法字符
（仅作用于 `body.ext_ref_file`）；`body.originalXrefName` 受 preloading 引用名匹配约束（L57-60）；
且拷贝回调（19.1 两处）已 basename，故 `storageFileName = originalXrefName || ext_ref_file` 即便含
`../` 也被剥离。`ingest → materialize` 的落盘路径由 `nodeId`（UUID）+ hash 派生，不直接用 `name`。

### 19.2 死代码：`external-reference-handler.service.ts` 的遍历——记录不修

`ExternalReferenceHandler.handleExternalReferenceRequest` 的 `path.join(storageRoot, fileName)`
（L113/L121）同样有遍历，但该 provider **在 module 里注册却未 export**（`exports` 仅
`I_EXTERNAL_REF_FACADE`）且无任何 controller 注入 → 不可达。按「不过度实现」原则记录不修（若日后
接线须先补 basename）。

### 19.3 观察项（低危，记录不修）

- **chunk 目录读路径未 basename**：`file-system.service.getChunkTempDirPath(hash)` =
  `join(tempPath, chunk_${hash})`、`upload-utility.checkChunkExistsInStorage` 同构，均不 basename，
  而 multer **写**路径已 basename（18）。`hash` 仅 `@IsString()`（预期为 MD5 32hex）。影响极小：读路径
  仅探测 `uploads/chunk_X/Y_X` 形态的受限路径（存在性/大小），非任意文件；实际写已 basename。记为
  一致性观察项，不修（避免再动 upload 模块 + 影响可忽略）。
- **filesystem-node.service.ts L124-130 预存破损 JSDoc**：`/**` 未闭合吞掉下一方法注释（纯注释、
  可编译）。预存、装饰性，按外科原则不修。

**回归测试**：新建 `external-reference-update.service.spec.ts` 3 例——`getExternalRefDownloadPath`
遍历 `../../../etc/passwd` → 候选路径全落 root 内且返回 null、合法 `A1.dwg` → 解析 `abc123/A1.dwg.mxweb`；
`checkExists` 遍历 → 目标路径落 root 内且返回 false。坑：`resetMocks:true` 会清空模块级
`mockResolvedValue`（`getExtRefDirName` 变 undefined → `path.join(root, undefined, …)` 抛 TypeError，
`access` 从未被调）→ 所有 mock 实现须在 `beforeEach`（reset 之后）重设；`fs/promises` 导出不可
`spyOn`（非 configurable）→ 用 `jest.mock('fs/promises', factory)` + `(fsPromises.access as jest.Mock)`。

**验证**：`pnpm jest external-ref external-reference-update` 2 suites / 16 tests 全绿；
`pnpm type-check` 0 错。spec 新文件 prettier-clean（已 `--write`）；两个 service 文件 HEAD 本就非
prettier-clean（大量预存长行漂移，我新增的 basename 行不在 diff 中），按约定不 `--write`。

## 20. backend users / roles — 头像端点路径遍历（**高危：@Public 未鉴权任意图片文件读**）——已修

**范围**：`users/*`（controller / service / avatar-extensions / user-crud / user-status /
user-password）、`roles/*`（controller / service / project-roles / project-permission /
prisma-permission-store）。

### 20.1 `serveAvatar`（@Public）+ `saveAvatarToDisk` 的 `id`/`userId` 直接拼路径——已修（basename）

| 方法 | 文件 | 鉴权 | 风险 |
|---|---|---|---|
| `serveAvatar(@Param('id'))` | users.controller.ts | **@Public 无鉴权** | `path.join(avatarDir, `${id}${ext}`)` → 任意图片文件读 |
| `saveAvatarToDisk(userId)` | users.service.ts | 管理员 `:id/avatar`（SYSTEM_USER_UPDATE） | 同构 → 任意路径写图片 |

**关键实证**：Express 5 的 `:id` 参数**会解码 `%2f`→`/`、`%5c`→`\`**（已用真实 express@5.2.1 起服务
验证：`GET /users/avatar/%2e%2e%2f%2e%2e%2fetc%2fpasswd` → `req.params.id = "../../etc/passwd"`）。
故 `id` 可含路径分隔符，`path.join(avatarDir, `${id}.png`)` 逃逸 avatarDir 读服务器上任意
`.png/.jpg/.jpeg/.gif/.webp/.jfif` 文件（`@Public` 无鉴权，比 16.1 的 filesData 任意读更直接）。

**修复**：`serveAvatar` 与 `saveAvatarToDisk` 各自 `try`/方法首行加 `id = path.basename(id)` /
`userId = path.basename(userId)`（basename 结果恒无 `/`/`\`，`join(avatarDir,…)` 必落 avatarDir 内；
合法 UUID 无分隔符，no-op）。与 16/17/18/19 同缺陷类、同修法。

**其余审查结论（无缺陷）**：
- 控制器鉴权完整：管理员端点全挂 `@RequirePermissions([SystemPermission.SYSTEM_USER_*])`，
  自助端点用 `req.user.id`（非用户可控）。
- `syncWechatAvatar` 的 SSRF 防护健全：`isWechatAvatarUrl` 强制 `https:` + hostname
  `endsWith('.qlogo.cn'|'.qpic.cn')`（`new URL` 正规解析）+ `redirect:'error'`（防 302 绕白名单）
  + 3s 超时。
- `roles/*` 纯 Prisma DB 操作，无 raw SQL / 路径构造 / 文件 IO；角色与权限管理端点全挂
  `SYSTEM_ROLE_*` 管理员权限，项目角色读走 `RequireProjectPermission`，`createProjectRole` 有
  #298 系统/项目端点隔离检查 → 无提权/注入/遍历面。

**回归测试**：`users.service.spec.ts` 加 1 例（`uploadAvatar` 遍历 `../../etc/passwd` → 落
`avatarDir/passwd.png` 而非外泄）；新建 `users.controller.spec.ts` 1 例（`serveAvatar('../secret')`
→ 404 且不 setHeader/write，avatarDir 外 secret.png 不被读出）。坑：`serveAvatar` 命中文件会
`createReadStream` 且 `fs.createReadStream` 不可 spyOn（非 configurable），真实流 pipe 到 mock res
不关闭 → Windows 文件锁致 afterEach `rmSync` ENOTEMPTY，故正向用例（真实出流）不入 spec，仅保留
遍历用例（throw 在开流之前，无 open handle）；controller 直接 `new`（绕过 class 级 Guards 的 DI）。

**验证**：`pnpm jest src/users` 7 suites / 48 tests 全绿；`pnpm type-check` 0 错。新 spec
prettier-clean（已 `--write`）；`users.controller.ts`/`users.service.ts`/`users.service.spec.ts`
HEAD 本就非 prettier-clean（预存长行漂移，我新增行不在 diff 中），按约定不 `--write`。

---

## 21. backend billing / backup / library / function-executor 四模块（无新缺陷）

四个模块逐一审查命令注入、路径遍历、IDOR、支付金额篡改、鉴权四类安全面，均未发现新缺陷。
结论性记录如下（本次审计「只修确实不对的点」——无缺陷即如实记录、不动代码）。

### 21.1 backup：`execFile`（非 `exec`）+ 全量白名单校验，无命令注入

- 唯一子进程出口 `backup.service.ts#exec` 用 `execFile(file, args, …)`——**args 以数组传递、
  不经过 shell**，天然免疫 shell 注入；`file` 与 `args` 全部来自服务端配置或严格校验。
- 17 个 `exec` 调用点逐一核实：`file` 均为 `pg_dump`/`pg_restore`/`psql`（`resolvePgDumpPath`
  三级探活：配置路径→runtime 内置→PATH 裸命令）或 `rsync`/`ossutil`/`aws`（`resolveRemoteCli`）
  或 `sshCommand()`（平台固定的 `ssh`/`ssh.exe`）——**无一来自用户输入**。
- `args` 里唯一「半用户可达」的两类输入都加了白名单：
  - 备份文件名 `BACKUP_FILENAME_PATTERN = /^cloudcad-\d{8}-\d{6}\.dump$/`（`deleteBackup`/
    `pushRemote`/`listBackups` 三处入口全校验），且 `deleteBackup` 再加 `startsWith(dir+sep)`
    前缀二次校验（双重防护）——文件名不可能含 `/`/`\`/`..`。
  - 演练行数统计的表名 `IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/`（`countTable`/
    `countTableOnDb` 校验后 `SELECT COUNT(*) FROM "<table>"`，防 SQL 注入）。
- 远端轮转命令（`rotateRemoteRsync`）经 `shellSingleQuote`（POSIX 单引号 + `'\''` 转义）包裹
  远端路径与文件名，远端 shell 侧亦无注入面。
- 控制器 `backup.controller.ts` 类级 `@UseGuards(RolesGuard, PermissionsGuard)` +
  `@RequirePermissions([SystemPermission.SYSTEM_ADMIN])`；`backup.scheduler.ts` 纯调度/告警/
  任务注册，无路径/命令/用户输入面。

### 21.2 library：`filesData/*path` 委托给已防御的共享 handler

- `library.controller.ts` 两个 `@Public()` 通配路由 `drawing/filesData/*path` 与
  `block/filesData/*path` 把 URL 路径段拼成 `filename` 后调 `libraryService.serveFile`，
  后者委托 `MxcadFileHandlerService.serveFile` → `FileUtils.resolveWithinRoot(filesDataPath, …)`
  （resolve 后 `startsWith(root+sep)` 前缀校验，逃逸即 400）——即 17/19 节已修并复用的
  单一 containment helper，library 侧无独立遍历面。
- `downloadNode`/`serveLibraryThumbnail` 走 DB 的 `nodeId`/`node.path`（服务端托管的
  fileSystemNode 记录 + `storageManager.getFullPath`），非用户可控路径。
- 写端点（save/save-as/folders/delete/rename/move/copy/batch-*）全挂
  `@RequirePermissions([LIBRARY_DRAWING_MANAGE | LIBRARY_BLOCK_MANAGE])` + `PermissionsGuard`。

### 21.3 function-executor：纯编排，无进程派生面

- `process-pool.executor.ts` 只做限流（`RateLimiter`）+ 任务存储 + 状态跟踪，实际 spawn 在
  `mxcad-exec.ts`（AGENTS.md 已记录 `windowsVerbatimArguments` 处理，属 mxcad 模块非本模块）。
- `http-conversion.executor.ts` 走 `ConversionServiceClient`（HTTP，URL 来自配置
  `http://localhost:3100`）；`cloud-faas.executor.ts` 走云厂商 SDK（huawei/aliyun/aws provider）。
  三者均无 `child_process`/`execFile`/`spawn`，无命令注入面。

### 21.4 billing：IDOR 全限定 + 金额服务端派生 + webhook 签名

- **IDOR**：用户侧订单方法（`queryOrder`/`repayOrder`/`refreshOrder`/`mockScan`）统一模式
  `findUnique({ where: { orderNo } })` → `if (order.userId !== userId) throw NotFoundException`
  ——按登录用户限定，无法越权查/操作他人订单。webhook 路径（`findUnique({orderNo})` 无 userId）
  是合理例外：微信服务端回调，走 `WechatIpGuard`（IP 白名单）+ 签名校验，非用户入口。
- **金额篡改**：`createOrder` 的 `amount` 服务端派生
  `Math.round(vipTier.baseMonthlyPrice × durationPricing.multiplierBps × durationPricing.months / 10000)`；
  用户只传 `vipTierId`/`durationPricingId`，且经 `findUnique` + `isActive` 校验后取 DB 记录字段，
  价格不来自请求体 → 无改价面。
- **限流**：下单端点 `@Throttle({ default: { limit: 5, ttl: 60000 } })` +
  `accountRateLimitService.checkLimit('order_create', userId)` 双限流（ADR-0066 / 等保 8.1.4.1）。
- **证书读取**：`wechat-pay.gateway.ts` 的 `fs.readFileSync(certPath/keyPath)` 路径来自
  `configService.get('wechatPay.certPath'/'keyPath')`（服务端配置，非用户输入）。
- **管理端**：`admin/billing/*` 类级 `@UseGuards(PermissionsGuard)` + 逐路由
  `@RequirePermissions([SYSTEM_BILLING_READ | SYSTEM_BILLING_WRITE])`。

---

## 22. backend runtime-config / fonts / notice-center / admin / ip-blacklist / user-cleanup / alert 七模块（无新缺陷）

逐一审查命令注入、路径遍历、SQL 注入、IDOR、鉴权、时序侧信道、SSE 凭据七类安全面，
均未发现可利用缺陷。结论性记录如下。

### 22.1 fonts：上传 basename + 下载三重拒绝 + 删除不可逃逸（含实证）

- 上传 `uploadSingleFont`：`fileName = path.basename(rawName)`（basename 剥离路径段，
  `join(fontsDir,…)` 必落目录内）→ 写盘安全。
- 下载 `downloadFont`：拒绝 `..` / `/` / `\` 三者（L354-361）→ 完整。
- 删除 `deleteFont`：只拒 `..` / `/`（L289），**漏 `\`**。经实测证明**不可利用**：
  - Windows 下 `path.join(dir, 'C:\\Windows\\system32')` → `dir\C:\Windows\system32`
    （盘符 `C:` 被当作字面目录段，**不产生绝对路径**，仍落 dir 内）；
  - UNC `\\server\share` → `path.join` 归一化为相对路径，落 dir 内；
  - **唯一逃逸原语是 `..`，而 deleteFont 已正确拒绝**（`..\evil`/`../evil`/`a\..\..\x` 全含 `..`）。
  - 实测脚本（node `path.join`/`path.resolve`）对 9 类输入逐一验证：所有 `passesDelete=true`
    的输入 `escapes=false`。
  - 结论：`\` 遗漏是**防御纵深不一致**（downloadFont 更严）而非真实漏洞，按「不修确实没
    问题的点」原则记录为无缺陷、不改代码。

### 22.2 admin：`$queryRaw` 仅内插枚举常量 + 日期格式校验，无 SQL 注入

- `admin-stats.service.ts` 所有 `$queryRaw`/`Prisma.sql` 内插值均为 `OrderStatus.*` 枚举常量
  （非用户输入）；用户可控的 `provider`/`tierId` 走 `Prisma.sql` tagged template（参数化绑定，
  非字符串拼接）；`startDate`/`endDate` 经 `DATE_PATTERN`（YYYY-MM-DD）校验后转 `Date` 对象。
- 控制器类级 `@RequirePermissions([SystemPermission.SYSTEM_ADMIN])`。

### 22.3 notice-center：SSE 一次性 ticket 教科书级实现

- `issueTicket` 需 JWT 登录 + `@Throttle(60/min)`；ticket = `randomBytes(24).toString('base64url')`
  （192 bit 熵，不可猜）。
- `redeemTicket` 用 `redis.getdel(prefix+ticket)`——**原子取删**，一次性消费无 get/del 竞态，
  过期/已用返回 null → 401。TTL `NOTICE_TICKET_TTL_SECONDS`（5 分钟）。
- 公开读 `GET /notices/current` 只返回广播通知（未登录无个人通知）；写端点全挂
  `SYSTEM_CONFIG_WRITE`；管理列表 `SYSTEM_CONFIG_READ`。

### 22.4 ip-blacklist：分层 IP 提取 + 正确 CIDR 匹配

- 管理端 `admin/ip-blacklist/*` 全挂 `SYSTEM_IP_BLACKLIST_MANAGE`。
- 全局 `IpBlacklistGuard` 用 `getClientIp`（XFF 优先）——**文档明确的 fail-open 设计**（仅用于
  黑名单/限流等次要防线）；真正安全边界（管理员登录 IP 白名单）用 `getAdminClientIp`（取
  socket 真实对端，仅命中可信代理段时才取 XFF 最右项，直连伪造 XFF 无效）→ 分层正确。
- `isBlocked`：Redis 缓存优先 → DB 兜底，fail-open（有文档）；过期条目惰性删除 +
  `expiresAt > now` 判定。
- `ip-blacklist.utils.ts` CIDR 匹配：`parseCidr` 要求网络位对齐（`(value & mask) !== 0 → null`
  防手滑封错段）、`cidrContains` 版本一致 + 位掩码比对、`::ffff:a.b.c.d` 归一为 IPv4、
  `prefixMask` 对 /32//128 用 `~0n`（全 1）正确。

### 22.5 runtime-config：`:key` 白名单校验

- `:key` 参数经 `RUNTIME_CONFIG_DEFINITIONS` 白名单校验（未知键 `BadRequestException`），
  非路径拼接 → 无注入面。
- `@Public()` 仅 `GET /runtime-config/public`（运行时公开配置，设计如此）；读/写/重置端点全挂
  `SYSTEM_CONFIG_READ` / `SYSTEM_CONFIG_WRITE`。

### 22.6 user-cleanup / alert：全限定 + 时序安全内部密钥

- `user-cleanup/*` 类级 `SYSTEM_USER_DELETE`；`alert/*` 类级 `SYSTEM_MONITOR`。
- `internal-alert`（宿主机运维脚本入站）`@Public()` + `InternalSecretGuard`：
  `isInternalServiceSecretValid` 用 `crypto.timingSafeEqual` + 长度预检（防时序侧信道），
  **fail-close**（服务端未配 secret 一律拒绝，未配密钥不向全网开放告警注入入口）。

---

## 23. backend 剩余模块（audit/common/config/cooperate/database/health/ip-whitelist/metrics/notification/ownership/redis/security/task-run/storage-management/cache-architecture/assets，无新缺陷）

对 backend 全部剩余模块做收尾扫描：raw SQL 注入、路径遍历、命令注入、WebSocket 鉴权、
邮件注入、控制器鉴权。均未发现可利用缺陷。

### 23.1 audit：`month` 服务端派生，raw SQL 参数化

- `audit-archive.service.ts` 的 `month` 全部来自 `log.createdAt.toISOString().slice(0,7)` 或
  PG `to_char("createdAt",'YYYY-MM')`——**结构上恒为 `YYYY-MM`**（4 位数字+连字符+2 位数字），
  不可能含路径分隔符或 SQL 载荷；`$queryRaw` 只内插 `${cutoff}`（Date，参数化）。
- `path.join(archivePath, `${month}.csv`)` 中 `month` 无分隔符，`archivePath` 来自 config →
  无遍历。哈希链（#420）`SHA-256(${month}|${sha256}|${prevHash})` 纯内存字符串，无注入面。

### 23.2 common：`resolveStoragePath` 仅 version-control 消费且已 `validatePath` 守卫

- `FileUtils.resolveStoragePath`（`path.resolve(baseDir, storagePath)`，本身不做 containment）
  全仓仅 2 个调用方，均在 `mx-version-control.provider.ts`（`getFileHistory` L826 /
  `getFileContentAtRevision` L1066），且两处**先调 `FileUtils.validatePath(filePath, filesDataPath)`**
  （containment 校验）再 resolve → 无遍历（印证 §13）。
- `ancestor-query.service.ts` 的 `$queryRaw`（递归 CTE，`depth < 50` 上界）内插
  `${uniqueIds}::text[]`（参数化数组）+ `${deletedFilter}`（固定 `Prisma.sql`/`empty` 片段）→
  无注入。
- `resolveWithinRoot`（L393）为 16/17/18/19 复用的单一 containment helper，本身健壮。

### 23.3 控制器鉴权全覆盖

- conversion-monitor / cache-monitor / metrics（`MetricsAccessGuard`）/ task-run（`SYSTEM_MONITOR`
  + `SYSTEM_ADMIN`）/ security（`SYSTEM_IP_WHITELIST_MANAGE`）/ ip-whitelist
  （`SYSTEM_IP_WHITELIST_MANAGE`）均类级或逐路由挂 `PermissionsGuard`/`RolesGuard` + 系统权限。
- `health` 仅 `live` 端点 `@Public()`（健康检查设计如此，不暴露数据），详细端点 `SYSTEM_MONITOR`。

### 23.4 cooperate：WebSocket 鉴权与 JwtStrategy 对齐

- `cooperate-auth.service.ts#authenticateJwt`：`jwt.verify(token, jwtSecret)` + **仅接受 access
  token**（拒 refresh token）+ `TokenBlacklistService` 黑名单校验，逻辑与 `JwtStrategy.validate`
  对齐 → 无 token 伪造/越权面。

### 23.5 notification：Nodemailer 内置头部清洗

- `email.service.ts` 走 `@nestjs-modules/mailer`（Nodemailer）：`subject` 含告警元数据
  （`input.title`/`source`/`messageKey`，服务端生成非用户原始输入），Nodemailer 默认对头部字段
  的 `\r\n` 做清洗（防 header 注入）；模板 `context` 变量经模板引擎默认转义 → 无邮件注入/HTML 注入。

### 23.6 纯内部服务（无 HTTP 面）

- database（`$queryRaw SELECT 1` 健康检查，无内插）、redis（连接管理）、config（`PROJECT_ROOT`
  + config 路径 `path.resolve`）、assets 均无用户输入面。
- `storage-management/FileCopyService` 的 `copyFile`/`copyDirectory`/`deleteDirectory` 全仓**无外部
  调用方**（仅模块注册）——属孤儿代码（AGENTS.md 反模式，架构问题非安全缺陷），按「不删既有
  死代码」原则记录不处理。
- `ownership` 为空壳模块（#228，AGENTS.md 已登记），无逻辑。

---

## 24. frontend + frontend_mobile（无新缺陷）

两个前端审查 XSS、token 存储、路由守卫、开放重定向四类安全面，均未发现可利用缺陷。

### 24.1 frontend（React）：无 XSS 向量 + 路由守卫正确 + token 双模

- **XSS**：全仓**无 `dangerouslySetInnerHTML`**（React 自动转义插值，主向量不存在）。仅有的
  两处 `innerHTML`/`document.write`：
  - `mxcadCheck.ts:90` `dialog.innerHTML` 只插值 i18n 静态串 `${t('发现相同文件')}`，用户可控
    文件名经 `escapeHtml(filename)`（L146）转义 → 安全。
  - `annotation.ts:231` `newWindow.document.write('<img src="' + imageData + '"/>')`：`imageData`
    是 CAD 引擎 `createCanvasImageData` 生成的 base64 data URL（引擎产物非用户文本；base64 字符集
    `[A-Za-z0-9+/=]` 无 `"`/`<`/`&`，无法逃逸 `src` 属性），且落在 `window.open()` 独立弹窗
    （爆炸半径小）→ 低风险观察项，非缺陷。
  - `utils/sanitize.ts` 的 `escapeHtml`（纯字符串替换，无 DOM 依赖）在 5 处用于用户可控串。
- **路由守卫**：`App.tsx` 的 `ProtectedRoute` 用 `useAuth()` 等 token 校验（`loading` 感知，
  避免 reload 闪烁重定向），`!isAuthenticated` 才 `Navigate` 登录 → 无加载期绕过。
- **token 存储**：文档化双模——浏览器 httpOnly cookie 为主（CSRF 受控），桌面 EXE 用
  localStorage Bearer token 兜底（非 cookie 无 CSRF 面，`clientSetup.ts`/`tokenRefresh.ts`
  注释明确说明）。`AuthContext` 初始化后异步 `authControllerGetProfile` 验证，本地过期 token
  直接降级游客不发起请求，10s 超时防 API 挂起卡死。

### 24.2 frontend_mobile（Vue）：无 v-html + 路由守卫含开放重定向防护

- **XSS**：全仓**无 `v-html`**（Vue 自动转义插值，主向量不存在）。
- **token 存储**：`useAuthState.ts` 用 localStorage 存 accessToken/refreshToken/user——移动
  H5/WebView 无 httpOnly cookie 场景，localStorage 是标准机制。
- **路由守卫**：`router/index.ts#beforeEach`——`hasValidToken()`（纯 JWT exp 客户端门控，
  真鉴权在服务端 API）；已登录访问认证页跳回 redirect 目标，**开放重定向防护**
  `redirect.startsWith('/') && !redirect.startsWith('//')`（防 `//evil.com` 协议相对跳转），
  非法回落 `/shell`；未登录访问需登录子页跳 `/login?redirect=to.fullPath`。

---

## 25. 公共包（mxVersionTool/impl-mx）+ 前端 API 规范 + backend shell-exec 收尾（无新缺陷）

### 25.1 前端 API 调用规范：正确遵守（无 fetch 直连后端）

- 全仓 `fetch(` 扫描，真实调用仅 3 处，全属 AGENTS.md 允许的例外：
  - `config/getConfig.ts`——通用配置加载器，**ADR-0034 豁免清单**（加载任意配置 URL，非后端 API，
    注释明确）。
  - `constants/appConfig.ts` `fetch(BRAND_CONFIG_URL)`——config-service(3002) 品牌配置（logo 等
    静态资源），非后端 API。
  - `services/mxcadManager/cmd/insertImageCommand.ts` `fetch(img.url)`——图片 URL（非 JSON 资源，
    AGENTS.md 例外）。
- 其余 `refetch()` 均为 React Query 的 `refetch` 函数（误报）。后端 API 一律走 `@/api-sdk`。

### 25.2 mxVersionTool：CLI 包装全走无 shell 执行器，shell 执行器是死代码

- `mx-executor.js` 三个执行器：`executeCommand`（`exec`，**经 shell**）、`executeSpawn`（`spawn`，
  args 数组）、`executeExecFile`（`execFile`，args 数组）。
- 全仓（含 backend）**`executeCommand` 零调用方**——死导出，无命令注入面。
- 实际 CLI 包装全部走无 shell 执行器：`mximport.js`→`executeSpawn`、`mxcat.js`→`executeExecFile`、
  `mxlog.js`→`executeSpawn`；args 以**数组**构造（`['import', importPath, repoUrl]`），各值独立元素，
  即使 `filePath`/`repoUrl`/`username` 含 shell 元字符也按字面传递、无 shell 解释 → 无注入。
- backend 的 `*Async`（`promisify(mxImport/mxCat/mxLog)`）即这些包装，安全。
- 观察项（非缺陷）：`mxcat.js` 用 `--password <明文>` 数组参数（进程列表可见），`mxlog.js` 用
  `--password-from-env`（更优）——属进程可见性差异，非命令注入，本地服务端进程，不处理。

### 25.3 backend shell-based `exec`/`execSync` 三处：内插值均被结构/config 约束，无注入

- `storage-management/disk-monitor.service.ts`（`execSync`）：`df -k "${drivePath}"` 的
  `drivePath` 恒为 `path.parse(resolvedPath).root`（驱动器根 `D:\`/`/`，结构上无 shell 元字符）；
  `resolvedPath` 来自 config（`filesDataPath`/`exportDir`）非用户输入。WMIC/PowerShell 分支同理。
- `mxcad/infra/linux-init.service.ts`（`execAsync`）：`pgrep`/`pkill` 静态命令；`chmod`/`mkdir`
  插值 `mxcadBinPath`/`mxcadDir`/`mxSoPath`/`localeTargetPath` 全来自 config（`mxcad.assemblyPath`
  或硬编码 runtime 路径）非用户输入。
- `mxcad/infra/thumbnail-generation.service.ts`（`execAsync`）：`cmd` = config 工具路径
  `dwg2JpgPath` + 服务端生成的临时参数文件名（`Date.now()` + `Math.random()`），无用户输入。
- 结论：虽经 shell，但内插值要么是静态命令、要么是 config 路径、要么是结构约束值（驱动器根）、
  要么是服务端生成的随机名，**无一来自用户可控输入** → 无命令注入。

### 25.4 impl-mx：私有实现包，无进程派生面

- 全包 grep `spawn`/`execFile`/`child_process` 零命中——纯 TS 实现包（`IMPL` 动态加载），
  无命令注入/路径遍历面。
