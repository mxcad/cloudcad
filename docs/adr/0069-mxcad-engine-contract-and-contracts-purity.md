# mxcad 两级参数契约收进 @cloudcad/contracts + 纯函数式契约准入标准

**Status**: accepted

ADR-0064 固化了「HTTP 用 camelCase、低层二进制用 lowercase」的两级参数契约，并把命名翻译的职责收在 conversion-service 的 `MxcadRunner._buildParam` 一处。但实践里同一份翻译被**手写了两遍**（backend 进程内 spawn 分支 + conversion-service runner），backend 的转发分支又**手写了一份字段枚举**，conversion-service 的 `CONTENT_KEY_FIELDS` 再**手写第三份清单**。这导致两次生产故障，且每次改字段都要人肉同步 3-4 处。

## 问题

1. **721fe02 回归（漏抄 6 字段）**：`forwardViaExecutor` 把进程内 `param` 重构为 camelCase `serviceParam` 时，手写枚举漏抄 `bd_pt1_x` / `bd_pt1_y` / `bd_pt2_x` / `bd_pt2_y` / `open_file_md5` / `create_clip_block`。conversion-service 模式下 `cut_dwg` / `print_to_pdf` 拿不到裁剪框，引擎缺区域信息静默返回 `{"message":"false"}`（**字符串 false**，不是布尔）。
2. **721fe02 动因崩溃（误发 lowercase）**：转发分支曾误发低层 `srcpath`/`src_file_md5`，runner 读 camelCase `srcPath` 恒 `undefined` → `_resolvePath` 返回 `undefined` → `.replace` 抛 `Cannot read properties of undefined` → 节点被删、图纸打不开。
3. **判定条件悄悄不一致**：进程内分支对 `outname`/`cmd`/`width`/`height`/`colorPolicy`/`outjpg`/`layout_name` 用 **truthy** 判断、对 `roate_angle`/`view_angle`/`dwgVersion`/`bd_pt*`/`open_file_md5`/`create_clip_block` 用 **`!== undefined`**（`0` 是合法角度、`false` 是合法 `create_clip_block`）。runner 与转发分支各自复刻这套 if/else，其中转发分支的 `bd_pt*` 用 truthy、`create_clip_block` 用 `!== undefined`——同一字段在不同路径判定不同。
4. **`printToPdf` 死联合成员**：`ConversionTaskType` 含 `'printToPdf'`，全仓零构造点（PDF 走 `convertFile` + `cmd: 'print_to_pdf'`），却让每个 executor 的 `switch` 多一个必须穷尽的分支。
5. **`params: Record<string, unknown>`**：任务参数无类型，只能靠 `as never` / `params['x'] as string` 手工断言，字段漂移编译期无声。

## 决策

### 一、契约进 `@cloudcad/contracts`

新增 `packages/contracts/src/conversion/mxcad-engine-contract.ts`，两个消费者（`backend` + `conversion-service`）共用：

| 导出                                                                | 作用                                                      |
| ------------------------------------------------------------------- | --------------------------------------------------------- |
| `ENGINE_INPUT_FIELDS`                                               | 引擎输入字段全集（camelCase），**唯一字段清单**           |
| `CONTENT_KEY_FIELDS`                                                | `= ENGINE_INPUT_FIELDS − { outpath }`，内容身份派生字段集 |
| `buildEngineParams(options)`                                        | camelCase 请求 → lowercase 引擎参数（**唯一命名翻译点**） |
| `parseEngineOutput(rawOutput)`                                      | 引擎原始 stdout → `MxCadConversionResult`                 |
| `ConversionRequest` / `MxCadEngineParams` / `MxCadConversionResult` | 两级形状类型                                              |

落地后 4 处手写映射 → 1 个 builder + 1 个 parser：

- backend `file-conversion.service.ts` 进程内 spawn：`buildEngineParams({...options, srcPath: absoluteSrcPath, compression})`（替代约 65 行 if 分支）。
- backend `executeBinToMxweb` 进程内 spawn：`buildEngineParams({srcPath, outpath, outname})`（路径归一化也在 builder 内完成）。
- conversion-service `MxcadRunner._buildParam`：`buildEngineParams` 生成后只覆写 `srcpath`/`outpath`（本机 cwd 绝对化）。
- 三处 `lastIndexOf('{"code"')` + `JSON.parse` → `parseEngineOutput`。

