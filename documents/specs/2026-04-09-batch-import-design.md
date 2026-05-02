# 公共资源库批量目录导入设计文档

**日期**: 2026-04-09  
**状态**: 待实施

---

## 一、功能概述

在公共资源库管理页面添加"批量导入"按钮，支持从本地目录批量导入文件夹和文件到**当前选中的目录**下。

### 核心特性
- 选择本地目录，自动扫描目录结构
- 在**当前选中目录**下创建对应的文件夹结构
- 根据用户选择的冲突策略处理同名文件/文件夹
- 并发控制，避免资源耗尽

---

## 二、用户流程

```
用户在图纸库/图块库中浏览到某个目录（如"建筑类/住宅/"）
    ↓
点击"批量导入"按钮
    ↓
选择本地目录（如 D:/新图纸/）
    ↓
前端扫描目录，构建文件树
    ↓
显示预览对话框：
    - 将要创建的文件夹列表（相对于当前目录）
    - 文件总数
    - 冲突文件列表（根据策略标记）
    ↓
用户选择冲突策略 + 确认
    ↓
递归处理文件树：
    1. 创建文件夹（skipIfExists=true，存在则跳过）
    2. 上传文件（根据策略处理同名）
    ↓
显示完成报告（成功/跳过/失败数量）
```

---

## 三、目录映射规则

### 文件夹处理
- 检查同名文件夹是否存在
- **存在**：跳过创建，使用现有文件夹ID
- **不存在**：创建新文件夹

### 文件处理（3种策略）

| 策略 | 行为 |
|------|------|
| **覆盖** | 同名文件直接覆盖（删除旧文件，上传新文件） |
| **跳过** | 同名文件跳过不处理 |
| **重命名递增** | 自动添加序号：`file.dwg` → `file(1).dwg` → `file(2).dwg` |

### 示例

**当前目录**: `图纸库/建筑类/住宅/`

**本地目录**: `D:/新图纸/`
```
D:/新图纸/
├── 电气/
│   └── 照明.dwg
└── 给排水.dwg
```

**导入结果**:
```
图纸库/建筑类/住宅/
├── 电气/          ← 创建子文件夹
│   └── 照明.dwg   ← 上传到电气文件夹
└── 给排水.dwg     ← 上传到住宅文件夹
```

---

## 四、架构设计

### 1. 前端组件

#### 新增组件：`DirectoryImportDialog.tsx`
- 目录选择对话框（`<input type="file" webkitdirectory>`）
- 预览导入内容（文件夹列表、文件列表、冲突文件）
- 冲突策略选择（覆盖/跳过/重命名递增）
- 上传进度展示
- 完成报告

#### 修改组件：`LibraryManager.tsx`
- 添加"批量导入"按钮（仅管理员可见）
- 集成 `DirectoryImportDialog`
- 传递当前选中节点ID作为导入目标

#### 新增Hook：`useDirectoryImport.ts`
- 目录扫描逻辑（使用 `webkitRelativePath`）
- 文件树构建
- 冲突检测
- 上传队列管理（并发控制）
- 进度追踪

### 2. 后端改动

#### 修改接口：`POST /library/{type}/folders`
- 新增 `skipIfExists` 参数（默认 `true`）
- 检查同名文件夹，存在则返回现有ID

#### 修改服务：`FileConversionService`
- 添加 RateLimiter，使用环境变量 `UPLOAD_MAX_CONCURRENT`
- 限制同时进行的文件转换数量

---

## 五、并发控制

### 环境变量

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `UPLOAD_MAX_CONCURRENT` | 3 | 最大并发上传/转换任务数 |

### 三层并发控制

| 层级 | 并发数 | 实现 |
|------|--------|------|
| 前端上传队列 | 3 | `UploadQueue` 类 |
| 后端分片上传 | 5 | 现有 `RateLimiter` |
| 后端文件转换 | `UPLOAD_MAX_CONCURRENT` | 新增 `RateLimiter` |

### 前端上传队列伪代码

```typescript
class UploadQueue {
  private maxConcurrent = 3;
  private running = 0;
  private queue: FileTask[] = [];

  async enqueue(task: FileTask) {
    this.queue.push(task);
    this.processQueue();
  }

  private async processQueue() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      this.running++;
      const task = this.queue.shift()!;
      task.execute().finally(() => {
        this.running--;
        this.processQueue();
      });
    }
  }
}
```

---

## 六、错误处理

| 场景 | 处理方式 |
|------|---------|
| 单个文件上传失败 | 标记失败，继续上传其他文件 |
| 文件夹创建失败 | 终止导入，显示错误 |
| 网络中断 | 支持断点续传（复用现有分片上传） |
| 权限不足 | 按钮不显示（仅管理员可见） |

---

## 七、文件清单

### 新增文件
- `packages/frontend/src/components/DirectoryImportDialog.tsx`
- `packages/frontend/src/hooks/useDirectoryImport.ts`
- `documents/specs/2026-04-09-batch-import-design.md`

### 修改文件
- `packages/frontend/src/pages/LibraryManager.tsx` - 添加批量导入按钮
- `packages/backend/src/library/library.controller.ts` - 添加 skipIfExists 参数
- `packages/backend/src/library/library.service.ts` - 实现 skipIfExists 逻辑
- `packages/backend/src/mxcad/services/file-conversion.service.ts` - 添加 RateLimiter
- `packages/backend/.env` - 添加环境变量

---

## 八、实施顺序

1. 后端：添加 `UPLOAD_MAX_CONCURRENT` 环境变量
2. 后端：修改 `FileConversionService` 添加 RateLimiter
3. 后端：修改 `createFolder` 支持 `skipIfExists`
4. 前端：实现 `useDirectoryImport` Hook
5. 前端：实现 `DirectoryImportDialog` 组件
6. 前端：修改 `LibraryManager` 添加批量导入按钮
7. 测试验证
