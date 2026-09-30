///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use its software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 文件哈希计算工具
 * 统一使用 MD5 算法，与后端保持一致
 */

import SparkMD5 from 'spark-md5';

/** 记忆化条目上限（LRU：插入序 + 命中后重插）。同一会话内不会打开那么多大图。 */
const HASH_MEMO_MAX = 32;

/** 会话内哈希记忆表：key 见 hashMemoKey 的注释。 */
const hashMemo = new Map<string, string>();

/**
 * 记忆化键：name|size|lastModified 三者同值才视为同一文件。
 *
 * lastModified 不可用（0 或非有限值——部分沙箱环境与网络盘会丢 mtime）时返回
 * null 表示**不参与缓存**。否则键会塌缩成 name|size，两个同名同尺寸的不同文件
 * 会互相借用哈希，后果是秒传判定命中错误产物、打开别人的图纸。宁可慢，不可错。
 */
function hashMemoKey(file: File): string | null {
  const mtime = file.lastModified;
  if (!Number.isFinite(mtime) || mtime === 0) return null;
  return `${file.name}\u0000${file.size}\u0000${mtime}`;
}

/**
 * 计算文件的 MD5 哈希值（同会话同文件只算一次，见 hashMemoKey）
 * @param file - 要计算哈希的文件
 * @returns Promise<string> - 文件的 MD5 哈希值
 */
export const calculateFileHash = (file: File): Promise<string> => {
  const key = hashMemoKey(file);
  if (key) {
    const hit = hashMemo.get(key);
    if (hit) return Promise.resolve(hit);
  }

  return computeFileHash(file).then((hash) => {
    if (!key) return hash;
    // 删除再插入 = 刷新插入序（Map 保序，最旧的键可被淘汰）
    hashMemo.delete(key);
    hashMemo.set(key, hash);
    while (hashMemo.size > HASH_MEMO_MAX) {
      const oldest = hashMemo.keys().next();
      if (oldest.done) break;
      hashMemo.delete(oldest.value);
    }
    return hash;
  });
};

/** 真正的全文件 MD5（无记忆化）。 */
const computeFileHash = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const buffer = e.target?.result as ArrayBuffer;
        const spark = new SparkMD5.ArrayBuffer();
        spark.append(buffer);
        const hash = spark.end();
        resolve(hash);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
};
