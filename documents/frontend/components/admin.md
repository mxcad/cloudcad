# 管理员组件（Admin）

**文件位置**：`packages/frontend/components/admin/`

## 概述

管理员相关组件，用于系统管理功能。

## 核心组件

- **GalleryTypeManagement**: 图库分类管理组件
- **TagManagement**: 标签管理组件

## GalleryTypeManagement 组件

图库分类管理组件，支持：

- 创建、编辑、删除图库分类
- 三级分类结构管理
- 分类拖拽排序
- 分类图标设置

## TagManagement 组件

标签管理组件，支持：

- 创建、编辑、删除标签
- 标签颜色设置
- 标签分组管理
- 标签使用统计

## 相关服务

- **galleryApi**: 图库 API 服务
- **tagsApi**: 标签 API 服务

## 相关页面

- **TagManagement**: `packages/frontend/pages/TagManagement.tsx`

## 技术栈

- Radix UI Dialog: 模态框
- React Hook Form: 表单管理
- Zod: 表单验证
- Recharts: 图表展示（统计）