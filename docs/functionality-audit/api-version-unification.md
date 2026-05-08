# API 版本前缀统一审计报告

## 审计日期
2026-05-08

## 审计范围
`packages/frontend/src` 目录下所有 TypeScript/JSX 文件中的 API 路径前缀

## 审计目标
确保所有前端 API 调用统一使用 `/api/v1/` 前缀，符合后端版本化管理要求。

## 检查结果

### 1. 硬编码 API 路径检查
使用正则 `/api/(?!v1/)` 搜索不带 v1 前缀的 `/api/` 路径，**未发现任何匹配**。所有显式拼接的 URL 均已正确使用 `/api/v1/`。

### 2. 注释中过时路径修正
在 `CADEditorDirect.tsx` 第614行的注释中，存在过时示例：
```
- null (项目文件): /api/mxcad/filesData/...
```
实际代码使用的是 `/api/v1/mxcad/filesData/...`，注释已更新为正确的路径格式。

### 3. `filesApi` 残余检查
搜索 `filesApi.` 方法调用，未发现任何残留。所有原 `filesApi` 的调用均已迁移至 `@/api-sdk` 中生成的类型安全客户端。

检查的引用文件包括：
- `services/mxcadManager/index.ts` – 已使用新 SDK
- `services/mxcadManager/mxcadExtRef.ts` – 已使用新 SDK  
- `utils/libraryApi.ts` – 基于新 SDK 的 `client`
- `components/ProjectDrawingsPanel/*` – 已使用新 SDK
- `pages/CADEditorDirect.tsx` – 已使用新 SDK
- 测试文件中的旧类型定义不影响运行时

## 需修改的文件

| 文件 | 行号 | 修改类型 | 内容 |
|------|------|----------|------|
| `pages/CADEditorDirect.tsx` | 614 | 注释更正 | `/api/mxcad/filesData/...` → `/api/v1/mxcad/filesData/...` |

## 已完成操作
- [x] 修正 `CADEditorDirect.tsx` 第614行注释
- [x] 确认无其他硬编码 `/api/` 路径
- [x] 确认无 `filesApi` 残留调用

## 结论
前端 API 路径前缀已统一为 `/api/v1/`，符合预期。唯一过时注释已修正，无需其他代码改动。

## 相关 Commit
`refactor(frontend): unify API path prefix to /api/v1/`
