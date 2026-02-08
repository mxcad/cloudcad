# 模态框组件（Modals）

**文件位置**：`packages/frontend/components/modals/`

## 概述

各种模态框组件，用于创建、编辑、删除等操作的对话框。

## 核心组件

- **CreateFolderModal**: 创建文件夹模态框
- **RenameModal**: 重命名模态框
- **SelectFolderModal**: 选择文件夹模态框
- **MembersModal**: 成员管理模态框
- **ProjectModal**: 项目创建/编辑模态框
- **ProjectRolesModal**: 项目角色管理模态框
- **AddToGalleryModal**: 添加到图库模态框
- **ExternalReferenceModal**: 外部参照上传模态框
- **ImagePreviewModal**: 图片预览模态框

## 组件详情

### CreateFolderModal

创建新文件夹的模态框，支持设置文件夹名称和父目录。

### RenameModal

重命名文件或文件夹的模态框，支持重命名冲突检测。

### SelectFolderModal

选择目标文件夹的模态框，支持树形结构浏览。

### MembersModal

项目成员管理模态框，支持添加、删除、更新成员角色。

### ProjectModal

项目创建和编辑模态框，支持设置项目名称、描述等。

### ProjectRolesModal

项目角色管理模态框，支持创建、编辑、删除项目角色。

### AddToGalleryModal

添加文件到图库的模态框，支持选择图库分类。

### ExternalReferenceModal

外部参照上传模态框，支持上传 DWG 和图片参照文件。

**特性**：
- 自动检测缺失的外部参照
- 支持立即上传或稍后上传
- 显示上传进度和状态
- 完整的错误处理机制

### ImagePreviewModal

图片预览模态框，支持缩放、旋转、下载等操作。

## 相关 Hooks

- **useExternalReferenceUpload**: 外部参照上传 Hook

## 测试文件

- **ExternalReferenceModal.spec.tsx**: 外部参照模态框测试

## 技术栈

- Radix UI Dialog: 模态框基础组件
- React Hook Form: 表单管理
- Zod: 表单验证