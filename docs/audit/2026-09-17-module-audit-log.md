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
