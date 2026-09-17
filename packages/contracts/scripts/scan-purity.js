#!/usr/bin/env node
// @cloudcad/contracts 纯度门禁（ADR-0069 准入四条的可执行检查）：
// 纯契约 module 必须保持「无 node:*、无框架 import、无 IO、无副作用」，
// 否则本包从「接口 + token」漂成「半个业务包」。逃逸口：需要 IO/框架时迁到独立包，
// 不得就地扩展。照 backend 的 scan:undeclared-params 范式，只报不改。
'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// 唯一允许的外部依赖（既有依赖，system-role.types.ts 用它取 Prisma 枚举值）
const ALLOWED_EXTERNAL = new Set(['@cloudcad/db']);

// 明确禁止的外部包：Node 内置（含子路径）+ NestJS 框架链
const BANNED_EXTERNAL = [
  /^node:/,
  /^@nestjs\//,
  /^reflect-metadata$/,
  /^class-validator$/,
  /^class-transformer$/,
];

// 副作用与 IO 痕迹：动态导入/require、fetch、process、globalThis。
// 注意 \b 只能放在 process/globalThis 后面：require( / import( / fetch( 以 ( 结尾，
// 再跟一个 \b 会因「( 与引号之间无词边界」而永不匹配（曾因此四类痕迹全部漏检）。
const SIDE_EFFECT_RE =
  /(?:^|[^A-Za-z0-9_"])(?:require\s*\(|import\s*\(|fetch\s*\(|process\b|globalThis\b)/g;

// 模块说明符：覆盖 `import x from 'a'`、`import { a } from 'b'`、`import type { a } from 'b'`
// 与副作用导入 `import 'a'`。必须用 matchAll 取第 1 捕获组——String.match 配全局正则
// 返回的是整条匹配文本（含 import ... from 前缀），按它比对清单会全部误报。
const IMPORT_SPEC_RE =
  /(?:^|\n)\s*import\s+(?:type\s+)?(?:[^'"]*?\s+from\s+)?['"]([^'"\n]+)['"]/g;

function collectTsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectTsFiles(full, out);
    else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const findings = [];

for (const file of collectTsFiles(SRC_DIR)) {
  const source = fs.readFileSync(file, 'utf8');
  const rel = path.relative(SRC_DIR, file);

  for (const match of source.matchAll(IMPORT_SPEC_RE)) {
    const spec = match[1];
    if (spec.startsWith('.')) continue;
    if (ALLOWED_EXTERNAL.has(spec)) continue;
    const banned = BANNED_EXTERNAL.find((re) => re.test(spec));
    findings.push(
      `${rel}: 禁止的外部 import '${spec}'${banned ? '（node:* / 框架包）' : '（未在允许清单内）'}`
    );
  }

  for (const match of source.matchAll(SIDE_EFFECT_RE)) {
    findings.push(`${rel}: 副作用/IO 痕迹 '${match[0].replace(/\s+/g, ' ')}'`);
  }
}

if (findings.length) {
  console.error(`@cloudcad/contracts 纯度检查失败（${findings.length} 项）：`);
  for (const finding of findings) console.error(`  - ${finding}`);
  console.error('');
  console.error(
    '纯契约 module 不得引入 node:* / 框架包 / IO / 副作用；需要这些能力时迁到独立包，见 ADR-0069。'
  );
  process.exit(1);
}

console.log(
  '@cloudcad/contracts 纯度检查通过（src/ 全部为纯 TypeScript 契约）'
);
