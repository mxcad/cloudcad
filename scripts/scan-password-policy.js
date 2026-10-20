/**
 * 口令策略同步门禁（scan:password-policy，挂根 pnpm check）。
 *
 * 口令策略（最小长度 / 字符类别构成）是**按部署可配置的运行时事实**：
 * 后端 runtimeConfig 键 passwordPolicyMinLength / passwordPolicyMinCategories
 * （运维可改、env 可覆盖、安全模式 profile 有不同目标值），经
 * /runtime-config/public 下发，前端必须从生效值渲染提示与预检。
 *
 * 两道检查：
 *   A. 扫两个前端包源码的硬编码策略字面量（「至少 N 位」/「至少 N 个字符」/
 *      MIN_PASSWORD_LENGTH /「三类」）——languages/ 编译语言包与两端唯一出口
 *      helper（及其 spec）豁免；
 *   B. 回落值同步：后端定义表 defaultValue ≡ platform PASSWORD_POLICY 兜底 ≡
 *      两端前端回落字面量（DEFAULT_CONFIG/DEFAULTS 与 map 回落）。
 *      后端改默认值而任一兜底没跟着改，红灯。
 *
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
