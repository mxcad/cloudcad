/**
 * 口令策略同步门禁（scan:password-policy，挂根 pnpm check）。
 *
 * 口令策略（最小长度 / 字符类别构成）是**按部署可配置的运行时事实**：
 * 后端 runtimeConfig 键 passwordPolicyMinLength / passwordPolicyMinCategories
 * （运维可改、env 可覆盖、安全模式 profile 有不同目标值），经
 * /runtime-config/public 下发，前端必须从生效值渲染提示与预检。
 *
 * 三道检查：
 *   A. 扫两个前端包源码的硬编码策略字面量（「至少 N 位」/「至少 N 个字符」/
 *      MIN_PASSWORD_LENGTH /「三类」）——languages/ 编译语言包与两端唯一出口
 *      helper（及其 spec）豁免；
 *   B. 回落值同步：后端定义表 defaultValue ≡ platform PASSWORD_POLICY 兜底 ≡
 *      两端前端回落字面量（DEFAULT_CONFIG/DEFAULTS 与 map 回落）。
 *      后端改默认值而任一兜底没跟着改，红灯。
 *   C. 「类别构成」判定体同步：四个字符类别正则必须同时出现在
 *      platform/password-policy.ts 与 backend/password-policy.service.ts
 *      （后端无法依赖 platform，判定体永久两份，靠这里拦单侧改动）；
 *      并且**全仓不得出现第三条持有者**——四条判据齐全的文件若不在上述两处，
 *      说明又抄了一份「类别构成」判定（客户端一律走 getPasswordClassFlags）。
 *
 * 服务端不再需要兜底门禁：getValue 的签名只有 key 一个参数，调用方传字面量
 * 默认值直接编译失败。
 * 用法: node scripts/scan-password-policy.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const SCAN_DIRS = [
  path.join(ROOT, 'packages', 'frontend', 'src'),
  path.join(ROOT, 'packages', 'frontend_mobile', 'src'),
];

// 唯一出口及其测试：策略文案只允许出现在这里（且全部是动态推导）
const EXCLUDED = new Set([
  'packages/frontend/src/lib/passwordPolicy.ts',
  'packages/frontend/src/lib/passwordPolicy.spec.ts',
  'packages/frontend_mobile/src/utils/passwordPolicy.ts',
  'packages/frontend_mobile/src/utils/passwordPolicy.spec.ts',
]);

// skip：行命中该正则时跳过本模式（用户名 3-20 是固定规则而非运行时策略，
// 「用户名至少3个字符」是合法静态文案，不算口令策略失同步）
const PATTERNS = [
  { re: /至少\s*\d+\s*位/, label: '写死的「至少 N 位」' },
  {
    re: /至少\s*\d+\s*个字符/,
    label: '写死的「至少 N 个字符」',
    skip: /用户名/,
  },
  { re: /MIN_PASSWORD_LENGTH/, label: '写死的 MIN_PASSWORD_LENGTH 常量' },
  { re: /三类/, label: '写死的「三类」（策略类别数）' },
];

// 测试查询/断言行：出现的是「动态渲染结果的期望值」（如 getByPlaceholderText(/至少 10 位/)），
// 不是写死的 UI 文案——源码侧的写死由上面的模式在源码行上拦住
const TEST_LINE = /getBy|expect\(/;

/**
 * 逐行剥离注释（块注释状态跨行延续），行号保持不变。
 * 不剥注释会把 JSDoc/行注释里的策略数字（如「长度≥10」）当成硬编码 → 假阳性。
 * 字符串态感知：'https://...' 里的 // 不是注释。
 */
