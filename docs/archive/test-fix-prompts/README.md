# 测试修复 Agent 任务分配

12 个失败的单元测试文件，分给 5 个 agent 并行修复。

## 运行测试命令

```bash
cd packages/backend
pnpm test:unit   # 只跑单元测试
```

## Agent 任务

| Agent | 文件 | 主要问题 |
|---|---|---|
| [1](1-filesystem-node.md) | `mxcad/node/filesystem-node.service.spec.ts` | Prisma 7 `count` API 变化 |
| [2](2-save-as-and-thumbnail.md) | `mxcad/save/save-as.service.spec.ts`<br>`mxcad/infra/thumbnail-generation.service.spec.ts`<br>`mxcad/core/mxcad.service.spec.ts`<br>`mxcad/core/mxcad.controller.spec.ts` | 文件路径 ENONT / mock fs 缺失 |
| [3](3-conversion-and-version-control.md) | `mxcad/conversion/file-conversion.service.spec.ts`<br>`version-control/version-control.service.spec.ts` | ProcessRunner / ConfigService / VERSION_CONTROL token mock 缺失 |
| [4](4-file-system-and-search.md) | `file-system/file-system.service.spec.ts`<br>`file-system/file-tree/file-tree.service.spec.ts`<br>`file-system/search/search.service.spec.ts` | IStorageProvider / StorageManager DI 缺失 |
| [5](5-project-permission-and-roles.md) | `roles/project-permission.service.spec.ts`<br>`roles/project-roles.service.spec.ts` | Prisma mock / PermissionService DI 缺失 |

## 每个 agent 的修复流程

1. 读 spec 文件 + 对应源文件的 constructor
2. 对照 constructor 补全 mock provide
3. 修复文件系统 / Prisma API 调用的 mock
4. 验证：`pnpm test -- --testPathPattern="<文件名>"`
