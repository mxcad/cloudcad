# Version-Control 模块 API 差异报告

## 对比范围
- **基准分支**: `main` (重构前，实现质量差，但包含所有端点)
- **对比分支**: `refactor/circular-deps` (重构后，实现更好，但功能缺失)

## 端点清单对比

### Main 分支 (`main`)

| 方法 | 路径 | 描述 | 权限 | 实现方法 |
|------|------|------|------|----------|
| GET | `/version-control/history` | 获取节点的 SVN 提交历史 | `VERSION_READ` | `getFileHistory` |
| GET | `/version-control/file/:revision` | 获取指定版本的文件内容 | `VERSION_READ` | `getFileContentAtRevision` |
| GET | `/version-control/list/:revision` | 列出指定版本目录内容 | `VERSION_READ` | `listDirectoryAtRevision` |
| GET | `/version-control/content/:revision` | 获取指定版本文件内容 (与 `/file/:revision` 重复) | `VERSION_READ` | `getFileContentAtRevision` |

### 当前分支 (`refactor/circular-deps`)

| 方法 | 路径 | 描述 | 权限 | 实现方法 |
|------|------|------|------|----------|
| GET | `/version-control/history` | 获取节点的 SVN 提交历史 | `VERSION_READ` | `getFileHistory` |
| GET | `/version-control/file/:revision` | 获取指定版本的文件内容 | `VERSION_READ` | `getFileContentAtRevision` |

## 差异分析

### 缺失端点 (当前分支未实现)

1. **`GET /version-control/list/:revision`**
   - **用途**: 列出指定版本号下某个目录的文件列表
   - **参数**:
     - `projectId` (query, required): 项目ID
     - `directoryPath` (query, required): 目录路径
     - `revision` (param, required): 修订版本号
   - **响应**: `{ success, message, files?: string[] }`
   - **Service 状态**: `listDirectoryAtRevision` 方法在 Service 中已实现（包含路径安全校验和错误处理）
   - **可修复性**: 简单 - 只需在 Controller 中添加对应端点

2. **`GET /version-control/content/:revision`**
   - **用途**: 获取指定版本的文件内容 (与 `/file/:revision` 功能完全重复)
   - **参数**:
     - `projectId` (query, required): 项目ID
     - `filePath` (query, required): 文件路径
     - `revision` (param, required): 修订版本号
   - **响应**: `{ success, message, content?: Buffer }`
   - **Service 状态**: `getFileContentAtRevision` 已实现
   - **可修复性**: 简单 - 可直接调用相同 Service 方法，但建议标记为 `@deprecated`
   - **说明**: Main 分支中该端点为重复实现，为了保持向后兼容性，建议添加，并提示前端迁移到 `/file/:revision`

### 行为差异

| 维度 | Main 分支 | 当前分支 | 影响 |
|------|-----------|----------|------|
| **参数校验** | 无明显校验，可能接受空值 | 使用 `ParseIntPipe`、`FileUtils.validatePath` | 更安全 ✅ |
| **错误处理** | 可能抛出未捕获异常 | 统一返回 `{ success, message }` 结构 | 更健壮 ✅ |
| **权限要求** | `@RequireProjectPermission(VERSION_READ)` | 相同 | 一致 ✅ |
| **响应结构** | 使用 DTO (`SvnLogResponseDto`, `FileContentResponseDto`) | 相同 DTO 结构 | 一致 ✅ |

### 额外增强 (当前分支独有)

- 路径安全校验 (`FileUtils.validatePath`) 防止目录遍历攻击
- 启动时配置验证，缺少必要环境变量会立即失败
- 更详细的日志记录
- 提交失败时的文件路径备份回滚辅助信息

## 修复建议

### 立即修复 (已完成)
添加缺失的 `/list/:revision` 端点，因为该功能在 Service 中已实现且不与任何现有端点重复。

### 待决策项
是否添加 `/content/:revision` 端点？该端点与 `/file/:revision` 功能完全重复，但可能存在外部调用依赖。建议：
- **方案 A (保守)**: 添加该端点，标记为 `@deprecated`，并添加注释说明前端应迁移到 `/file/:revision`
- **方案 B (激进)**: 不添加，依赖方需修改调用。由于 main 分支中实现质量差，重构后可以引导使用正确端点，但可能存在未知前端依赖。

根据用户要求“不能为了‘一致性’改回 main 的烂实现”，但保持 API 向后兼容属于功能完整性，而非复制烂实现。建议采用方案 A 添加但标记废弃。

## 执行情况

- [x] 添加 `GET /version-control/list/:revision` 端点
- [ ] 添加 `GET /version-control/content/:revision` 端点 (待决策，暂未添加)
- [x] 生成差异报告并存储到 `docs/functionality-audit/version-control-gaps.md`

## 提交记录

- `fix(version-control): add missing list directory endpoint` - 添加 `/list/:revision` 端点

---
*报告生成时间: 2026-05-08*
