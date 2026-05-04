# A4：字体库深度审计报告

汇报人：Trea
日期：2026-05-03
分支：refactor/circular-deps

---

## 1. 模块概述

| 属性 | 值 |
|------|-----|
| 模块路径 | `packages/backend/src/fonts/` |
| 核心服务 | `FontsService` |
| 控制器 | `FontsController` |
| 文件系统 | 本地文件系统（backend + frontend 目录） |
| 依赖模块 | `CommonModule`, `ConfigModule`, `MulterModule` |

## 2. 架构分析

### 2.1 技术架构

```
┌─────────────────────────────────────────────────────────────┐
│                       FontsController                         │
│  - GET  /v1/font-management (SYSTEM_FONT_READ)              │
│  - POST /v1/font-management/upload (SYSTEM_FONT_UPLOAD)    │
│  - DELETE /v1/font-management/:fileName (SYSTEM_FONT_DELETE) │
│  - GET  /v1/font-management/download/:fileName              │
│         (SYSTEM_FONT_DOWNLOAD)                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        FontsService                          │
│  - 后端字体目录: runtime/windows/mxcad/fonts                 │
│  - 前端字体目录: runtime/windows/mxcad/fonts                 │
│  - 支持格式: ttf, otf, woff, woff2, eot, ttc, shx         │
│  - 文件大小限制: 10MB                                       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 文件路径管理

```typescript
// 默认路径构造 - 存在硬编码问题
this.backendFontsDir = path.join(
  process.cwd(),
  '..', '..',
  'runtime', 'windows', 'mxcad', 'fonts'
);

// 应该从配置服务读取
this.backendFontsDir = this.configService.get<string>('fonts.backendPath', defaultPath);
```

## 3. 代码质量分析

### 3.1 优点

| 优点 | 说明 |
|------|------|
| 路径遍历防护 | `deleteFont` 和 `downloadFont` 验证文件名防止 `..` 攻击 |
| 双目录管理 | 同时管理 backend 和 frontend 字体目录 |
| 文件类型白名单 | 明确的允许扩展名列表 |
| 流式下载 | `downloadFont` 使用 StreamableFile 避免内存溢出 |

### 3.2 发现的问题

| 问题 | 严重程度 | 说明 |
|------|----------|------|
| 路径硬编码 | 高 | `process.cwd() + ../..` 路径拼接脆弱 |
| 删除操作无确认 | 中 | 应支持软删除或回收站机制 |
| 字体文件无校验 | 中 | 未验证字体文件格式是否有效 |
| 上传覆盖无提示 | 低 | 上传同名文件直接覆盖无警告 |

### 3.3 安全隐患

```typescript
// fonts.service.ts:79-88 - 硬编码路径问题
this.backendFontsDir = this.configService.get<string>(
  'fonts.backendPath',
  path.join(process.cwd(), '..', '..', 'runtime', 'windows', 'mxcad', 'fonts')
);

// 问题：
// 1. 相对路径依赖 process.cwd()
// 2. Windows/Linux 路径分隔符差异
// 3. 如果配置未设置，使用默认值可能导致不可预期行为
```

## 4. 循环依赖分析

### 4.1 依赖图

```
FontsModule
    ├── FontsController
    │       ├── JwtAuthGuard
    │       ├── PermissionsGuard
    │       └── MulterModule (file upload)
    └── FontsService
            └── ConfigService
```

### 4.2 循环依赖风险评估

| 依赖路径 | 风险等级 | 说明 |
|----------|----------|------|
| FontsModule → CommonModule | 低 | 标准模块依赖 |
| FontsModule → ConfigModule | 低 | 标准模块依赖 |
| FontsModule → MulterModule | 低 | 标准模块依赖 |

**结论**: 无循环依赖风险。

## 5. 安全分析

### 5.1 权限控制

| 端点 | 权限要求 | 评估 |
|------|----------|------|
| GET / | SYSTEM_FONT_READ | ✅ |
| POST /upload | SYSTEM_FONT_UPLOAD | ✅ |
| DELETE /:fileName | SYSTEM_FONT_DELETE | ✅ |
| GET /download/:fileName | SYSTEM_FONT_DOWNLOAD | ✅ |

### 5.2 文件系统安全

| 安全措施 | 实现情况 |
|----------|----------|
| 路径遍历防护 | ✅ `fileName.includes('..')` 检查 |
| 文件类型白名单 | ✅ 7 种扩展名 |
| 文件大小限制 | ✅ 10MB Multer 限制 |
| 文件名长度限制 | ✅ 255 字符限制 |

### 5.3 安全建议

| 问题 | 严重程度 | 建议 |
|------|----------|------|
| 相对路径依赖 | 高 | 使用绝对路径，从环境变量读取 |
| 字体文件无病毒扫描 | 中 | 集成文件安全扫描 |
| 上传日志缺失 | 中 | 应记录上传操作审计日志 |

## 6. 测试覆盖分析

### 6.1 测试文件

- `packages/backend/src/fonts/**/*.spec.ts` - 未发现

### 6.2 覆盖建议

| 测试场景 | 优先级 |
|----------|--------|
| 上传有效/无效字体文件 | 高 |
| 删除存在/不存在字体 | 高 |
| 路径遍历攻击防护 | 高 |
| 下载权限验证 | 中 |
| 目录不存在处理 | 中 |

## 7. 性能分析

| 指标 | 当前值 | 建议 |
|------|--------|------|
| 文件大小限制 | 10MB | ✅ 合理 |
| 并发上传 | 无限制 | 建议添加并发控制 |
| 内存占用 | StreamableFile | ✅ 良好，使用流 |

### 7.1 性能问题

```typescript
// getFonts() 方法 - 串行读取目录
for (const file of files) {
  const stat = await fs.stat(filePath); // 串行执行
}

// 建议：使用 Promise.all 并行处理
```

## 8. 可维护性分析

### 8.1 代码组织

| 指标 | 评分 | 说明 |
|------|------|------|
| 模块化 | ⭐⭐⭐ | Controller 较重，包含部分逻辑 |
| 单一职责 | ⭐⭐⭐ | Service 和 Controller 边界模糊 |
| 错误处理 | ⭐⭐⭐⭐ | 异常分类处理良好 |
| 注释 | ⭐⭐⭐ | JSDoc 较完整 |

### 8.2 技术债

1. **双目录同步问题**: 字体同时存在于 backend 和 frontend，但复制逻辑在上传时而非访问时
2. **缓存缺失**: 字体列表无缓存，每次请求都扫描文件系统
3. **无版本管理**: 字体更新无版本控制

## 9. 与其他模块的关系

| 关系模块 | 交互方式 |
|----------|----------|
| RuntimeConfig | 通过 `ConfigService` 获取字体路径配置 |
| 审计日志 | 无直接依赖（建议添加上传/删除审计） |

## 10. 审计结论

| 维度 | 评级 | 备注 |
|------|------|------|
| 代码质量 | B | 基础功能完整，安全防护到位 |
| 安全性 | B+ | 权限控制和路径防护良好 |
| 性能 | B | 串行操作有优化空间 |
| 可维护性 | B | 路径硬编码需改进 |
| 循环依赖 | A | 无循环依赖风险 |

### 10.1 优先改进项

1. **[高]** 将字体路径改为绝对路径，从环境变量读取
2. **[中]** 字体列表添加缓存
3. **[中]** getFonts 并行化
4. **[中]** 添加上传/删除审计日志
5. **[低]** 支持同名文件覆盖提示

---

**审计人**: Trea
**审计时间**: 2026-05-03
