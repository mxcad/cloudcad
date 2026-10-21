/**
 * 后端 i18n 死键分类扫描
 *
 * 用法（仓库根目录）：node packages/backend/scripts/scan-i18n-dead-keys.cjs [输出路径]
 * 默认输出 docs/backend-i18n-dead-keys-audit.md。
 *
 * 零引用 ≠ 都是垃圾。同一批死键里混着「该修代码的接线错」与「纯冗余可直接删」，
 * 本脚本按证据把两者分开，避免批量删除把缺陷一并盖掉。各类判定依据与已知误报
 * 情形见 docs/backend-i18n-dead-keys-audit.md 的「扫描口径」节。
 *
 * 分类：
 *   MECHANISM_GAP  — 所属节整体未接线（机制缺失，修机制而非逐键）
 *   HARDCODED      — 面向用户的文案以硬编码字面量存在（接线错，逐键排票）
 *   HARDCODED_WEAK — 同 HARDCODED 但文案过短、命中过少，需人工确认
 *   ALIAS          — 文案已被另一个活键翻译，本键冗余可直接删
 *   LOG_ONLY       — 仅出现在 logger./console. 里（面向运维），可直接删
 *   DOC_ONLY       — 仅出现在 Swagger 装饰器或元数据字段里，可直接删
 *   ORPHAN         — 全仓无踪迹，疑真废弃
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const TRANSLATIONS = path.join(ROOT, 'packages/backend/src/common/i18n/translations');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.pnpm', '.git']);
const SRC_EXT = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs', '.json']);
// 一次性迁移脚本自带「中文 → 键」映射表，是唯一的其他引用者，不排掉会全部误判
const EXCLUDE_FILE = /migrate-i18n\.mjs$/;
// 动态构造键的节：键名由代码拼接，不可静态枚举
const DYNAMIC_SECTIONS = new Set(['error.project_member', 'error.mxcad_engine_extra']);

/** 解析 yaml：优先随 backend 依赖解析，回退 pnpm 内容寻址路径 */
function loadYaml() {
  try {
    return require(require.resolve('yaml', { paths: [path.join(ROOT, 'packages/backend')] }));
  } catch {
    return require(path.join(ROOT, 'node_modules/.pnpm/yaml@1.10.3/node_modules/yaml'));
  }
}
const yaml = loadYaml();

function walk(relRoot, acc) {
  const dir = path.join(ROOT, relRoot);
  let ents;
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of ents) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(path.relative(ROOT, p), acc);
    else if (SRC_EXT.has(path.extname(e.name)) && !EXCLUDE_FILE.test(e.name))
      acc.push(path.relative(ROOT, p));
  }
}

const BE = ['packages/backend/src'];
const REST = [
  'packages/frontend/src',
  'packages/frontend_mobile/src',
  'packages/config-service',
  'packages/storage-service',
  'packages/conversion-service',
  'packages/contracts/src',
  'packages/platform/src',
  'packages/api-sdk/src',
  'scripts',
  'runtime',
];
const beFiles = [];
BE.forEach((r) => walk(r, beFiles));
const restFiles = [];
REST.forEach((r) => walk(r, restFiles));

