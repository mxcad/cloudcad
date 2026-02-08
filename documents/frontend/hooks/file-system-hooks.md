# 文件系统 Hooks（File System Hooks）

**文件位置**：`packages/frontend/hooks/file-system/`

## 概述

文件系统相关的自定义 Hooks，提供文件和文件夹操作的封装。

## 核心 Hooks

- **useFileSystem**: 文件系统操作 Hook
- **useFileSystemTree**: 文件系统树形结构 Hook

## useFileSystem Hook

提供文件系统的基础操作。

**功能**：
- 文件列表获取
- 文件创建、删除、重命名
- 文件移动、复制
- 文件上传
- 文件下载
- 权限检查

**返回值**：
- files: 文件列表
- loading: 加载状态
- error: 错误信息
- 操作方法：createFile, deleteFile, renameFile, etc.

## useFileSystemTree Hook

提供文件系统的树形结构操作。

**功能**：
- 树形结构数据获取
- 节点展开/折叠
- 节点选择
- 拖拽排序
- 节点过滤

**返回值**：
- treeData: 树形数据
- expandedKeys: 展开的节点
- selectedKeys: 选中的节点
- 操作方法：expandNode, collapseNode, selectNode, etc.

## 相关服务

- **fileSystemApi**: 文件系统 API 服务

## 相关组件

- **FileSystemManager**: 文件系统管理器
- **FileItem**: 文件项组件