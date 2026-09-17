///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use its software, documentation, and related materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 审计归档查询/核验脚本（#324 查询，#420 哈希链核验）
 *
 * DB 只查热数据（183 天内），超期记录在归档 CSV 中，本脚本供运维：
 * - 检索归档：定位月份分片 → SHA-256 清单校验（不匹配拒绝输出）→ 解析 CSV
 *   （RFC 4180，兼容 UTF-8 BOM）→ 过滤 → 输出表格/JSON。
 * - 核验哈希链（#420）：`--verify-chain` 校验全部月度清单的链式连续性
 *   （单期篡改/断链/插期/删期均可检出），与归档生成共用同一链接哈希公式
 *   （src/audit/audit-chain.ts 单一事实源）。
 *
 * 仅限运维人员在本机使用（无网络暴露，等保最小权限）。
 *
 * 使用方式：
 * ```bash
 * cd packages/backend
 * # 检索某月归档
 * pnpm audit:archive-query -- --month 2026-07 [--userId u] [--action a] [--keyword k] [--json] [--dir path]
 * # 核验全部清单哈希链
 * pnpm audit:archive-query -- --verify-chain [--dir path] [--json]
 * ```
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { verifyChainFiles } from '../src/audit/audit-chain';

interface QueryArgs {
  month: string;
  userId?: string;
  action?: string;
  keyword?: string;
  json: boolean;
  dir: string;
  verifyChain: boolean;
}

function parseArgs(argv: string[]): QueryArgs {
  const args: QueryArgs = {
    month: '',
    json: false,
    dir: 'data/archives/audit-logs',
    verifyChain: false,
  };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--month':
        args.month = argv[++i] ?? '';
        break;
      case '--userId':
        args.userId = argv[++i];
        break;
      case '--action':
        args.action = argv[++i];
        break;
      case '--keyword':
        args.keyword = argv[++i];
        break;
      case '--json':
        args.json = true;
        break;
      case '--dir':
        args.dir = argv[++i] ?? args.dir;
        break;
      case '--verify-chain':
        args.verifyChain = true;
        break;
      default:
        console.error(`未知参数: ${argv[i]}`);
        printUsage();
        process.exit(1);
    }
  }
  // --verify-chain 模式不要求 --month；检索模式 --month 必填
  if (!args.verifyChain && !/^\d{4}-\d{2}$/.test(args.month)) {
    console.error('--month 必填，格式 YYYY-MM（或改用 --verify-chain 核验哈希链）');
    printUsage();
    process.exit(1);
  }
  return args;
}

function printUsage(): void {
  console.error(
    '用法:\n' +
      '  检索: pnpm audit:archive-query -- --month YYYY-MM [--userId <用户>] [--action <操作>] [--keyword <关键字>] [--json] [--dir <归档目录>]\n' +
      '  核验: pnpm audit:archive-query -- --verify-chain [--dir <归档目录>] [--json]'
  );
}

/** RFC 4180 解析：双引号包裹字段、内部引号翻倍、CRLF/LF 行尾 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.verifyChain) {
    const dir = path.resolve(args.dir);
    // 目录缺失须显式报错（退出码 1），不得静默报告"0 期链完整"
    if (!fs.existsSync(dir)) {
      const missing = {
        verifiedCount: 0,
        months: [] as string[],
        firstBreak: { month: '', reason: 'ARCHIVE_DIR_MISSING' },
      };
      if (args.json) {
        console.log(JSON.stringify(missing, null, 2));
      } else {
        console.error(`归档目录不存在: ${dir}（AUDIT_ARCHIVE_PATH 配置有误或尚未归档）`);
      }
      process.exit(1);
    }
    const result = await verifyChainFiles(dir);
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.firstBreak) {
      console.error(
        `哈希链校验失败：断点 ${result.firstBreak.month}（${result.firstBreak.reason}），` +
          `已通过 ${result.verifiedCount} 期`
      );
    } else {
      console.error(
        `哈希链校验通过：${result.verifiedCount} 期连续完整` +
          (result.months.length
            ? `（${result.months[0]} … ${result.months[result.months.length - 1]}）`
            : '（无链清单）')
      );
    }
    process.exit(result.firstBreak ? 1 : 0);
  }

  const csvPath = path.resolve(args.dir, `${args.month}.csv`);
  const manifestPath = path.resolve(args.dir, `${args.month}.sha256`);

  if (!fs.existsSync(csvPath)) {
    console.error(`未找到归档文件: ${csvPath}（该月份未归档或目录配置有误）`);
    process.exit(1);
  }

  // fail-closed：先校验 SHA-256 清单，不匹配/缺失一律拒绝输出
  const csvBuffer = fs.readFileSync(csvPath);
  const actual = createHash('sha256').update(csvBuffer).digest('hex');
  if (!fs.existsSync(manifestPath)) {
    console.error(`校验清单缺失: ${manifestPath}，拒绝输出（fail-closed）`);
    process.exit(1);
  }
  const manifest = fs.readFileSync(manifestPath, 'utf8').trim();
  const expected = manifest.split(/\s+/)[0]?.toLowerCase();
  if (expected !== actual) {
    console.error(
      `SHA-256 校验失败，归档文件可能被篡改或损坏，拒绝输出:\n  清单: ${expected}\n  实际: ${actual}`
    );
    process.exit(1);
  }

  // 去 BOM 后解析；首行为中文表头（与 buildAuditCsv 字段一致）
  const rows = parseCsv(csvBuffer.toString('utf8').replace(/^\uFEFF/, ''));
  if (rows.length < 2) {
    console.log('归档分片为空');
    return;
  }
  const header = rows[0];

  const records = rows.slice(1).map((row) => {
    const obj: Record<string, string> = {};
    header.forEach((name, idx) => (obj[name] = row[idx] ?? ''));
    return obj;
  });

  const filtered = records.filter((rec) => {
    if (args.userId && !rec['操作用户']?.includes(args.userId)) {
      return false;
    }
    if (args.action && rec['操作'] !== args.action) {
      return false;
    }
    if (args.keyword) {
      const joined = Object.values(rec).join('\n');
      if (!joined.includes(args.keyword)) return false;
    }
    return true;
  });

  console.error(
    `归档 ${args.month}.csv 校验通过（sha256 ${actual.slice(0, 12)}…），` +
      `共 ${records.length} 条，匹配 ${filtered.length} 条`
  );

  if (args.json) {
    console.log(JSON.stringify(filtered, null, 2));
  } else {
    console.table(filtered);
  }
}

void main().catch((err) => {
  console.error(`执行失败: ${(err as Error).message}`);
  process.exit(1);
});
