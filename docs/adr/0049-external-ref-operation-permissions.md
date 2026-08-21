# 0049 — 外部参照操作权限（External reference operation permissions）
**Status**: accepted

外部参照管理面板重构过程中，替换/上传/刷新/检查等写操作的权限门控实际已采用 `CAD_EXTERNAL_REFERENCE`（"管理外部参照"）权限，但该决策从未正式记录（原 wayfinder 地图与其 ticket 已删除）。本 ADR 将已实现的行为固化为正式决策，明确读/写两侧的权限边界、前端门控契约与移动端范围，防止后续变更失去依据。

**Decision**

1. **权限分两侧**：
   - **读侧**（xref 列表）：`getPreloadingData`（`GET /mxcad/preloading/:nodeId`）挂 `FILE_OPEN`——打开图纸即需加载 xref，不能因权限不足导致图纸无法打开。
   - **写侧**（管理操作）：全部挂 `CAD_EXTERNAL_REFERENCE`——`check-reference`、`refresh-external-references`、`up_ext_reference_dwg`、`up_ext_reference_image`（`external-ref.controller.ts`）、`download-external-ref`、`external-ref-view`（`mxcad-file-access.controller.ts`）。替换/上传/刷新/检查/下载/查看同属"管理外部参照"域，统一一个权限点。
2. **前端契约**：`useCadPermissions.ts` 提供 `canManageExternalRef = check(CAD_EXTERNAL_REFERENCE)` 语义（有单测锚定），`useFileItemProps.ts` 用它控制 xref 管理操作可见性；权限组中"管理外部参照"为可配置项，管理员可按角色授予/剥夺。
3. **默认继承**：`CAD_EXTERNAL_REFERENCE: ['FILE_OPEN']`——所有能打开图纸的成员**默认**可管理外部参照，管理员可单独剥夺。模型是"默认可用、可剥夺"而非"默认不可用、可授予"。
4. **移动端范围**：`frontend_mobile` 的 `extRefService.ts` 只消费读侧（preloading/check）+ 上传端点（dwg/image）——即"打开图纸加载 xref + 上传 xref"能力；**无面板 UI、无替换流程**。管理面板仅 PC。后续移动端若需替换能力，按本 ADR 权限模型直接复用，无需新权限点。
5. **已知权衡（记录不改）**：查看/下载端点（`external-ref-view`/`download-external-ref`）要求 `CAD_EXTERNAL_REFERENCE` 而非 `FILE_OPEN`——管理员手动剥夺该权限后，用户打开图纸时 xref 图片查看/下载会 403，但图纸打开与 xref 加载不受影响（读侧走 `FILE_OPEN`）。默认继承下不发生，接受此边界。
6. **无新增权限点**：复用现有 `CAD_EXTERNAL_REFERENCE`，无权限枚举变更、无 schema 变更、无 migration。

**Rejected options**

- **为替换操作新增独立权限点**（如 `CAD_EXTERNAL_REFERENCE_REPLACE`）：替换与上传/刷新/检查同属"管理外部参照"域，面板所有管理操作共用同一按钮组可见性，拆分权限面只增加维护成本、无现有消费者需要区分。
- **查看/下载降级为 `FILE_OPEN`**：xref 加载已由引擎 filesData 解析路径覆盖（ADR-0024 约束），`external-ref-view`/`download-external-ref` 是管理面操作；默认继承下无实际用户受影响，改动引入行为变化而收益为零。

**Status**: accepted

**Cross-references**
- ADR-0023 外部参照模块 module-local facade token
- ADR-0024 外部参照文件存储与路径的 mxcad 引擎耦合约束
- `packages/backend/src/mxcad/external-ref/external-ref.controller.ts`
- `packages/backend/src/mxcad/infra/mxcad-file-access.controller.ts`
- `packages/frontend/src/hooks/useCadPermissions.ts` / `constants/permissions.ts`
- `packages/frontend_mobile/src/services/extRefService.ts`
