# 权限组件（Permission）

**文件位置**：`packages/frontend/components/permission/`

## 概述

权限相关组件，用于权限分配和管理。

## 核心组件

- **PermissionAssignment**: 权限分配组件

## PermissionAssignment 组件

可视化权限配置和管理组件，支持：

- 按类别分组显示权限
- 勾选/取消勾选权限
- 权限依赖关系提示
- 权限说明和描述
- 批量权限操作

## 功能特性

- 权限分组：系统权限、项目权限、文件权限等
- 权限筛选：按关键字筛选权限
- 权限保存：保存角色权限配置
- 权限重置：重置为默认权限

## 相关 Hooks

- **usePermission**: 权限检查 Hook
- **useProjectPermission**: 项目权限检查 Hook

## 相关服务

- **permissionsApi**: 权限 API 服务

## 权限类型

**系统权限（SystemPermission）**：
- 用户管理权限
- 角色管理权限
- 字体管理权限
- 系统管理权限

**项目权限（ProjectPermission）**：
- 项目管理权限
- 文件操作权限
- CAD 图纸权限
- 图库权限
- 版本管理权限

## 技术栈

- Radix UI Checkbox: 复选框组件
- Zustand: 状态管理