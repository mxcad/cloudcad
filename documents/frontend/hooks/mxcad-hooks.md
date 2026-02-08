# MxCAD Hooks（MxCAD Hooks）

**文件位置**：`packages/frontend/hooks/`

## 概述

MxCAD 相关的自定义 Hooks，提供 CAD 编辑器功能的封装。

## 核心 Hooks

- **useMxCadEditor**: MxCAD 编辑器 Hook
- **useMxCadInstance**: MxCAD 实例 Hook
- **useMxCadUploadNative**: MxCAD 原生上传 Hook
- **useExternalReferenceUpload**: 外部参照上传 Hook

## useMxCadEditor Hook

提供 MxCAD 编辑器的初始化和操作。

**功能**：
- 编辑器初始化
- 文件加载
- 文件保存
- 编辑器控制（缩放、平移、选择）
- 外部参照管理
- 字体管理

**返回值**：
- editor: 编辑器实例
- loading: 加载状态
- error: 错误信息
- 操作方法：loadFile, saveFile, zoom, pan, select, etc.

## useMxCadInstance Hook

管理 MxCAD 实例的生命周期。

**功能**：
- 实例创建和销毁
- 实例缓存
- 实例状态管理
- 事件监听

**返回值**：
- instance: MxCAD 实例
- isReady: 实例是否就绪
- 操作方法：createInstance, destroyInstance, on, off

## useMxCadUploadNative Hook

MxCAD 原生上传功能封装。

**功能**：
- 分片上传
- 断点续传
- 上传进度跟踪
- 上传状态管理

**返回值**：
- upload: 上传函数
- progress: 上传进度
- status: 上传状态
- error: 错误信息

## useExternalReferenceUpload Hook

外部参照上传功能封装。

**功能**：
- 外部参照检测
- 外部参照上传
- DWG 转换
- 图片上传
- 上传进度跟踪

**返回值**：
- uploadReference: 上传外部参照函数
- checkReferences: 检查外部参照函数
- progress: 上传进度
- status: 上传状态
- error: 错误信息

**使用示例**：
```typescript
const { uploadReference, checkReferences, status } = useExternalReferenceUpload();

// 检查外部参照
const references = await checkReferences(fileHash);

// 上传外部参照
await uploadReference(reference, file);
```

## 相关服务

- **mxcadApi**: MxCAD API 服务
- **mxcadManager**: MxCAD 管理器

## 相关组件

- **MxCadUploader**: MxCAD 上传组件
- **CADEditorDirect**: CAD 编辑器页面

## 测试文件

- **useExternalReferenceUpload.spec.ts**: 外部参照上传 Hook 单元测试
- **useExternalReferenceUpload.integration.spec.ts**: 外部参照上传 Hook 集成测试

## MxCAD 配置

- **myUiConfig.json**: MxCAD UI 配置文件
- **环境变量**: VITE_MXCAD_* 相关配置