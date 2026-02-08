# 文件系统管理器（FileSystemManager）

**文件位置**：`packages/frontend/components/file-system-manager/`

## 概述

文件系统管理器组件，提供文件和文件夹的统一管理界面，支持浏览、上传、删除、重命名等操作。

## 核心组件

- **FileSystemManager**: 主组件，整合文件系统功能
- **FileItem**: 文件项组件，显示单个文件/文件夹
- **FileUploader**: 文件上传组件
- **BreadcrumbNavigation**: 面包屑导航
- **Toolbar**: 工具栏组件
- **KeyboardShortcuts**: 键盘快捷键
- **Layout**: 布局组件

## 核心功能

- 文件浏览：树形结构和列表视图
- 文件上传：支持拖拽上传和批量上传
- 文件操作：创建、删除、重命名、移动
- 文件预览：图片预览、文件信息查看
- 搜索和筛选：按名称、类型筛选文件
- 键盘快捷键：支持常用操作快捷键
- 权限控制：根据用户权限动态显示操作按钮

## 相关 Hooks

- **useFileSystem**: 文件系统操作 Hook
- **usePermission**: 权限检查 Hook
- **useProjectPermission**: 项目权限检查 Hook

## 相关服务

- **fileSystemApi**: 文件系统 API 服务
- **galleryApi**: 图库 API 服务

## 相关页面

- **FileSystemManager**: `packages/frontend/pages/FileSystemManager.tsx`

## 模态框组件

- **CreateFolderModal**: 创建文件夹
- **RenameModal**: 重命名
- **SelectFolderModal**: 选择文件夹
- **ImagePreviewModal**: 图片预览
- **AddToGalleryModal**: 添加到图库