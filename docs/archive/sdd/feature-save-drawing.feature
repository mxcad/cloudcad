# Feature: 保存图纸

> SDD 规范文档 — 编辑器保存图纸（覆盖写入 + 另存为）
> 关联上下文: [DDD 上下文映射图](../ddd/context-map.md)
> 关联: [架构约束](../sdd/architecture-constraints.md)

## 概述

用户在 CAD 编辑器中编辑图纸后，执行保存操作。系统将 mxweb 数据写入存储、SVN 提交版本、生成 bin 文件。

**归属:** Project
**涉及模块:** mxcad (save), storage, version-control, conversion (bin), file-system

## Feature: 图纸保存

```gherkin
Feature: 图纸保存
  作为 CloudCAD 用户
  我想要在编辑器中保存我的图纸修改
  以便版本控制和协作

  Background:
    Given 已登录用户 "user-123"
    And 用户是项目 "project-456" 的成员，拥有 CAD_SAVE 权限
    And 项目中存在 FileNode "node-789"，关联一张已打开的图纸
    And 用户在编辑器中对该图纸做了修改（isDirty=true）

  # ============================================================
  # Happy Path: 覆盖保存
  # ============================================================

  Scenario: 用户编辑后执行覆盖保存成功
    Given FileNode "node-789" 存在且状态正常
    And 编辑器中有未保存的 mxweb 数据修改
    When 用户执行保存操作 POST /mxcad/savemxweb/node-789
    Then 系统将 mxweb 数据写入存储（覆盖旧文件）
    And 系统提交 SVN，提交信息包含 "Save" 和文件名
    And 系统生成 bin 文件（用于 dwg/dxf 下载导出）
    Then 系统返回 200 和最新版本号
    And 响应中包含 versionId
    And FileNode "node-789" 的 updatedAt 时间戳更新
    And 编辑器的 isDirty 状态置为 false

  # ============================================================
  # Happy Path: 另存为
  # ============================================================

  Scenario: 用户执行另存为到同一项目其他文件夹
    Given FileNode "node-789" 已打开且未保存
    And 目标父节点 "folder-999" 存在且是文件夹
    When 用户执行另存为 POST /mxcad/save-as
      | targetType  | project     |
      | targetNodeId| folder-999  |
      | newName     | modified-plan.dwg |
    Then 系统在目标文件夹下创建新的 FileNode
    And FileNode.name 为 "modified-plan.dwg"
    And 系统拷贝 mxweb 数据到新存储路径
    And 系统提交 SVN（不转换格式）
    Then 系统返回 200 和新创建 FileNode 的 nodeId
    And 原 FileNode "node-789" 保持不变

  # ============================================================
  # 异常: 权限不足
  # ============================================================

  Scenario: 用户无 CAD_SAVE 权限时保存失败
    Given 用户 "user-123" 在项目 "project-456" 中没有 CAD_SAVE 权限
    When 用户执行保存操作 POST /mxcad/savemxweb/node-789
    Then 系统返回 403 Forbidden
    And 响应消息提示 "没有保存权限"
    And 系统不写入 mxweb 到存储
    And 系统不提交 SVN

  # ============================================================
  # 异常: FileNode 不存在
  # ============================================================

  Scenario: 目标 FileNode 不存在或已删除
    Given FileNode "non-existent-node" 不存在或已被永久删除
    When 用户执行保存操作 POST /mxcad/savemxweb/non-existent-node
    Then 系统返回 404 Not Found
    And 响应消息提示 "指定的文件节点不存在"
    And 系统不写入存储
    And 系统不提交 SVN

  # ============================================================
  # 异常: SVN 提交失败 (需要补偿逻辑)
  # ============================================================

  Scenario: 存储写入成功但 SVN 提交失败
    Given FileNode "node-789" 存在
    And 用户的 mxweb 修改数据有效
    When 用户执行保存操作 POST /mxcad/savemxweb/node-789
    And 系统成功将 mxweb 写入存储
    But SVN 提交失败（如网络中断、磁盘锁）
    Then 系统返回 500 Internal Server Error
    And 响应消息提示 "版本提交失败，请重试"
    And 系统回滚已写入的 mxweb 数据（恢复旧版本）
    And FileNode "node-789" 状态不变

  # ============================================================
  # 边界: 保存空图纸
  # ============================================================

  Scenario: 用户打开空图纸后直接保存
    Given FileNode "node-789" 关联了一张空内容图纸
    And 编辑器中没有实质修改（isDirty=false）
    When 用户执行保存操作
    Then 系统正常处理（不崩溃）
    And 系统返回 200 或提示 "没有需要保存的修改"

  # ============================================================
  # 边界: 大图纸保存 (100MB+ mxweb)
  # ============================================================

  Scenario: 用户保存大幅复杂图纸
    Given 编辑器中的 mxweb 数据超过 100MB
    When 用户执行保存操作
    Then 系统在合理时间内完成写入（< 30秒）
    And 系统返回 200 和版本号
```

## API 端点参考

| 行为 | 路由 | 方法 |
|------|------|------|
| 覆盖保存 | `/mxcad/savemxweb/:nodeId` | POST |
| 另存为 | `/mxcad/save-as` | POST |
| 编辑器获取 mxweb | `MxCADView` 内部调用 | — |

## 现有 Service 层测试覆盖

| 场景 | 文件 | 状态 |
|------|------|:---:|
| 覆盖保存 Happy Path | `cad-save-version.integration.spec.ts` | ✅ |
| SVN 提交成功 | `workflow-2-save-mx-version.integration.spec.ts` | ✅ |
| 另存为 | `cad-save-as-duplicate-version-chain.integration.spec.ts` | ✅ |
| 无权限 → 403 | ❌ | ❌ |
| nodeId 不存在 → 404 | ❌ | ❌ |
| SVN 提交失败回滚 | ❌ | ❌ (需要新增补偿逻辑) |

**结论:** 6 个场景中 3 个已有 Service 层覆盖，3 个缺口需要 API 层 supertest 补充。