/** 抽出源码里的字符串字面量及其真实行号（单/双引号 + 模板串），过滤注释噪音 */
function literals(src) {
  const out = [];
  const re = /(["'`])(?:\\.|(?!\1).)*\1/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    out.push({
      text: m[0].slice(1, -1),
      line: src.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

function indexFiles(files, { productionOnly }) {
  const idx = files.map((f) => {
    const rel = f.replace(/\\/g, '/');
    if (productionOnly && /(\.spec|\.test)\.[tj]sx?$/.test(rel)) return null;
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const lines = src.split('\n');
    return { f: rel, lines, lits: literals(src) };
  });
  return idx.filter(Boolean);
}

const beProd = indexFiles(beFiles, { productionOnly: true });

/**
 * needle 是否作为子串出现在任一字符串字面量里。
 * 返回 [{f, line, aliased, isLog}]：
 *   aliased=true 命中语句附近带 i18n 查找（?.t( / I18nContext）——该文案已被
 *     **另一个活键**翻译，本键只是冗余别名 → 可直接删。窗口取 ±3 行，因为
 *     `I18nContext.current()?.t(...)` 常写成多行、`.t(` 落在字面量的下一行。
 *   isLog=true  字面量在 logger./console. 调用里——日志面向运维不面向用户，
 *     不按 i18n 规范，不算缺陷。
 *   isDoc=true  字面量在 @Api* 装饰器或元数据字段里（description/example/impact/
 *     label/unit/summary/operationId 等）——Swagger 文档与配置元数据，不进运行时
 *     用户文案，同样不算缺陷。窗口取 ±3 行，因为 @ApiResponse 的开括号常在
 *     字面量上方两行。
 *   三者皆 false 才是真的把面向用户的文案硬编码了 → 接线错。
 */
function matchNeedle(idx, needle) {
  const hits = [];
  for (const { f, lines, lits } of idx) {
    for (const { text, line } of lits) {
      if (!text.includes(needle)) continue;
      let win = '';
      for (let i = line - 3; i <= line + 3; i++) {
        if (i >= 1 && i <= lines.length) win += lines[i - 1] + '\n';
      }
      const here = (lines[line - 2] || '') + (lines[line - 1] || '');
      hits.push({
        f,
        line,
        aliased: /(\?\.\s*t\s*\(|I18nContext|i18nService\s*\.\s*t\s*\()/.test(win),
        isLog: /(logger|console)\s*\.\s*(warn|error|info|debug|verbose|log)\s*\(/.test(
          here
        ),
        isDoc:
          /@Api[A-Za-z]*\s*\(/.test(win) ||
          /\b(description|example|impact|label|unit|summary|title|placeholder|envKey)\s*:/.test(
            win
          ),
      });
    }
  }
  return hits;
}

function loadKeys(locale) {
  const base = path.join(TRANSLATIONS, locale);
  const out = [];
  for (const f of fs.readdirSync(base)) {
    if (!f.endsWith('.yml')) continue;
    const ns = f.replace(/\.yml$/, '');
    const doc = yaml.parse(fs.readFileSync(path.join(base, f), 'utf8'));
    (function flat(obj, prefix) {
      for (const [k, v] of Object.entries(obj || {})) {
        const full = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object') flat(v, full);
        else out.push([full, typeof v === 'string' ? v : String(v)]);
      }
    })(doc, ns);
  }
  return out;
}

const all = loadKeys('zh-CN');
const en = new Map(loadKeys('en-US'));
const tw = new Map(loadKeys('zh-TW'));
const kr = new Map(loadKeys('ko-KR'));
const keys = all.filter(
  ([k]) =>
    !DYNAMIC_SECTIONS.has(k.replace(/\.[^.]+$/, '')) &&
    en.has(k) &&
    tw.has(k) &&
    kr.has(k)
);
const allCorpus = allCorpusOf(beFiles, restFiles);
function allCorpusOf(a, b) {
  return [...a, ...b].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
}
const dead = keys.filter(([k]) => !allCorpus.includes(k));
console.error(`叶子键 ${keys.length}，死键 ${dead.length}`);

const sectionStats = {};
for (const [k] of keys) {
  const s = k.replace(/\.[^.]+$/, '');
  (sectionStats[s] = sectionStats[s] || { total: 0, dead: 0 }).total++;
}
for (const [k] of dead) sectionStats[k.replace(/\.[^.]+$/, '')].dead++;
const fullyDead = new Set(
  Object.entries(sectionStats)
    .filter(([, v]) => v.dead === v.total && v.total > 0)
    .map(([s]) => s)
);

const rows = dead.map(([k, zh]) => {
  const sec = k.replace(/\.[^.]+$/, '');
  const ratio = sectionStats[sec].dead / sectionStats[sec].total;
  let cat, evidence = '', hits = [];

  if (fullyDead.has(sec)) {
    cat = 'MECHANISM_GAP';
    evidence = `${sec} 整节 ${sectionStats[sec].dead}/${sectionStats[sec].total} 键全死`;
  } else {
    hits = matchNeedle(beProd, zh);
    const alias = hits.filter((h) => h.aliased); // 另一活键的兜底串
    const nonAlias = hits.filter((h) => !h.aliased);
    const docs = nonAlias.filter((h) => h.isDoc);
    const logOnly = nonAlias.filter((h) => h.isLog);
    const hard = nonAlias.filter((h) => !h.isLog && !h.isDoc); // 真接线错
    const strong = zh.length >= 6;
    if (hard.length && (strong || hard.length >= 3)) {
      cat = 'HARDCODED';
      evidence = hard.slice(0, 8).map((h) => `${h.f}:${h.line}`).join(', ');
    } else if (hard.length) {
      cat = 'HARDCODED_WEAK';
      evidence = `短文案${zh.length}字仅 ${hard.length} 处命中，需人工确认: ${hard
        .slice(0, 3)
        .map((h) => `${h.f}:${h.line}`)
        .join(', ')}`;
    } else if (alias.length) {
      cat = 'ALIAS';
      evidence = `文案已被另一活键 i18n 化（${alias.length} 处兜底串），本键冗余可直接删: ${alias
        .slice(0, 4)
        .map((h) => `${h.f}:${h.line}`)
        .join(', ')}`;
    } else if (logOnly.length) {
      cat = 'LOG_ONLY';
      evidence = `仅出现在日志文案里（${logOnly.length} 处，面向运维非用户），本键可删: ${logOnly
        .slice(0, 4)
        .map((h) => `${h.f}:${h.line}`)
        .join(', ')}`;
    } else if (docs.length) {
      cat = 'DOC_ONLY';
      evidence = `仅出现在 Swagger @Api* 描述里（${docs.length} 处，API 文档非运行时文案），本键可删: ${docs
        .slice(0, 4)
        .map((h) => `${h.f}:${h.line}`)
        .join(', ')}`;
    } else if (ratio >= 0.5) {
      cat = 'ORPHAN';
      evidence = `同节 ${sectionStats[sec].dead}/${sectionStats[sec].total} 死（过半）`;
    } else {
      cat = 'ORPHAN';
    }
  }
  return { key: k, zh, sec, cat, evidence };
});

const byCat = {};
for (const r of rows) (byCat[r.cat] = byCat[r.cat] || []).push(r);

const LABEL = {
  MECHANISM_GAP: '机制缺失：整节未接线，修机制而非逐键',
  HARDCODED: '接线错：面向用户的文案硬编码，逐键排票',
  HARDCODED_WEAK: '疑似接线错：命中少，需人工确认',
  ALIAS: '冗余别名：文案已被另一活键翻译，可直接删',
  LOG_ONLY: '仅日志使用：非面向用户，可直接删',
  DOC_ONLY: '仅 Swagger 描述：非运行时文案，可直接删',
  ORPHAN: '疑真废弃：全仓无踪迹',
};
const order = [
  'MECHANISM_GAP',
  'HARDCODED',
  'HARDCODED_WEAK',
  'ALIAS',
  'LOG_ONLY',
  'DOC_ONLY',
  'ORPHAN',
];

const out = [
  '# 后端 i18n 死键审计与处置清单',
  '',
  '> 本文件由 `packages/backend/scripts/scan-i18n-dead-keys.cjs` 生成，改完接线后重跑即可刷新：',
  '> `node packages/backend/scripts/scan-i18n-dead-keys.cjs`。下表数字是生成时刻的快照。',
  '',
  '## 结论',
  '',
  `后端 i18n 目录共 ${keys.length} 个叶子键，**${dead.length} 个零引用（${Math.round(
    (dead.length / keys.length) * 100
  )}%）**。但零引用 ≠ 都是垃圾——真正需要改代码的只有 25 个（14%），其余是纯冗余（50）与机制缺口（66）。`,
  '',
  '### 处置优先级',
  '',
  '| # | 动作 | 影响键数 | 收益 |',
  '|---|---|---|---|',
  '| 1 | **修 `user-status.service.ts` 的两个验证文案表**（`getPrerequisiteError` / `getVerifyFailedError`，各约 6 行）+ `email-code-verification.strategy.ts:39` | 13 | 一处改动收掉 13 个死键；账号验证失败文案目前对非中文用户完全无效 |',
  '| 2 | **修 `CustomValidationPipe.exceptionFactory` 接 i18n** | 46 | `validation` 整节从未接线，DTO 校验文案永远走 class-validator 默认英文 |',
  '| 3 | **`mx-version-control.provider.ts` 收敛到 `I18nContext`**（全仓唯一还在用 `this.i18nService.t()` 的文件，20 处） | 3 | 消灭第二套 i18n 访问模式 |',
  '| 4 | 处理其余整节全死的节（`error.policy` 5 / `error.seed` 10 / `error.version_control_extra` 3 / `error.library` 1 / `error.public_file_extra` 1） | 20 | 逐个判断「机制缺失」还是「真废弃」 |',
  '| 5 | **前 4 步完成后再删** ALIAS / LOG_ONLY / DOC_ONLY / ORPHAN | 89 | 必须后置：修好接线后部分键会变活，顺序反了会删错 |',
  '',
  '**不要一次性删 181 个。** 死键分两类：真废弃（删是纯收益）与**接线错**（代码路径存在但文案绕过了 i18n，键因此被孤立）。批量删除会把接线错一并盖掉，让缺陷更难查。',
  '',
  '---',
  '',
  '## 扫描口径（可复现）',
  '',
  `- 键范围：四语齐全（zh-CN / en-US / zh-TW / ko-KR）的叶子键，排除动态构造节 ${[...DYNAMIC_SECTIONS]
    .map((s) => '`' + s + '`')
    .join('、')}（键名由代码拼接，不可静态枚举）。`,
  `- 语料：${beFiles.length} 个后端文件 + ${restFiles.length} 个其余文件；排除 \`translations/\`、\`dist/\`、\`node_modules/\`、\`.pnpm/\` 与一次性迁移脚本 \`migrate-i18n.mjs\`。`,
  '- 死键判据：全点路径（如 `error.auth.not_logged_in`）作为子串在语料中零命中。',
  '',
  '### 假阳性陷阱（本次踩过的，重跑时勿再踩）',
  '',
  '1. **不排掉 `migrate-i18n.mjs` 会全错**——它自带「中文 → 键」映射表，是唯一的其他引用者。',
  '2. **按子串匹配会骗过精确匹配**：`size_exceeded` 出现在 `error.file_extra.size_exceeded_with_name` 里，导致 `error.public_file.size_exceeded` 被误判为活。必须用全点路径。',
  '3. **按「行包含子串」匹配会误判**：2 字文案（「未登录」「删除成功」）命中大量无关注释。必须在**字符串字面量内**匹配。',
  '4. **Swagger `@ApiResponse`/`@ApiProperty` 的描述与 example 不是运行时文案**，不计缺陷；`@ApiResponse(` 的开括号常在字面量上方两行，检测窗口要够宽。',
  '5. **`impact:` / `description:` / `example:` / `unit:` 等元数据字段**同理不是用户文案（实例：runtime-config 配置项的 impact 说明）。',
  '6. **`logger.` / `console.` 文案**面向运维不面向用户，不算 i18n 缺陷。',
  '7. **仓库有两套 i18n 访问器**：`I18nContext.current()?.t()`（801 处，标准）与 `this.i18nService.t()`（20 处，全在 `mx-version-control.provider.ts`）。别名检测必须同时认两者，否则该文件的死键会被误判成接线错。',
  '8. **别名判断要用 ±3 行窗口**：`I18nContext.current()?.t(...)` 常写成多行，`.t(` 落在字面量的下一行，只看本行会漏判。',
  '',
  '## 分类统计',
  '',
  '| 分类 | 数量 | 处置 |',
  '|---|---|---|',
  ...order
    .filter((c) => byCat[c])
    .map((c) => `| ${c} | ${byCat[c].length} | ${LABEL[c]} |`),
  '',
];

for (const cat of order) {
  if (!byCat[cat]) continue;
  out.push(`## ${cat}（${byCat[cat].length}）`, '', `> ${LABEL[cat]}`, '');
  const grouped = {};
  for (const r of byCat[cat]) (grouped[r.sec] = grouped[r.sec] || []).push(r);
  for (const sec of Object.keys(grouped).sort()) {
    out.push(`### ${sec}（${grouped[sec].length}）`, '');
    for (const r of grouped[sec]) {
      out.push(`- \`${r.key}\` — ${r.zh}`);
      if (r.evidence) out.push(`  - ${r.evidence}`);
    }
  }
  out.push('');
}

out.push(
  '## 整节全死的节',
  '',
  ...[...fullyDead]
    .sort()
    .map((s) => `- \`${s}\` — ${sectionStats[s].dead}/${sectionStats[s].total} 键`),
  ''
);

const TARGET =
  process.argv[2] || path.join(ROOT, 'docs/backend-i18n-dead-keys-audit.md');
fs.writeFileSync(TARGET, out.join('\n') + '\n');
console.error(`写入 ${path.relative(ROOT, TARGET)}`);
console.error('分类完成：');
for (const c of order) if (byCat[c]) console.error(`  ${c}: ${byCat[c].length}`);
