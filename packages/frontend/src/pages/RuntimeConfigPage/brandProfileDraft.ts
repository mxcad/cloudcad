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

/**
 * 品牌档案（brandProfile）JSON 草稿的读写纯函数。
 *
 * 表单字段编辑 = 在现有 JSON 草稿上改一个路径，再序列化回写：
 * 不清理未知键、不重建整块，历史遗留字段原样保留。
 * 「清空即删除键」是这里的核心语义——前端约定缺省字段走内置默认值，
 * 空串不是清空（后端 JSON 校验也不接受空串清空）。
 */

import type { DraftValue } from './validate';

export type JsonObject = Record<string, unknown>;

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** 解析草稿；非法 JSON 或不是对象时返回空对象 */
export function parseDraft(draft: DraftValue): JsonObject {
  try {
    const parsed: unknown = JSON.parse(String(draft ?? ''));
    return isJsonObject(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** 写入路径上的字段；空串即删除该键 */
export function setByPath(
  obj: JsonObject,
  path: string[],
  value: string
): void {
  if (path.length === 0) return;

  // 逐层下钻，中间不存在的层级就地补空对象
  const cursor = path
    .slice(0, -1)
    .reduce<JsonObject>((current, key) => {
      const next = current[key];
      return isJsonObject(next) ? next : (current[key] = {});
    }, obj);

  const last = path[path.length - 1];
  if (last === undefined) return;
  if (value === '') delete cursor[last];
  else cursor[last] = value;
}

/**
 * 清理因清空而变空的嵌套对象（`support: {}` / `legal: { identities: {} }`），
 * 让落库 JSON 只留真正配置的字段。`apps` 例外：空条目由「移除应用」按钮管理，
 * 否则用户刚填的应用 ID 会因三个字段全空而静默消失。
 */
export function pruneEmpty(obj: JsonObject): void {
  for (const key of Object.keys(obj)) {
    if (key === 'apps') continue;
    const child = obj[key];
    if (!isJsonObject(child)) continue;
    pruneEmpty(child);
    if (Object.keys(child).length === 0) delete obj[key];
  }
}

/** 在草稿上施加一次改动并序列化回写（两空格缩进，与 defaultDraftOf 一致） */
export function commit(
  draft: DraftValue,
  mutate: (obj: JsonObject) => void
): DraftValue {
  const obj = parseDraft(draft);
  mutate(obj);
  pruneEmpty(obj);
  return JSON.stringify(obj, null, 2);
}