### 二、派生规则（铁律）

`CONTENT_KEY_FIELDS` **必须是派生量**，禁止再手写第二份清单：

```ts
const NON_CONTENT_FIELDS = ['outpath'] as const;
export const CONTENT_KEY_FIELDS = ENGINE_INPUT_FIELDS.filter(
  (field) => !NON_CONTENT_FIELDS.includes(field)
);
```

`outpath` 排除的理由：它是输出目录、不改变转换产物内容，却会随部署路径变化；进 content key 会让同一图纸在不同输出目录被判为不同内容，破坏去重。

配套约束：新增引擎字段时**只改 `ENGINE_INPUT_FIELDS` 一处**，`CONTENT_KEY_FIELDS` 自动跟随；若新字段不应参与内容身份，加进 `NON_CONTENT_FIELDS` 并在此处说明理由。

### 三、`ConversionTask` 改判别联合，删 `printToPdf`

```ts
export type ConversionTask = {
  id: string;
  priority: TaskPriority;
  createdAt: Date;
} & (
  | { type: 'convertFile'; params: ConversionOptions }
  | {
      type: 'convertBinToMxweb';
      params: { srcPath: string; outpath: string; outname: string };
    }
  | {
      type: 'generateBinFiles';
      params: { mxwebPath: string; nodeName: string };
    }
);
```

`process-pool.executor.ts` 的 `switch (task.type)` 逐分支拿到强类型 `params`，`as never` 与 `params['x'] as string` 全部删除。`forwardViaExecutor` 只传「convertFile | convertBinToMxweb」两元子集、`param` 类型为 `ConversionRequest`，因两分支 `params` 形状不同无法静态对应，整任务一处 `as ConversionTask`（运行期字段由 builder 保证）。

副作用（已知且接受）：测试夹具里 `{ ...默认值, ...overrides }` 的展开会丢失 `type`/`params` 关联，无法直接赋值回 `ConversionTask`，三个 executor spec 的 `makeTask` 改用一处 `as ConversionTask`。

### 四、contracts 纯度准入标准

ADR-0026 原本要求 contracts 只放 interface + token。本 ADR 将其扩展为：允许**纯函数式契约**，但必须同时满足四条：

1. **纯 TypeScript，不引入新外部依赖**（既有依赖 `@cloudcad/db` 除外——`system-role.types.ts` / `project-role.types.ts` 取 Prisma 枚举值早已使用）。
2. **无 `node:*`、无框架 import**（`@nestjs/*` / `reflect-metadata` / `class-validator` / `class-transformer`）、**无 IO、无副作用**（禁 `require(`、动态 `import(`、`fetch(`、`process`、`globalThis`）。
3. **被 ≥2 个独立包消费**（沿用 ADR-0026 契约先行铁律）。
4. **逃逸口**：一旦需要 IO 或框架能力，**迁到独立包**，不得就地扩展。

可执行门禁：`packages/contracts/scripts/scan-purity.js`（`pnpm --filter @cloudcad/contracts scan:purity`）白名单扫描 `src/` 全部 `.ts`，命中即 exit 1。`@cloudcad/contracts` 同时新增 `type-check` script（此前只有 build，无法只校验不产出）。

### 五、部署链路影响

`@cloudcad/conversion-service` 从「0 运行时依赖」变为依赖 `@cloudcad/contracts`。部署/升级包的 `pnpm install --filter ... --prod` 若不含 conversion-service，就不会为它建立 `packages/conversion-service/node_modules/@cloudcad/contracts` 的 workspace 链接，`dist/server.js` 的 `require('@cloudcad/contracts')` 解析失败 → 3100 端口无监听 → `verify-deploy` 健康检查失败。已补三处 filter 清单：

- `scripts/pack-offline.js` `getDeployStoreInstallFilter`（部署 store 与离线预演共用）
- `runtime/scripts/setup-offline.js` `runPnpmInstallOffline`
- `runtime/scripts/verify-deploy.js`（**这也是断网验证硬门禁本身**——它必须先能装好依赖，才谈得上验证；门禁没有被自己的安装清单挡死）

