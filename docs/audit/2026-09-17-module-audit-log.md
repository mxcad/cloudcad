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

**提交**：见本节末。
