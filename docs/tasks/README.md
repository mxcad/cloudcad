# 外部参照上传功能 - 任务总览

## 项目概述

本项目为 CloudCAD 平台添加外部参照上传功能，允许用户上传 CAD 图纸所需的外部参照文件（DWG 和图片），确保图纸能够正常显示和编辑。

## 功能特性

- ✅ 自动检测缺失的外部参照
- ✅ 友好的用户界面和交互流程
- ✅ 支持立即上传或稍后上传（可选）
- ✅ 文件列表中显示缺失警告标识
- ✅ 支持随时上传外部参照
- ✅ 完整的错误处理和用户提示

## 任务列表

| 任务 | 描述 | 状态 | 预计工时 | 依赖 |
|------|------|------|----------|------|
| [001](./001-backend-get-preloading-data.md) | 后端 - 获取外部参照预加载数据接口 | ✅ 已完成 | 2h | - |
| [002](./002-backend-check-reference-exists.md) | 后端 - 检查外部参照文件是否存在接口 | ✅ 已完成 | 2h | 001 |
| [003](./003-backend-enhance-upload-validation.md) | 后端 - 增强上传接口验证 | ✅ 已完成 | 3h | 001, 002 |
| [011](./011-backend-external-reference-tracking.md) | 后端 - 文件系统外部参照跟踪 | ✅ 已完成 | 3h | 001, 002 |
| [004](./004-frontend-api-methods.md) | 前端 - 获取预加载数据 API 方法 | ✅ 已完成 | 1.5h | 001, 002 |
| [005](./005-frontend-use-external-reference-upload-hook.md) | 前端 - useExternalReferenceUpload Hook | ✅ 已完成 | 3h | 004 |
| [006](./006-frontend-external-reference-modal.md) | 前端 - ExternalReferenceModal 组件 | ✅ 已完成 | 2.5h | 005 |
| [007](./007-frontend-integrate-to-mxcad-uploader.md) | 前端 - 集成到 MxCadUploader | ⬜ 待开始 | 1.5h | 005, 006 |
| [008](./008-frontend-missing-reference-warning.md) | 前端 - 文件列表缺失外部参照提醒 | ⬜ 待开始 | 2.5h | 005, 006, 007, 011 |
| [009](./009-frontend-upload-anytime.md) | 前端 - 随时上传外部参照功能 | ⬜ 待开始 | 2h | 005, 006, 008 |
| [010](./010-integration-test.md) | 集成测试 | ⬜ 待开始 | 4h | 001-009 |

**总预计工时**：27 小时  
**已完成工时**：14.5 小时  
**剩余工时**：12.5 小时

## 任务依赖关系

```
001 (后端 - 获取预加载数据)
    ↓
002 (后端 - 检查外部参照存在性)
    ↓
├─→ 003 (后端 - 增强上传验证)
│       ↓
│   011 (后端 - 文件系统外部参照跟踪)
│       ↓
└─→ 004 (前端 - API 方法)
        ↓
    005 (前端 - Hook)
        ↓
    ├─→ 006 (前端 - Modal 组件)
    │       ↓
    │   007 (前端 - 集成到 MxCadUploader)
    │       ↓
    │   008 (前端 - 缺失警告) ← 依赖 011
    │       ↓
    │   009 (前端 - 随时上传)
    │       ↓
    └─→ 010 (集成测试)
```

## 执行顺序建议

### 第一阶段：后端实现（任务 001-003）

1. **任务 001**：实现获取预加载数据接口
   - 创建 DTO
   - 实现 Service 方法
   - 实现 Controller 接口
   - 编写单元测试

2. **任务 002**：实现检查外部参照存在性接口
   - 实现 Service 方法
   - 实现 Controller 接口
   - 编写单元测试

3. **任务 003**：增强上传接口验证
   - 增强 DWG 上传接口
   - 增强图片上传接口
   - 编写单元测试

4. **任务 011**：文件系统外部参照跟踪
   - 更新 Prisma Schema
   - 创建数据库迁移
   - 实现外部参照信息记录
   - 编写单元测试

### 第二阶段：前端基础（任务 004-006）

4. **任务 004**：实现 API 方法
   - 添加类型定义
   - 实现 API 方法
   - 编写单元测试

5. **任务 005**：实现 useExternalReferenceUpload Hook
   - 实现 Hook 逻辑
   - 实现状态管理
   - 编写单元测试

6. **任务 006**：实现 ExternalReferenceModal 组件
   - 实现组件 UI
   - 实现交互逻辑
   - 编写单元测试

### 第三阶段：功能集成（任务 007-009）

8. **任务 007**：集成到 MxCadUploader
   - 修改 MxCadUploader 组件
   - 集成 Hook 和 Modal
   - 测试集成效果