function stripComments(src) {
  const lines = src.split('\n');
  let inBlock = false;
  return lines.map((line) => {
    let out = '';
    let inS = false;
    let inD = false;
    let inT = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const prev = i > 0 ? line[i - 1] : '';
      if (inBlock) {
        if (c === '*' && line[i + 1] === '/') {
          inBlock = false;
          i++;
        }
        continue;
      }
      if (!inS && !inD && !inT) {
        if (c === '/' && line[i + 1] === '/') break;
        if (c === '/' && line[i + 1] === '*') {
          inBlock = true;
          i++;
          continue;
        }
      }
      if (c === "'" && !inD && !inT && prev !== '\\') inS = !inS;
      else if (c === '"' && !inS && !inT && prev !== '\\') inD = !inD;
      else if (c === '`' && !inS && !inD) inT = !inT;
      out += c;
    }
    return out;
  });
}

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'languages') continue; // 编译产物/翻译，非源码
      walk(full, out);
    } else if (/\.(ts|tsx|vue|js)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

const issues = [];

// ── 检查 A：前端源码硬编码策略字面量 ──
const scanned = [];
for (const dir of SCAN_DIRS) walk(dir, scanned);

for (const file of scanned) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  if (EXCLUDED.has(rel)) continue;
  const lines = stripComments(fs.readFileSync(file, 'utf8'));
  lines.forEach((line, i) => {
    for (const { re, label, skip } of PATTERNS) {
      if (skip && skip.test(line)) continue;
      if (TEST_LINE.test(line)) continue;
      if (re.test(line)) {
        issues.push(`${rel}:${i + 1}  ${label}：${line.trim()}`);
      }
    }
  });
}

// ── 检查 B：回落值同步（后端 defaultValue ≡ platform 兜底 ≡ 两端前端回落） ─
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

