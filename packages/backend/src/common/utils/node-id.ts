///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { createId } from '@paralleldrive/cuid2';

/**
 * 生成与 Prisma `@default(cuid())` 同格式的节点 ID：25 字符、`c` 开头、
 * 字符集 `0-9a-z`（与 `FileSystemNode.id` 存量数据一致）。
 *
 * Prisma 的默认值由查询引擎在 Rust 侧生成，应用侧拿不到同一个生成器。
 * 需要在落库前预取 ID 的路径只能走这里——`NodeCopyMoveService.buildCopyPlan`
 * 要先给子节点定 `parentId`，`allocateNodeStorage` 要先按 nodeId 建存储目录。
 * 曾因这里直接调 `randomUUID()`，磁盘上长期并存 `c*` 与 UUID 两种目录名。
 */
export function generateNodeId(): string {
  return `c${createId()}`;
}
