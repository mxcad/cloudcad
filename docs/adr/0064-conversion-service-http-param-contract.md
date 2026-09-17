# conversion-service 两级参数契约：HTTP 用 camelCase，低层二进制用 lowercase

**Status**: accepted

backend 与 conversion-service 之间通过 HTTP 传递转换参数，而 conversion-service 内部再把这些参数转成 mxcadassembly 二进制的命令行参数。这两层用的是**不同的字段命名**，且历史上曾因此产生一次生产崩溃（`Cannot read properties of undefined (reading 'replace')`，commit 721fe02 修复）。本 ADR 固化这个两级契约，避免再被误读。

## 决策

**HTTP API 契约是 camelCase 的 `ConversionOptions` 形状**，**不是** lowercase 的 mxcadassembly 参数形状。

- **HTTP 层（backend → conversion-service）**：字段用 camelCase——`srcPath` / `fileHash` / `createPreloadingData` / `dwgVersion` / `outname` / `cmd` / `width` / `height` / `colorPolicy` / `outjpg` / `compression` 等。类型定义见 `packages/backend/src/mxcad/interfaces/file-conversion.interface.ts` 的 `ConversionOptions`。
- **低层二进制（conversion-service → mxcadassembly）**：字段用 lowercase / 下划线——`srcpath` / `src_file_md5` / `create_preloading_data` / `outpath` / `outname` / `dwg_version`。这是一个 JSON 字符串单参，传给 `mxcadassembly`（见 `packages/conversion-service/mxcad-exec.ts` 注释 `{"srcpath":"..."}`）。**这是低层接口，不是 HTTP 契约。**
- **桥 = `buildEngineParams`**（`packages/contracts/src/conversion/mxcad-engine-contract.ts`，由 conversion-service 的 `MxcadRunner._buildParam` 与 backend 的 `file-conversion.service.ts` **共同调用**）：接收 HTTP 层的 camelCase 参数，构造低层二进制的 lowercase 参数。这是唯一做「camelCase → lowercase」翻译的地方——此前 4 处手写映射（backend 进程内 param、backend 转发 serviceParam、conversion-service runner、bin→mxweb）已收敛为 1 个 builder（ADR-0069）。

## 为什么

两个独立的 backend 调用方**都**发 camelCase，这是既成契约：

1. `packages/backend/src/mxcad/conversion/file-conversion.service.ts` 的 `forwardViaExecutor` 转发分支——发 camelCase 请求（721fe02 修复后；现由 `pickContractFields` 按 `ENGINE_INPUT_FIELDS` 唯一清单挑选字段，不再手写枚举）。
2. `packages/backend/src/batch-download/conversion-runner.ts` 的 `WorkflowConvertTask`（`{ id, srcPath, fileHash, outname, width?, height?, colorPolicy?, dwgVersion? }`）→ `submitBatch` POST `/v1/conversions/batchConvert`。

conversion-service 侧也按 camelCase 消费：`routes/conversions.ts` 的 `submitConvertTask` 原样接收 `body.params`（`params = body.params`），batch 校验检查 `t.srcPath`（camelCase）；内容身份派生字段集 `CONTENT_KEY_FIELDS` 现由 `@cloudcad/contracts` 派生（`= ENGINE_INPUT_FIELDS − outpath`），与 runner 透传给引擎的参数同源（ADR-0069）。

**动因 bug（721fe02）**：`forwardViaExecutor` 转发分支曾误发**低层二进制的 lowercase 参数**（`srcpath`/`src_file_md5`），而 conversion-service 的 `MxcadRunner` 读的是 camelCase `srcPath` → `undefined` → `_resolvePath` 返回 `undefined` → `.replace` 崩溃 → 节点被删、图纸打不开。修复方向是把转发分支改回 camelCase `ConversionOptions`（低层 lowercase 参数只该由 `MxcadRunner._buildParam` 在 conversion-service 内部构造）。

## 命名细节（避免再困惑）

HTTP 层字段**以 camelCase 为主，但混有少量 snake_case 直通字段**（`roate_angle` / `view_angle` / `layout_name`）——这些字段名恰好与低层二进制参数同名，`_buildParam` 原样透传、不重命名。需要重命名的只有几个身份字段：

| HTTP 层（camelCase） | 低层二进制（lowercase） | 桥的处理 |
|---|---|---|
| `srcPath` | `srcpath` | 重命名 + 绝对化 + 反斜杠归一 |
| `fileHash` | `src_file_md5` | 重命名（无 `outpath` 时） |
| `createPreloadingData` | `create_preloading_data` | 重命名，默认 `true` |
| `dwgVersion` | `dwg_version` | 重命名 |
| `outpath` | `outpath` | 直通（bin→mxweb 方向） |
| `outname` / `cmd` / `width` / `height` / `colorPolicy` / `outjpg` / `roate_angle` / `view_angle` / `layout_name` / `compression` | 同名 | 直通 |

**记忆锚点**：看到 lowercase `srcpath` / `src_file_md5`，那是**低层 mxcadassembly 二进制接口**；看到 camelCase `srcPath` / `fileHash`，那才是 **backend ↔ conversion-service 的 HTTP 契约**。两者之间由 `MxcadRunner._buildParam` 桥接。

## 回归防护

`packages/backend/src/mxcad/conversion/file-conversion.service.spec.ts` 有回归用例断言转发参数为 camelCase `srcPath`（非 `srcpath`）；`packages/conversion-service/test/runner.test.ts` 的 `MxcadRunner._buildParam` 用例断言 camelCase 输入 → lowercase 输出的翻译正确。改动任一层字段命名时，这两个测试会同时报警。

## 关联

- ADR-0014（conversion-service 抽取 + HTTP 路由契约 + `FUNCTION_EXECUTOR` 三模式）——本 ADR 补充其「API 契约」一节未覆盖的**参数字段名**维度。
- ADR-0060（转换并发与缓存）——`CONTENT_KEY_FIELDS` 的内容身份派生依赖本契约的 camelCase 字段。
