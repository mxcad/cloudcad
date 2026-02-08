# 字体管理（Fonts）

**文件位置**：`packages/backend/src/fonts/`

## 概述

字体管理功能，允许管理员上传、管理和部署 CAD 图纸所需的字体文件，确保图纸能够正确显示。

## 核心组件

- **FontsService**: 字体服务
- **FontsController**: 字体控制器
- **FontsModule**: 字体模块

## 核心功能

- 字体上传：上传字体文件到后端转换程序和前端资源目录
- 字体删除：从指定位置删除字体文件
- 字体下载：下载指定位置的字体文件
- 字体列表：获取所有字体文件信息
- 权限控制：仅管理员可访问字体管理功能

## 字体上传目标

| 目标 | 说明 |
|------|------|
| backend | 上传到后端转换程序字体目录（MxCAD 转换时使用） |
| frontend | 上传到前端资源字体目录（MxCAD 编辑器显示时使用） |
| both | 同时上传到后端和前端目录（默认选项） |

## 支持的字体格式

- `.ttf` - TrueType 字体
- `.otf` - OpenType 字体
- `.woff` - Web Open Font Format
- `.woff2` - Web Open Font Format 2.0
- `.eot` - Embedded OpenType
- `.ttc` - TrueType Collection
- `.shx` - AutoCAD 形文件

## 相关配置

- `MXCAD_FONTS_PATH`: 后端转换程序字体目录
- `FRONTEND_FONTS_PATH`: 前端资源字体目录

## 前端组件

- **FontLibrary**: `packages/frontend/pages/FontLibrary.tsx`
- **fontsApi**: `packages/frontend/services/api.ts`

## API 端点

| 端点 | 方法 | 功能 |
|------|------|------|
| `/api/font-management/*` | CRUD | 字体管理操作 |

## 权限要求

仅具有以下权限的用户可访问：
- SYSTEM_FONT_UPLOAD: 上传字体
- SYSTEM_FONT_DELETE: 删除字体
- SYSTEM_FONT_DOWNLOAD: 下载字体
- SYSTEM_FONT_READ: 查看字体列表