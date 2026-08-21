# Feature: 转换图纸

> SDD 规格文档 — 图纸上传与格式转换
> 关联上下文: [DDD 上下文映射图](../ddd/context-map.md)
> 关联: [架构约束](../sdd/architecture-constraints.md)

## 概述

用户上传 dwg/dxf/mxweb 文件到 Project，后端完成格式转换（dwg/dxf → mxweb）、物理存储落盘、创建 FileNode、SVN 提交。

**归属:** Project
**涉及模块:** mxcad (upload, conversion), storage, file-system, version-control

## Feature: 图纸上传与格式转换

```gherkin
Feature: 图纸上传与格式转换
  作为 CloudCAD 用户
  我想要上传 CAD 图纸文件到项目
  以便在编辑器中打开和编辑图纸

  Background:
    Given 已登录用户 "user-123"
    And 用户是项目 "project-456" 的成员，拥有 FILE_CREATE 权限
    And 项目 "project-456" 存在且状态为 ACTIVE

  # ============================================================
  # Happy Path: dwg 上传
  # ============================================================

  Scenario: 用户上传标准 dwg 文件，转换成功
    Given 用户拥有一个有效的 dwg 文件 "floor-plan.dwg"，大小为 5MB
    And 文件 hash 为 "abc123def456"
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "floor-plan.dwg" 到父节点 "node-456"
    Then 系统返回 200 和状态码 MxUploadReturn.kOk
    And 系统执行 dwg → mxweb 格式转换
    And 系统将 mxweb 文件写入存储路径
    And 系统创建 FileNode，name="floor-plan.dwg"，extension=".dwg"
    And 系统提交 SVN，提交信息为 "Upload file: floor-plan.dwg"
    And 响应中包含 nodeId（新创建的 FileNode ID）

  Scenario: 用户上传标准 dxf 文件，转换成功
    Given 用户拥有一个有效的 dxf 文件 "layout.dxf"，大小为 2MB
    And 文件 hash 为 "dxf789ghi"
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "layout.dxf" 到父节点 "node-456"
    Then 系统返回 200 和状态码 MxUploadReturn.kOk
    And 系统执行 dxf → mxweb 格式转换
    And 系统创建 FileNode，extension=".dxf"

  Scenario: 用户直传 mxweb 文件，跳过转换
    Given 用户拥有一个有效的 mxweb 文件 "design.mxweb"，大小为 8MB
    And 文件 hash 为 "mxweb000123"
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "design.mxweb" 到父节点 "node-456"
    Then 系统返回 200 和状态码 MxUploadReturn.kOk
    And 系统不执行格式转换（跳过 conversion 步骤）
    And 系统直接将 mxweb 文件拷贝到存储路径
    And 系统创建 FileNode，mimeType="application/mxweb"

  # ============================================================
  # 异常: 不支持的格式
  # ============================================================

  Scenario: 上传不支持的文件格式
    Given 用户拥有一个 "readme.txt" 文件，大小为 1KB
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "readme.txt" 到父节点 "node-456"
    Then 系统返回 400 Bad Request
    And 响应消息提示 "不支持的文件格式"
    And 系统不执行任何转换操作
    And 系统不创建 FileNode

  # ============================================================
  # 异常: 转换失败
  # ============================================================

  Scenario: dwg 文件损坏导致转换失败
    Given 用户拥有一个损坏的 dwg 文件 "corrupted.dwg"
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "corrupted.dwg" 到父节点 "node-456"
    Then 系统尝试执行格式转换
    And 转换引擎返回失败
    Then 系统返回 422 Unprocessable Entity
    And 响应消息提示 "文件转换失败"
    And 系统不写入 mxweb 到存储
    And 系统不创建 FileNode
    And 系统不提交 SVN

  # ============================================================
  # 异常: 磁盘空间不足
  # ============================================================

  Scenario: 存储空间不足导致写入失败
    Given 用户拥有一个有效的 dwg 文件 "huge-drawing.dwg"，大小为 500MB
    And 存储系统磁盘空间不足
    And 转换成功
    When 用户上传 "huge-drawing.dwg" 到父节点 "node-456"
    Then 系统尝试将 mxweb 写入存储
    And 存储写入失败
    Then 系统返回 507 Insufficient Storage
    And 响应消息提示 "存储空间不足"
    And 系统回滚已创建的 FileNode（如有）
    And 系统不提交 SVN

  # ============================================================
  # 异常: 目标项目不存在
  # ============================================================

  Scenario: 目标父节点所属项目不存在
    Given 用户拥有一个有效的 dwg 文件 "orphan-drawing.dwg"
    And 父节点 "non-existent-node" 不存在或已被删除
    When 用户上传 "orphan-drawing.dwg" 到父节点 "non-existent-node"
    Then 系统返回 404 Not Found
    And 响应消息提示 "指定的父节点不存在"
    And 系统不执行转换
    And 系统不写入存储
    And 系统不创建 FileNode

  # ============================================================
  # 边界: 大文件处理
  # ============================================================

  Scenario: 100MB 大文件分块上传成功
    Given 用户拥有一个 100MB 的 dwg 文件 "large-drawing.dwg"
    And 文件被分为 100 个分块上传
    When 所有分块上传完成，触发合并与转换
    Then 系统合并所有分块
    And 系统执行格式转换
    And 系统返回 200 和状态码 MxUploadReturn.kOk
    And 响应中包含 nodeId

  # ============================================================
  # 边界: 空文件
  # ============================================================

  Scenario: 上传 0 字节文件
    Given 用户拥有一个 0 字节的 dwg 文件 "empty.dwg"
    And 目标父节点 "node-456" 存在且是文件夹
    When 用户上传 "empty.dwg" 到父节点 "node-456"
    Then 系统正常处理（不因空文件崩溃）
    And 系统返回适当的错误或成功状态

  # ============================================================
  # 边界: 分块目录缺失
  # ============================================================

  Scenario: 触发合并但分块目录不存在
    Given 用户触发文件合并操作
    But 分块临时目录已被清理或不存在
    When 系统尝试读取分块目录
    Then 系统返回状态码 MxUploadReturn.kChunkNoExist
    And 系统不执行后续转换和存储操作
```