`runtime/docker/Dockerfile.linux-deploy` 与本就不含 conversion-service 的 `docker/Dockerfile`（仅 backend 镜像）无需改动。

`packages/conversion-service/package.json` 新增 `dependencies: { "@cloudcad/contracts": "workspace:*" }` 与 `prebuild`（先 build contracts）；backend 的 `prebuild` 已含 contracts，无需改。

## 为什么

- **单一事实源**：字段清单、字段翻译、判定条件、输出解析只有一份。721fe02 类「重构漏抄」与「同一字段两套判定」从此没有产生空间。
- **满足 ADR-0026 核心判据**：`buildEngineParams` / `parseEngineOutput` 被 backend 与 conversion-service 两个独立包引用，正是「≥2 个独立包才进 contracts」的适用场景。
- **不动 HTTP 契约**：ADR-0064 的 camelCase 约定原样保留，`ConversionOptions` 字段与 OpenAPI schema 零变化（`pnpm generate:api-types` 后 `swagger_json.json` diff 为空）。
- **判定条件按 runner 口径统一**（runner 是 ADR-0064 固化的既有消费者）：`outname`/`cmd`/`width`/`height`/`colorPolicy`/`outjpg`/`layout_name` 用 truthy；`roate_angle`/`view_angle`/`dwgVersion`/`bd_pt1_x`/`bd_pt1_y`/`bd_pt2_x`/`bd_pt2_y`/`open_file_md5`/`create_clip_block` 用 `!== undefined`（`0` 是合法角度、`false` 是合法 `create_clip_block`，真值判定会误丢）。差异点：`bd_pt*` 与 `open_file_md5` 在 backend 进程内分支原先是 truthy，现统一为 `!== undefined`——仅当上游传**空字符串**这类退化值时行为不同（原丢弃、现透传），正常数值不受影响。
- 附带修掉一个潜在缺陷：backend 转发分支原本漏传 `createPreloadingData`，收敛后自动带上（与进程内分支一致）。

## 回归防护

- `packages/conversion-service/test/runner.test.ts`：缺 `code` 字段的 JSON 也算解析失败（不能当成 `code=undefined` 的成功）；`buildEngineParams` 的字段集与判定条件用例。
- `packages/conversion-service/test/content-dedup.test.ts`：`CONTENT_KEY_FIELDS ⊆ ENGINE_INPUT_FIELDS`；逐字段参数化断言「改该字段必变 key / 改被排除字段必不变 key」（且断言排除集非空）；两个仅 `bd_pt1_x` 不同的 `cut_dwg` 必须产出不同 key（721fe02 回归的直接反向断言）。
- `packages/backend/src/mxcad/conversion/file-conversion.service.spec.ts`：转发参数为 camelCase `srcPath` 而非 `srcpath`（ADR-0064 既有门禁）。
- `packages/contracts` `scan:purity`：contracts 纯度漂移即红灯。

## 已知边界

- 引擎字段 `width`/`height` 在 `ConversionOptions` 是 `string`、在 `ConversionRequest` 放宽为 `string | number`，`buildEngineParams` 内统一 `String(...)`。
- `fileHash` 缺失时 `src_file_md5` 写空串（与 runner 既有 `?? ''` 行为一致），而非省略该键。
- backend `file-conversion.service.ts` 使用 tab + 双引号（历史偏离 `.prettierrc` 的 `useTabs:false`/`singleQuote:true`），**不要对该文件跑 prettier**——会产生上千行假 diff。

## 关联

- ADR-0064（两级参数契约的命名约定）——本 ADR 把它从「文档约定」升级为「唯一实现」。
- ADR-0026（扩展机制总纲，契约先行规则）——本 ADR 扩展其「contracts 只放 interface + token」为「+ 纯函数式契约」，并已在该 ADR 排除项处加指针。
- ADR-0027（共享 Prisma Client）——contracts 经 `@cloudcad/db` 取 Prisma 枚举值是既有例外，本 ADR 明确保留。
- ADR-0060（转换并发与缓存）——`CONTENT_KEY_FIELDS` 的内容身份派生受本 ADR 的派生规则约束。