9. **任务 008**：实现文件列表缺失警告
   - 修改 FileItem 组件
   - 修改 useFileSystem Hook
   - 测试警告显示

10. **任务 009**：实现随时上传功能
    - 添加操作菜单选项
    - 实现快捷键支持（可选）
    - 测试功能完整性

### 第四阶段：测试验证（任务 010）

11. **任务 010**：集成测试
    - 编写后端集成测试
    - 编写前端集成测试
    - 编写 E2E 测试
    - 修复发现的问题

## 验收标准

### 功能验收

- [ ] 所有任务完成并通过测试
- [ ] 外部参照检测准确
- [ ] 上传功能稳定可靠
- [ ] 用户界面友好易用
- [ ] 错误处理完善
- [ ] 性能满足要求

### 质量验收

- [ ] 代码覆盖率 >= 80%
- [ ] 所有测试通过
- [ ] 无严重 bug
- [ ] 代码规范符合项目标准
- [ ] 文档完整准确

## 技术栈

### 后端

- **框架**：NestJS 11.0.1
- **语言**：TypeScript 5.7.3
- **测试**：Jest 30.0.0
- **文档**：Swagger (OpenAPI 3.0)

### 前端

- **框架**：React 19.2.1
- **语言**：TypeScript ~5.8.2
- **构建**：Vite 6.2.0
- **测试**：Vitest 4.0.16 + Testing Library 16.3.1
- **样式**：Tailwind CSS 4.1.18

## 关键文件

### 后端文件

- `packages/backend/prisma/schema.prisma`
- `packages/backend/src/mxcad/dto/preloading-data.dto.ts`
- `packages/backend/src/mxcad/types/external-reference.types.ts`
- `packages/backend/src/mxcad/mxcad.controller.ts`
- `packages/backend/src/mxcad/mxcad.service.ts`
- `packages/backend/src/mxcad/services/file-conversion.service.ts`
- `packages/backend/src/mxcad/services/filesystem-node.service.ts`
- `packages/backend/src/mxcad/mxcad.service.spec.ts`
- `packages/backend/src/mxcad/mxcad.controller.spec.ts`
- `packages/backend/src/mxcad/services/file-conversion.service.spec.ts`
- `packages/backend/test/mxcad-integration.spec.ts`

### 前端文件

- `packages/frontend/types/api.ts`
- `packages/frontend/services/apiService.ts`
- `packages/frontend/hooks/useExternalReferenceUpload.ts`
- `packages/frontend/components/modals/ExternalReferenceModal.tsx`
- `packages/frontend/components/MxCadUploader.tsx`
- `packages/frontend/components/FileItem.tsx`
- `packages/frontend/hooks/useFileSystem.ts`
- `packages/frontend/test/integration/external-reference.spec.ts`
- `packages/frontend/test/e2e/external-reference.e2e-spec.ts`

## 注意事项

1. **代码规范**：遵循项目现有的代码规范和风格
2. **类型安全**：严格使用 TypeScript 类型，避免 any 类型
3. **错误处理**：所有 API 调用都应该有错误处理
4. **日志记录**：记录关键操作和错误信息
5. **性能优化**：避免不必要的重新渲染和 API 调用
6. **用户体验**：提供清晰的提示和反馈
7. **向后兼容**：不影响现有功能
8. **测试覆盖**：确保核心功能有充分的测试覆盖

## 风险和挑战

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| MxCAD 转换服务不稳定 | 高 | 充分测试，添加重试机制 |
| 大文件上传性能问题 | 中 | 使用分片上传，显示进度 |
| 外部参照检测不准确 | 中 | 多次验证，提供手动触发 |
| 用户界面复杂度高 | 低 | 简化流程，提供清晰指引 |
| 测试覆盖率不足 | 中 | 编写完整的单元测试和集成测试 |

## 成功标准

1. **功能完整性**：所有功能按照需求实现
2. **稳定性**：系统运行稳定，无崩溃和严重错误
3. **性能**：响应时间符合预期，用户体验良好
4. **可维护性**：代码清晰易懂，文档完整
5. **可扩展性**：架构设计支持未来扩展

## 相关文档

- [技术方案](../EXTERNAL_REFERENCE_UPLOAD_IMPLEMENTATION.md)
- [MxCAD 上传服务集成方案](../MXCAD_UPLOAD_INTEGRATION.md)
- [MxCAD 文件上传 API 文档](../API_UPLOAD_DOCUMENTATION.md)

## 联系方式

如有问题或需要帮助，请联系项目团队。

---

**文档版本**：v1.2  
**创建日期**：2025-12-29  
**最后更新**：2025-12-29  
**状态**：执行中（6/11 已完成，55%）