// 后端定义表：取 key 所在块（到下一个 key: 为止）里的 defaultValue
function backendDefault(key) {
  const src = read(
    'packages/backend/src/runtime-config/runtime-config.constants.ts'
  );
  const seg = src
    .split('key: ')
    .slice(1)
    .find((s) => s.startsWith(`'${key}',`));
  const m = seg && seg.match(/defaultValue:\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

// platform PASSWORD_POLICY 兜底常量
function platformFallback() {
  const src = read('packages/platform/src/auth/password-policy.ts');
  const block = src.slice(src.indexOf('PASSWORD_POLICY'));
  const len = block.match(/minLength:\s*(\d+)/);
  const cats = block.match(/minCategories:\s*(\d+)/);
  return {
    minLength: len ? Number(len[1]) : null,
    minCategories: cats ? Number(cats[1]) : null,
  };
}

// 前端文件里某键的全部字面量回落（`key: N` 与 `key ?? N` 两种形态，逐行匹配）
function frontendLiterals(rel, key) {
  const found = [];
  read(rel)
    .split('\n')
    .forEach((line, i) => {
      if (!line.includes(key)) return;
      for (const m of line.matchAll(/(?::\s*|\?\?\s*)(\d+)/g)) {
        found.push({ line: i + 1, value: Number(m[1]) });
      }
    });
  return found;
}

const KEYS = {
  passwordPolicyMinLength: {
    platformKey: 'minLength',
    pcFile: 'packages/frontend/src/contexts/RuntimeConfigContext.tsx',
    mobileFile: 'packages/frontend_mobile/src/composables/useRuntimeConfig.ts',
  },
  passwordPolicyMinCategories: {
    platformKey: 'minCategories',
    pcFile: 'packages/frontend/src/contexts/RuntimeConfigContext.tsx',
    mobileFile: 'packages/frontend_mobile/src/composables/useRuntimeConfig.ts',
  },
};

const expected = {
  passwordPolicyMinLength: backendDefault('passwordPolicyMinLength'),
  passwordPolicyMinCategories: backendDefault('passwordPolicyMinCategories'),
};
const pf = platformFallback();

for (const [key, spec] of Object.entries(KEYS)) {
  const want = expected[key];
  if (want === null) {
    issues.push(
      `后端 runtime-config.constants.ts 找不到 ${key} 的 defaultValue`
    );
    continue;
  }
  if (pf[spec.platformKey] !== want) {
    issues.push(
      `packages/platform/src/auth/password-policy.ts  PASSWORD_POLICY.${spec.platformKey}=${pf[spec.platformKey]} ≠ 后端 defaultValue=${want}`
    );
  }
  for (const file of [spec.pcFile, spec.mobileFile]) {
    for (const { line, value } of frontendLiterals(file, key)) {
      if (value !== want) {
        issues.push(
          `${file}:${line}  ${key} 回落值=${value} ≠ 后端 defaultValue=${want}`
        );
      }
    }
  }
}

// ── 检查 C：「类别构成」判定的两份副本必须同口径 ──
// 后端无法依赖 @cloudcad/platform（platform 无构建步骤、只吃 TS 源码，
// 后端产物是纯 CJS、require 不了 .ts），所以长度/复杂度判定在后端与 platform
// 各保留一份。参数漂移由检查 B 拦住，判定体本身靠这里：四个字符类别正则
// 一旦只在其中一份被改，前端的预检与「建议清单」就会与后端权威校验分叉。
const CATEGORY_PREDICATES = ['[a-z]', '[A-Z]', '\\d', '[^a-zA-Z0-9]'];
const CATEGORY_HOLDS = [
  'packages/platform/src/auth/password-policy.ts',
  'packages/backend/src/auth/services/password-policy.service.ts',
];

for (const rel of CATEGORY_HOLDS) {
  const src = read(rel);
  for (const cls of CATEGORY_PREDICATES) {
    if (!src.includes(`/${cls}/`)) {
      issues.push(
        `${rel} 缺少字符类别判据 /${cls}/——「类别构成」判定必须与另一份副本同口径`
      );
    }
  }
}

// 全仓扫「第四条副本」：四条判据齐全才判（只用其中一条的合法用例不报）。
// 必须逐条扫——这套判据曾抄进 password-strength 与 PC AdminPasswordChange 的
// 建议清单，第一次收敛只按「类别数」关键字搜，两处都被漏掉。
const CODE_EXT = new Set(['.ts', '.tsx', '.vue', '.js']);
const IGNORE_SEG = new Set(['node_modules', 'dist', 'languages', 'translations']);
const IGNORE_FILE = /\.(spec|test)\.[a-z]+$/;

function listSourceFiles() {
  const files = [];
  const walk = (dir) => {
    let ents = [];
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const ent of ents) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (!IGNORE_SEG.has(ent.name)) walk(abs);
        continue;
      }
      const rel = path.relative(ROOT, abs).split(path.sep).join('/');
      if (!CODE_EXT.has(path.extname(rel))) continue;
      if (IGNORE_FILE.test(rel)) continue;
      files.push(rel);
    }
  };
  walk(path.join(ROOT, 'packages'));
  return files;
}

for (const rel of listSourceFiles()) {
  if (CATEGORY_HOLDS.includes(rel)) continue;
  const src = read(rel);
  const all = CATEGORY_PREDICATES.every((cls) => src.includes(`/${cls}/`));
  if (all) {
    issues.push(
      `${rel} 四条字符类别判据齐全——「类别构成」判定已重复实现（同能力 ≥3 份即缺陷）；` +
        '客户端请改用 @cloudcad/platform 的 getPasswordClassFlags'
    );
  }
}

// ── 汇总 ──
if (issues.length > 0) {
  console.error(`\nscan:password-policy 发现 ${issues.length} 处问题：\n`);
  for (const issue of issues) console.error(`  ✗ ${issue}`);
  console.error(
    '\n口令策略是运行时事实：提示/预检必须经 /runtime-config/public 生效值渲染；' +
      '兜底常量必须与后端 defaultValue 同步。'
  );
  process.exit(1);
}
console.log(
  'scan:password-policy OK：无硬编码策略字面量，回落值与后端 defaultValue 同步'
);