## API 端点参考

| 行为 | 路由 | 方法 |
|------|------|------|
| 文件上传 (TUS) | `/mxcad/tus/upload` | POST |
| 分块合并 | `FileMergeService.mergeConvertFile()` | Service |
| 直传上传+转换 | `FileConversionUploadService.uploadAndConvertFileWithPermission()` | Service |

## 现有 Service 层测试覆盖

| 场景 | 文件 | 状态 |
|------|------|:---:|
| dwg 分块上传→合并→转换→打开 | `cad-upload-convert.integration.spec.ts` | ✅ |
| dwg 直传→转换→创建节点 | `workflow-1-upload-convert-open.integration.spec.ts` | ✅ |
| 转换引擎失败 | 两个文件都有 | ✅ |
| Library 跳过 SVN | 两个文件都有 | ✅ |
| 文件已存在（快速路径） | `cad-upload-convert.integration.spec.ts` | ✅ |
| 父节点不存在 | 两个文件都有 | ✅ |
| MXWeb 直传跳过转换 | 两个文件都有 | ✅ |
| 大文件 100MB | `workflow-1-upload-convert-open.integration.spec.ts` | ✅ |
| 空文件处理 | `workflow-1-upload-convert-open.integration.spec.ts` | ✅ |
| 并发上传检测 | `workflow-1-upload-convert-open.integration.spec.ts` | ✅ |
| dxf 格式上传 | ❌ 无 | ❌ |
| 不支持格式 → 400 | ❌ 无 | ❌ |
| 磁盘满 → 507 | ❌ 无 | ❌ |

**结论:** 11 个场景中有 10 个已有 Service 层覆盖，3 个缺口需要在 API 层补 supertest。
