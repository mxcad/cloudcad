# CloudCAD 项目文档地图

**生成日期**: 2026-05-02  
**分支**: refactor/circular-deps

---

## 目录

1. [项目概览文档](#项目概览文档)
2. [开发指南文档](#开发指南文档)
3. [冲刺一：循环依赖修复](#冲刺一循环依赖修复)
4. [冲刺二：上帝模块拆分](#冲刺二上帝模块拆分)
5. [冲刺三：测试覆盖与清理](#冲刺三测试覆盖与清理)
6. [设计规范文档](#设计规范文档)
7. [产品设计文档](#产品设计文档)
8. [配置开发文档](#配置开发文档)
9. [用户指南文档](#用户指南文档)
10. [其他文档](#其他文档)

---

## 项目概览文档

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| README.md | 根目录 | 项目总览、快速开始、部署指南 | ✅ 活跃 | 需定期更新 |
| PROJECT_OVERVIEW.md | 根目录 | 项目目标、技术架构、核心功能 | ✅ 活跃 | 2026-03-27 更新 |
| API.md | 根目录 | API 接口文档（位置存疑） | ⚠️ 需验证 | 可能已过时 |
| CHANGELOG.md | 根目录 | 版本变更记录 | ⚠️ 不完整 | 只有框架，无内容 |
| AGENTS.md | 根目录 | AI Agent 配置 | ✅ 活跃 | 2025-04-15 生成 |

---

## 开发指南文档

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| DEVELOPMENT_GUIDE.md | 根目录 | 开发环境配置、编码规范、测试指南 | ✅ 活跃 | 2026-03-27 更新 |
| DEPLOYMENT.md | 根目录 | Docker 部署指南 | ✅ 活跃 | 详细的部署流程 |
| CONTRIBUTING.md | 根目录 | 贡献者指南 | ✅ 活跃 | 2025-12-11 更新 |
| GIT_WORKFLOW.md | 根目录 | Git 工作流规范 | ✅ 活跃 | 需结合使用 |
| VERIFICATION.md | 根目录 | 重构验证报告 | ✅ 活跃 | CacheWarmupService 重构验证 |
| MODIFICATIONS.md | 根目录 | 修改历史记录 | ✅ 活跃 | CAD 编辑器侧边栏修改记录 |

---

## 冲刺一：循环依赖修复

**目标**: 解决后端模块间的循环依赖问题

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| circular-deps-analysis.md | docs/ | 循环依赖分析报告 | ✅ 完成 | 分析了所有循环依赖链 |
| decircularize-report.md | docs/ | 循环依赖修复报告 | ✅ 完成 | 5 对循环依赖全部修复 |
| audit-decircularize.md | docs/ | 解循环审计报告 | ✅ 完成 | 验证修复结果 |
| audit-dep-cleanup.md | docs/ | 依赖清理审计 | ✅ 完成 | 清理未使用依赖 |
| audit-global-consistency.md | docs/ | 全局一致性审计 | ✅ 完成 | 架构一致性检查 |
| audit-p0-p1-p2-fixes.md | docs/ | P0/P1/P2 修复审计 | ✅ 完成 | 代码质量修复验证 |
| architecture-health-report.md | docs/ | 架构健康报告 | ✅ 完成 | 综合架构评估 |
| dependency-audit-report.md | docs/ | 依赖审计报告 | ✅ 完成 | 依赖关系分析 |
| database-entity-report.md | docs/ | 数据库实体报告 | ✅ 完成 | 数据库结构分析 |
| module-dependency-graph.md | docs/ | 模块依赖图 | ✅ 完成 | 视觉化依赖关系 |
| business-flow-diagrams.md | docs/ | 业务流程图 | ✅ 完成 | 关键业务流程文档化 |

**完成成果**:
- ✅ 5 对循环依赖全部解除
- ✅ forwardRef 使用从多处减少到 7 处
- ✅ 提取了共享接口
- ✅ 移除了未使用的依赖

---

## 冲刺二：上帝模块拆分

**目标**: 将 FileSystemModule 和 MxCadModule 拆分为更小的子模块

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| sprint2-pre-analysis.md | docs/ | 冲刺二预分析报告 | ✅ 完成 | 拆分方案设计 |
| sprint2-phase1-filesystem.md | docs/ | FileSystem 第一阶段拆分 | ✅ 完成 | FileHash/FileValidation/StorageQuota |
| sprint2-phase2-filesystem.md | docs/ | FileSystem 第二阶段拆分 | ✅ 完成 | FileTree/FilePermission |
| sprint2-phase3-filesystem.md | docs/ | FileSystem 第三阶段拆分 | ✅ 完成 | ProjectMember/Search |
| sprint2-phase1-mxcad.md | docs/ | MxCad 第一阶段拆分 | ✅ 完成 | Infra/Conversion |
| sprint2-phase2-mxcad.md | docs/ | MxCad 第二阶段拆分 | ✅ 完成 | Chunk/Node |
| sprint2-phase5-mxcad.md | docs/ | MxCad 第五阶段拆分 | ✅ 完成 | ExternalRef/Facade |
| sprint2-phase6-mxcad.md | docs/ | MxCad 第六阶段拆分 | ⏳ 待完成 | Upload/FileUploadManagerFacade |
| sprint2-phase7-mxcad.md | docs/ | MxCad 第七阶段拆分 | ✅ 完成 | SaveAs |
| sprint2-full-inventory.md | docs/ | 冲刺二完整清单 | ✅ 完成 | 所有子模块审计 |
| sprint2-mxcad-final.md | docs/ | MxCad 模块拆分最终 | ✅ 完成 | MxCad 子模块总结 |
| sprint2-final-summary.md | docs/ | 冲刺二最终总结 | ✅ 完成 | 整体成果汇总 |
| sprint2-remaining-work.md | docs/ | 冲刺二剩余工作 | ✅ 完成 | 待办事项清单 |

**完成成果**:
- ✅ FileSystem: 7/10 子模块完成 (70%)
- ✅ MxCad: 7/9 子模块完成 (78%)
- ✅ 整体: 14/19 子模块完成 (74%)

**待完成**:
- FileSystem: FileDownloadModule, FileSystemFacadeModule
- MxCad: MxcadUploadModule, MxcadCoreModule, 完善 MxcadFacadeModule

---

## 冲刺三：测试覆盖与清理

**目标**: 完成剩余拆分、增加测试覆盖、代码清理

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| sprint3-test-planning.md | docs/ | 测试规划文档 | ✅ 完成 | 测试策略制定 |
| sprint3-progress-check.md | docs/ | 进度检查报告 | ✅ 完成 | 实时监控 |
| sprint3-test-quality-audit.md | docs/ | 测试质量审计 | ✅ 完成 | 测试质量评估 |
| sprint3-test-task-assignment.md | docs/ | 测试任务分配 | ✅ 完成 | 任务清单 |
| sprint3-cleanup-findings.md | docs/ | 清理发现报告 | ✅ 完成 | 代码清理结果 |
| sprint3-import-check.md | docs/ | 导入检查报告 | ⚠️ 需验证 | 位置待确认 |
| test-coverage-gap.md | docs/ | 测试覆盖缺口 | ✅ 完成 | 识别测试不足 |
| monorepo-migration.md | docs/ | Monorepo 迁移方案 | ✅ 完成 | 架构演进规划 |
| admin-api-plan.md | docs/ | 管理 API 规划 | ✅ 完成 | 后台管理功能 |
| api-final-status.md | docs/ | API 最终状态 | ✅ 完成 | API 清单 |
| api-inventory.md | docs/ | API 清单 | ✅ 完成 | 接口目录 |
| frontend-refactor-plan.md | docs/ | 前端重构计划 | ✅ 完成 | 前端优化方案 |
| frontend-code-review.md | docs/ | 前端代码审查 | ✅ 完成 | 前端质量报告 |
| vue3-migration-plan.md | docs/ | Vue3 迁移计划 | ⚠️ 待评估 | 技术选型待确认 |
| upload-migration-plan.md | docs/ | 上传迁移计划 | ⚠️ 待执行 | 文件上传重构 |
| project-full-audit.md | docs/ | 项目全面审计 | ✅ 完成 | 综合项目检查 |

**当前进度**:
- ✅ 测试覆盖约 60%
- ⏳ 核心 Service (MxCadService, UsersService, AuthFacadeService) 无测试
- ⏳ 待完成剩余 God Module 拆分

---

## 设计规范文档

**目录**: documents/lcd/

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| architecture.md | documents/lcd/shared/ | 系统架构文档 | ✅ 活跃 | 架构设计规范 |
| guidelines.md | documents/lcd/shared/ | 开发规范指南 | ✅ 活跃 | 编码、命名规范 |
| commands.md | documents/lcd/shared/ | 常用命令速查 | ✅ 活跃 | 开发命令参考 |
| backend-architecture-review.md | documents/lcd/shared/ | 后端架构审查 | ✅ 完成 | 架构评估报告 |
| auth.md | documents/lcd/backend/ | 认证模块设计 | ✅ 活跃 | 认证流程文档 |
| file-system.md | documents/lcd/backend/ | 文件系统设计 | ✅ 活跃 | 文件管理架构 |
| cache-config.md | documents/lcd/backend/ | 缓存配置设计 | ✅ 活跃 | 缓存策略文档 |
| features.md | documents/lcd/backend/ | 后端功能清单 | ✅ 活跃 | 功能模块列表 |
| components.md | documents/lcd/frontend/ | 前端组件文档 | ✅ 活跃 | UI 组件库 |
| hooks.md | documents/lcd/frontend/ | 前端 Hooks 文档 | ✅ 活跃 | 自定义 Hooks |
| pages.md | documents/lcd/frontend/ | 前端页面文档 | ✅ 活跃 | 页面结构 |
| services.md | documents/lcd/frontend/ | 前端服务文档 | ✅ 活跃 | API 调用封装 |

---

## 产品设计文档

**目录**: documents/specs/

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| 2026-03-18-personal-space-design.md | documents/specs/ | 个人空间设计 | ✅ 完成 | 已实现 |
| 2026-03-19-cad-editor-sidebar-refactor-design.md | documents/specs/ | CAD 编辑器侧边栏设计 | ✅ 完成 | 侧边栏重构 |
| 2026-03-19-trash-refactor-design.md | documents/specs/ | 垃圾桶重构设计 | ✅ 完成 | 回收站功能 |
| 2026-03-20-theme-switch-design.md | documents/specs/ | 主题切换设计 | ✅ 完成 | 明暗主题切换 |
| 2026-03-20-perfect-theme-system-design.md | documents/specs/ | 完善主题系统设计 | ✅ 完成 | 主题系统架构 |
| 2026-03-23-user-guide-tour-design.md | documents/specs/ | 用户引导设计 | ✅ 完成 | 新手引导功能 |
| 2026-03-24-tour-preconditions-design.md | documents/specs/ | 引导前置条件设计 | ✅ 完成 | 引导触发条件 |
| 2026-03-27-public-library-design.md | documents/specs/ | 公开资源库设计 | ✅ 完成 | 公共图库 |
| 2026-03-27-data-directory-consolidation-design.md | documents/specs/ | 数据目录整合设计 | ✅ 完成 | 目录结构优化 |
| 2026-04-09-batch-import-design.md | documents/specs/ | 批量导入设计（前端） | ✅ 完成 | 批量上传功能 |
| 2026-04-09-batch-import-backend-design.md | documents/specs/ | 批量导入设计（后端） | ✅ 完成 | 后端实现方案 |
| 2026-04-13-mxcad-module-analysis.md | documents/specs/ | MxCad 模块分析 | ✅ 完成 | 模块拆解分析 |

**相关计划文档**:
| 文档名称 | 位置 | 用途 | 状态 |
|---------|------|------|------|
| 2026-03-19-cad-editor-sidebar-refactor.md | documents/plans/ | 侧边栏重构计划 | ✅ 完成 |
| 2026-03-19-cad-editor-sidebar-refactor-plan.md | documents/superpowers/plans/ | 侧边栏重构详细计划 | ✅ 完成 |
| 2026-03-19-trash-refactor-plan.md | documents/superpowers/plans/ | 垃圾桶重构计划 | ✅ 完成 |

---

## 配置开发文档

**目录**: documents/config-dev/

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| deployment-config-center-design.md | documents/config-dev/ | 部署配置中心设计 | ✅ 完成 | 配置管理架构 |
| runtime-config-center-design.md | documents/config-dev/ | 运行时配置中心设计 | ✅ 完成 | 动态配置管理 |
| deployment-setup-wizard-design.md | documents/config-dev/ | 部署向导设计 | ✅ 完成 | 一键部署 |
| mail-service-toggle-design.md | documents/config-dev/ | 邮件服务开关设计 | ✅ 完成 | 邮件功能开关 |

---

## 用户指南文档

| 文档名称 | 位置 | 用途 | 状态 | 备注 |
|---------|------|------|------|------|
| CloudCAD-User-Manual.md | documents/user-guide/ | 用户手册 | ⚠️ 需完成 | 待完善内容 |

---

## 其他文档

### 问题与修复文档

| 文档名称 | 位置 | 用途 | 状态 |
|---------|------|------|------|
| 2026-04-10-cad-editor-sidebar-fixes.md | documents/ | CAD 编辑器侧边栏修复 | ✅ 完成 |
| backend-code-review-report.md | documents/ | 后端代码审查报告 | ✅ 完成 |
| auth-registration-review.md | documents/ | 认证注册审查 | ✅ 完成 |
| register-bug-review.md | documents/ | 注册 Bug 审查 | ✅ 完成 |
| BUGFIX_tour-modal-flicker.md | 根目录 | 引导模态框闪烁修复 | ✅ 完成 |
| FIX_z-index-modal-overlay-toast.md | 根目录 | Z-index 层级修复 | ✅ 完成 |

### 部署相关文档

| 文档名称 | 位置 | 用途 | 状态 |
|---------|------|------|------|
| shared/linux-deploy-pack-design.md | documents/ | Linux 部署包设计 | ✅ 完成 |
| runtime/README.md | runtime/ | 离线部署说明 | ✅ 活跃 |
| .sisyphus/plans/docker-deploy-simple-cn.md | .sisyphus/plans/ | Docker 部署简化（中文） | ✅ 完成 |
| .sisyphus/plans/docker-deploy-simple.md | .sisyphus/plans/ | Docker 部署简化（英文） | ✅ 完成 |

### AI 与自动化文档

| 文档名称 | 位置 | 用途 | 状态 |
|---------|------|------|------|
| docs/AI_CONTEXT.md | docs/ | AI 上下文配置 | ✅ 活跃 |
| .claude/skills/**/SKILL.md | .claude/skills/ | Claude Skills 定义 | ✅ 活跃 |
| .iflow/agents/*.md | .iflow/agents/ | iFlow Agent 配置 | ✅ 活跃 |
| .iflow/skills/**/SKILL.md | .iflow/skills/ | iFlow Skills 定义 | ✅ 活跃 |
| .iflow/IFLOW.md | .iflow/ | iFlow 配置 | ✅ 活跃 |
| .trae/documents/mxweb-direct-upload-plan.md | .trae/documents/ | MxWeb 直传计划 | ✅ 完成 |

### GitHub 配置文档

| 文档名称 | 位置 | 用途 | 状态 |
|---------|------|------|------|
| .github/PULL_REQUEST_TEMPLATE.md | .github/ | PR 模板 | ✅ 活跃 |
| .github/ISSUE_TEMPLATE/bug_report.md | .github/ISSUE_TEMPLATE/ | Bug 报告模板 | ✅ 活跃 |
| .github/ISSUE_TEMPLATE/feature_request.md | .github/ISSUE_TEMPLATE/ | 功能请求模板 | ✅ 活跃 |

---

## 文档状态分类

### ✅ 活跃文档（需持续维护）
- README.md
- PROJECT_OVERVIEW.md
- DEVELOPMENT_GUIDE.md
- DEPLOYMENT.md
- CONTRIBUTING.md
- 所有 lcd/ 规范文档

### ✅ 完成文档（历史记录，无需更新）
- 冲刺一、二、三的所有审计报告
- 已完成功能的设计文档
- 修复记录文档

### ⏳ 待完成文档
- 冲刺二剩余拆分相关文档
- 冲刺三待执行的测试文档
- CloudCAD-User-Manual.md（用户手册）

### ⚠️ 需验证/更新文档
- API.md（位置和内容需确认）
- CHANGELOG.md（内容不完整）
- vue3-migration-plan.md（技术选型待确认）

---

## 已过时文档清单

| 文档名称 | 位置 | 原因 | 建议 |
|---------|------|------|------|
| （未发现明显过时文档）| - | - | 持续监控 |

---

## 文档维护建议

### 优先级排序
1. **高优先级**: 完善用户手册、补全 CHANGELOG
2. **中优先级**: 保持活跃文档同步更新
3. **低优先级**: 整理历史文档归档

### 新增文档建议
- 架构决策记录 (ADR)
- 故障排查手册
- 性能优化指南
- 安全审计报告

---

## 附录：文档统计

| 类别 | 数量 |
|------|------|
| 项目概览文档 | 6 |
| 开发指南文档 | 6 |
| 冲刺一文档 | 11 |
| 冲刺二文档 | 13 |
| 冲刺三文档 | 17 |
| 设计规范文档 | 12 |
| 产品设计文档 | 13 |
| 配置开发文档 | 4 |
| 用户指南文档 | 1 |
| 其他文档 | ~20 |
| **总计** | **约 100+** |

---

*文档地图生成完成*  
*最后更新: 2026-05-02*
