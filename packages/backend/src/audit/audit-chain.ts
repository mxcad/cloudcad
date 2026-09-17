///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use its software, documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 审计归档哈希链（#420，等保 8.1.4.3 审计记录保护）——纯函数模块。
 *
 * 无 NestJS/DI 依赖，供 AuditArchiveService（生成/续链）与
 * scripts/audit-archive-query.ts（--verify-chain 运维核验）共用，
 * 保证"生成"与"核验"使用同一链接哈希公式（单一事实源）。
 *
 * 链式结构：
 * - 每期归档产物 `<month>.chain.json` = { month, csvSha256, prevHash, chainHash }
 * - prevHash = 时间序前一期的 chainHash；首期约定为空串
 * - chainHash = SHA-256(`${month}|${csvSha256}|${prevHash}`) 十六进制
 * - 链头状态文件 `chain-head.json` = { latestMonth, latestChainHash }
 *
 * 保护边界：抗单机篡改（改任意一期 CSV/清单/链文件都会导致该期或后续期校验失败），
 * 但不抗"持有异地推送凭据的攻击者同步篡改本地与异地副本"（见 docs/compliance/audit-integrity.md）。
 */

import { createHash } from 'crypto';
import { createReadStream } from 'fs';
import * as fs from 'fs/promises';
import * as path from 'path';

/** 单期哈希链清单（`<month>.chain.json`） */
export interface AuditChainEntry {
  month: string;
  /** 本期 CSV 的 SHA-256（与 `.sha256` 清单一致） */
  csvSha256: string;
  /** 上一期 chainHash；首期为空串 */
  prevHash: string;
  /** 本期链接哈希 = SHA-256(`${month}|${csvSha256}|${prevHash}`) */
  chainHash: string;
}

/** 哈希链头状态（当前最新归档期链接哈希，随每日异地推送上行） */
export interface AuditChainHead {
  latestMonth: string;
  latestChainHash: string;
}

/** 哈希链校验结果（--verify-chain） */
export interface AuditChainVerifyResult {
  /** 校验通过的期数 */
  verifiedCount: number;
  /** 校验通过的月份（时间序） */
  months: string[];
  /** 首个断点期（时间序）；null = 链完整 */
  firstBreak: { month: string; reason: string } | null;
}

/** 月份目录名匹配（YYYY-MM） */
const MONTH_RE = /^\d{4}-\d{2}$/;

/**
 * 计算单期链接哈希：SHA-256(`${month}|${csvSha256}|${prevHash}`) 十六进制。
 * 纯函数，供生成（buildChain）与核验（verifyChain）共用。
 */
export function computeChainHash(
  month: string,
  csvSha256: string,
  prevHash: string
): string {
  return createHash('sha256')
    .update(`${month}|${csvSha256}|${prevHash}`)
    .digest('hex');
}

/** 流式计算文件 SHA-256（月度 CSV 可达数十 MB，避免整文件载入内存） */
export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** 列出归档目录中全部链清单月份（时间序升序） */
export async function listChainMonths(
  archivePath: string
): Promise<string[]> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(archivePath);
  } catch {
    return [];
  }
  return entries
    .filter((name) => name.endsWith('.chain.json'))
    .map((name) => name.replace(/\.chain\.json$/, ''))
    .filter((m) => MONTH_RE.test(m))
    .sort();
}

/**
 * 校验全部清单的链式连续性（--verify-chain 复用）：
 * 1. 逐期重算 chainHash 与清单一致（防单期篡改）；
 * 2. 逐期 prevHash 等于时间序前一期的 chainHash（防断链/插期/删期）；
 * 3. 首期 prevHash 须为空串。
 *
 * 返回首个断点期（时间序）；链完整时 firstBreak 为 null。
 * 注意：校验"已存在清单之间的连续性"，不校验"是否覆盖到最新"。
 */
export async function verifyChainFiles(
  archivePath: string
): Promise<AuditChainVerifyResult> {
  const months = await listChainMonths(archivePath);
  const result: AuditChainVerifyResult = {
    verifiedCount: 0,
    months: [],
    firstBreak: null,
  };
  if (months.length === 0) {
    return result;
  }

    let prevChainHash = ''; // 首期 prevHash 约定为空串
    for (const month of months) {
      const entryPath = path.join(archivePath, `${month}.chain.json`);
      let entry: AuditChainEntry;
      try {
        entry = JSON.parse(
          await fs.readFile(entryPath, 'utf8')
        ) as AuditChainEntry;
      } catch (error) {
        result.firstBreak = {
          month,
          reason: `CHAIN_FILE_UNREADABLE: ${(error as Error).message}`,
        };
        return result;
      }

      // 1. 重算 chainHash（防单期清单篡改）
      const expectedChainHash = computeChainHash(
        entry.month,
        entry.csvSha256,
        entry.prevHash
      );
      if (expectedChainHash !== entry.chainHash) {
        result.firstBreak = {
          month,
          reason: `CHAIN_HASH_MISMATCH: expected=${expectedChainHash} actual=${entry.chainHash}`,
        };
        return result;
      }

      // 2. 实际 CSV 内容哈希须等于 entry.csvSha256（防 CSV 本体被篡改/截断）
      const csvPath = path.join(archivePath, `${month}.csv`);
      let actualCsvSha: string;
      try {
        actualCsvSha = await sha256File(csvPath);
      } catch (error) {
        result.firstBreak = {
          month,
          reason: `CSV_UNREADABLE: ${(error as Error).message}`,
        };
        return result;
      }
      if (actualCsvSha !== entry.csvSha256) {
        result.firstBreak = {
          month,
          reason: `CSV_MISMATCH: expected=${entry.csvSha256} actual=${actualCsvSha}`,
        };
        return result;
      }

      // 3. prevHash 须等于上一期的 chainHash（防断链/插期/删期）
      if (entry.prevHash !== prevChainHash) {
        result.firstBreak = {
          month,
          reason: `PREV_HASH_BREAK: expected=${prevChainHash || '(空,首期)'} actual=${entry.prevHash || '(空)'}`,
        };
        return result;
      }

      result.verifiedCount++;
      result.months.push(month);
      prevChainHash = entry.chainHash;
    }
    return result;
  }
