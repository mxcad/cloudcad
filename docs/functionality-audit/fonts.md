# Font Library Functionality Audit

> **Branch:** `refactor/circular-deps` vs `main`  
> **Date:** 2026-05-08  
> **Scope:** Backend fonts module + Frontend FontLibrary page  

---

## 概述

字体库模块在重构中从手写 API 服务层迁移到了自动生成的 `@/api-sdk`，后端控制器从手动包装响应改为依赖全局 `ResponseInterceptor`。所有核心 functional intents 均已保留，未发现功能缺失。

---

## 逐文件对比

### 1. Backend — `fonts.service.ts`

| 维度 | main (旧) | current (新) | 判定 |
|------|-----------|-------------|------|
| `getFonts()` | 完整字体列表 + 合并逻辑 | **完全相同** | ✅ 一致 |
| `uploadFont()` | 文件验证 + 按 target 写入目录 | **完全相同** | ✅ 一致 |
| `deleteFont()` | 路径遍历防护 + 按 target 删除 | **完全相同** | ✅ 一致 |
| `downloadFont()` | 文件流返回 + 路径安全检查 | **完全相同** | ✅ 一致 |
| `getFontsFromDirectory()` | 遍历目录 + 扩展名过滤 + 单文件错误容错 | **完全相同** | ✅ 一致 |
| `validateFontFile()` | 扩展名/大小/名称校验 | **完全相同** | ✅ 一致 |
| `ensureDirectoriesExist()` | 递归创建目录 | **完全相同** | ✅ 一致 |
| 允许的扩展名 | `.ttf, .otf, .woff, .woff2, .eot, .ttc, .shx` | **完全相同** | ✅ 一致 |
| 最大文件大小 | 10MB | **完全相同** | ✅ 一致 |

**🔴 NEEDS DECISION — 构造函数默认值移除：**

| | main (旧) | current (新) |
|---|---|---|
| `fonts.backendPath` 未配置时 | 回退到 `path.join(process.cwd(), '..', '..', 'runtime', 'windows', 'mxcad', 'fonts')` | **抛出 Error**，服务启动失败 |
| `fonts.frontendPath` 未配置时 | 同上默认路径 | **抛出 Error**，服务启动失败 |

main 分支有硬编码的安全回退路径，确保即使配置文件缺失也能启动。当前分支改为严格校验，配置缺失即崩溃。**意图不同**：旧版偏"防御性容错"，新版偏"配置完整性校验"。

---

### 2. Backend — `fonts.controller.ts`

| 维度 | main (旧) | current (新) | 判定 |
|------|-----------|-------------|------|
| 路由前缀 | `@Controller('font-management')` | **相同** | ✅ |
| JWT + 权限守卫 | `@UseGuards(JwtAuthGuard, PermissionsGuard)` | **相同** | ✅ |
| `GET /` 字体列表 | `@RequirePermissions([SYSTEM_FONT_READ])` | **相同** | ✅ |
| `POST /upload` | `@RequirePermissions([SYSTEM_FONT_UPLOAD])` + `FileInterceptor` | **相同** | ✅ |
| `DELETE /:fileName` | `@RequirePermissions([SYSTEM_FONT_DELETE])` | **相同** | ✅ |
| `GET /download/:fileName` | `@RequirePermissions([SYSTEM_FONT_DOWNLOAD])` + `StreamableFile` | **相同** | ✅ |
| 权限枚举 | `SystemPermission.SYSTEM_FONT_*` | **相同** | ✅ |
| DTO 中使用 Prisma 枚举 | 无（使用自定义 `FontUploadTarget`） | **相同** | ✅ |

**🔴 NEEDS DECISION — 控制器响应格式差异：**

| 端点 | main (旧) 手动包装 | current (新) 依赖全局拦截器 |
|------|-------------------|--------------------------|
| `GET /` | `{ code: 'SUCCESS', message: '获取字体列表成功', data: [...], timestamp }` | `{ code: 'SUCCESS', message: '操作成功', data: [...], timestamp }` |
| `POST /upload` | `{ code: 'SUCCESS', message: result.message (如"字体文件 xxx 上传成功"), data: result.font, timestamp }` | `{ code: 'SUCCESS', message: '操作成功', data: result.font, timestamp }` |
| `DELETE /:fileName` | `{ code: 'SUCCESS', message: result.message (如"字体文件 xxx 删除成功"), timestamp }` | `{ code: 'SUCCESS', message: '操作成功', data: undefined, timestamp }` |
| `GET /download` | 直接返回 `StreamableFile`（不经过包装） | **相同** ✅ |

全局 `ResponseInterceptor` 统一用 `message: '操作成功'`，而 main 分支控制器在 upload/delete 端点传回了 service 层的详细消息（如 "字体文件 SimSun.ttf 上传成功"）。**意图差异**：旧版提供操作相关的具体反馈，新版统一为通用消息。如果前端依赖 message 字段向用户展示提示，这会丢失上下文。

---

### 3. Frontend — `FontLibrary.tsx`

| 功能 | main (旧) | current (新) | 判定 |
|------|-----------|-------------|------|
| API 导入源 | `import { fontsApi } from '../services'` | `import { fontsControllerGetFonts, ... } from '@/api-sdk'` | 重构（同意图） |
| 字体列表获取 | `fontsApi.getFonts(activeTab)` | `fontsControllerGetFonts({ query: { location: activeTab } })` | 重构（同意图） |
| 字体上传 | `fontsApi.uploadFont(file, target)` | `fontsControllerUploadFont({ body: formData })` | 重构（同意图） |
| 字体删除 | `fontsApi.deleteFont(fontName, activeTab)` | `fontsControllerDeleteFont({ path, query })` | 重构（同意图） |
| 字体下载 | `fontsApi.downloadFont(fontName, activeTab)` | `fontsControllerDownloadFont({ path, query })` | 重构（同意图） |
| 响应数据解包 | 双重检查 `response.data` → `data.data` | 双重检查 `apiResult` → `raw.data` | ✅ 等价逻辑 |
| UI 布局 / 统计卡片 | 字体总数 + 总存储 + 格式种类 | **完全相同** | ✅ |
| 标签页切换 | 后端字体 / 前端字体 | **完全相同** | ✅ |
| 搜索筛选 | 名称搜索 + 格式下拉 + 日期范围 | **完全相同** | ✅ |
| 排序 | 按名称/大小/修改时间 | **完全相同** | ✅ |
| 视图模式 | 网格视图 + 列表视图 | **完全相同** | ✅ |
| 批量操作 | 全选 + 批量删除 | **完全相同** | ✅ |
| 单独操作 | 下载 + 删除（权限控制） | **完全相同** | ✅ |
| 上传模态框 | 拖拽上传 + 目标选择（both/backend/frontend）+ 文件类型/大小验证 | **完全相同** | ✅ |
| 加载状态 | 骨架屏 + 加载动画 | **完全相同** | ✅ |
| 空状态 | 带引导按钮的空状态 | **完全相同** | ✅ |
| 权限拒绝状态 | 无权限提示页面 | **完全相同** | ✅ |
| `useDocumentTitle` | `'字体库'` | **相同** | ✅ |
| 文件大小格式化 | `formatFileSize()` | **完全相同** | ✅ |
| 日期格式化 | `formatDate()` zh-CN | **完全相同** | ✅ |
| 下载实现 | `new Blob([response.data])` → 创建临时链接 | `response.blob()` → 创建临时链接 | ✅ 等价 |
| 字体类型图标映射 | `FONT_TYPES` + `getFontIcon()` | **完全相同** | ✅ |

---

## 汇总

### ✅ 无功能缺失

所有 main 分支的字体库功能均在当前分支完整保留：

| 类别 | 功能点 | 状态 |
|------|--------|------|
| API | 字体列表 CRUD + 下载 | ✅ 完整 |
| API | 上传目标选择（后端/前端/同时） | ✅ 完整 |
| API | 文件类型/大小验证 | ✅ 完整 |
| API | 路径遍历安全防护 | ✅ 完整 |
| UI | 双视图（网格+列表） | ✅ 完整 |
| UI | 搜索/筛选/排序 | ✅ 完整 |
| UI | 批量选择+批量删除 | ✅ 完整 |
| UI | 拖拽上传模态框 | ✅ 完整 |
| UI | 权限门控 | ✅ 完整 |
| UI | 加载/空/错误状态 | ✅ 完整 |

### 🔴 NEEDS DECISION（2 项）

| # | 文件 | 事项 | 说明 |
|---|------|------|------|
| 1 | `fonts.service.ts` | **构造函数默认路径移除** | main 有硬编码 fallback 到 `runtime/windows/mxcad/fonts`，当前分支配置缺失直接抛 Error。需确认：是否所有部署环境都已配置 `fonts.backendPath` / `fonts.frontendPath`？ |
| 2 | `fonts.controller.ts` | **API 响应 message 字段丢失具体信息** | main 返回具体消息（如"字体文件 xxx 上传成功"），当前统一返回"操作成功"。需确认：前端是否依赖 message 字段展示？如果用户可见，建议在拦截器中支持自定义 message 或保留控制器级包装。 |

### 📋 重构总结

重构范围：API 调用层现代化
- 后端控制器：移除手动包装逻辑，信任全局 `ResponseInterceptor`
- 前端：从手写 `fontsApi.ts` 服务文件迁移到自动生成的 `@/api-sdk`
- 所有业务逻辑（service 层）和 UI 逻辑（React 组件）保持不变

没有发现缺失功能需要修复和提交。
