/**
 * 运行时配置登记表覆盖门禁（scan:runtime-config-registry，挂根 pnpm check）。
 *
 * 后端 `RUNTIME_CONFIG_DEFINITIONS` 持有分类/子分组/通道的**标识符**（稳定 slug），
 * 展示文案由前端 RuntimeConfigPage/meta.ts 的登记表按 slug 提供（ADR-0082 D6：
 * 标识符归后端、文案归前端 i18n，不把标签折进定义表）。
 *
 * 代价：meta.ts 是定义表的**镜像**，新增一个分类/子分组/通道要同时改两侧。
 * 漏改一侧不会报错，只会静默回落到降级形态：
 *   - 分类未登记 → 组标题退化成裸 slug，图标换成通用盾形；
 *   - 子分组未登记 → 小节标题退化成裸 slug；
 *   - 通道未登记进 CHANNEL_LABEL → 通道卡片标题退化成裸 slug；
 *   - 通道未登记进 CHANNEL_TEST_META → 回落到「不接收接收方」，
 *     而该通道的验证动作可能真的会读收件人（短信/邮件）——这是谎报，
 *     管理员会以为点验证不会发出任何东西。
 *
 * 本门禁只做一件事：后端定义表里出现的每个 slug 都必须在前端登记表里有条目。
 * 新增通道变成红灯构建，而不是页面上的静默降级。
 * 反方向（前端登记了后端没有的 slug）不查：那是「等下个版本接线的预留项」，
 * 由 meta.ts 的文档约定约束，不构成静默失效。
 *
 * 用法: node scripts/scan-runtime-config-registry.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEF_FILE =
  'packages/backend/src/runtime-config/runtime-config.constants.ts';
const META_FILE = 'packages/frontend/src/pages/RuntimeConfigPage/meta.ts';

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * 逐行剥离注释（块注释状态跨行延续，行号保持不变）。
 * 与 scan-password-policy.js 同实现：不剥注释会把 JSDoc 里的字面量当成配置。
 */
function stripComments(src) {
  return src.split('\n').map((line) => {
    let out = '';
    let inS = false;
    let inD = false;
    let inT = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      const prev = i > 0 ? line[i - 1] : '';
      if (!inS && !inD && !inT) {
        if (c === '/' && line[i + 1] === '/') break;
        if (c === '/' && line[i + 1] === '*') {
          // 块注释起始：本行剩余内容丢弃
          const close = line.indexOf('*/', i);
          if (close === -1) return '';
          i = close + 1;
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

/**
 * 定义表里某字段的取值集合：字段在 key 块内（`key: 'x'` 到下一个 `key: '`）。
 */
function definitionFieldValues(field) {
  const values = new Set();
  for (const seg of read(DEF_FILE)
    .split(/key:\s*'/)
    .slice(1)) {
    const m = seg.match(new RegExp(`${field}:\\s*'([^']*)'`));
    if (m) values.add(m[1]);
  }
  return values;
}

/**
 * meta.ts 里某对象登记表的一级 key 集合（`const NAME: ... = { ... };`）。
 * 只取对象字面量的顶层条目，避开条目体内嵌套的 `t(...)` / 图标引用。
 */
function registryKeys(name) {
  const src = stripComments(read(META_FILE)).join('\n');
  const start = src.indexOf(`const ${name}`);
  if (start === -1) return null;
  // 从 `=` 之后找 `{`：类型标注（Record<string, { ... }>）里也有花括号
  const eq = src.indexOf('=', start);
  const open = src.indexOf('{', eq);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;
  const keys = new Set();
  for (const line of src.slice(open + 1, end).split('\n')) {
    const m = line.match(/^\s*('[^']+'|[A-Za-z_]\w*)\s*:/);
    if (m) keys.add(m[1].replace(/^'|'$/g, ''));
  }
  return keys;
}

const issues = [];

const CHECKS = [
  { field: 'category', registry: 'CATEGORY_META', hint: '组标题与图标' },
  { field: 'subgroup', registry: 'SUBGROUP_META', hint: '子分组小节标题' },
  { field: 'channel', registry: 'CHANNEL_TEST_META', hint: '验证动作能力' },
  { field: 'channelSwitch', registry: 'CHANNEL_TEST_META', hint: '验证动作能力' },
];

// 通道名同时要有展示名与验证能力两条登记（两条表各自有各自的回落）
const CHANNEL_REGISTRIES = ['CHANNEL_LABEL', 'CHANNEL_TEST_META'];

for (const { field, registry, hint } of CHECKS) {
  const keys = registryKeys(registry);
  if (!keys) {
    issues.push(`${META_FILE} 找不到登记表 ${registry}`);
    continue;
  }
  for (const slug of [...definitionFieldValues(field)].sort()) {
    if (!keys.has(slug)) {
      issues.push(
        `后端定义表 ${field}:'${slug}' 未登记进 ${META_FILE} 的 ${registry}——` +
          `前端会静默降级到${hint}的回落形态`
      );
    }
  }
}

for (const slug of [...definitionFieldValues('channel')].sort()) {
  for (const registry of CHANNEL_REGISTRIES) {
    const keys = registryKeys(registry);
    if (keys && !keys.has(slug)) {
      issues.push(
        `后端通道 '${slug}' 未登记进 ${META_FILE} 的 ${registry}`
      );
    }
  }
}

// 定义表自身的口径：channelSwitch 必须指向一个已声明的 channel
const channels = definitionFieldValues('channel');
for (const slug of [...definitionFieldValues('channelSwitch')].sort()) {
  if (!channels.has(slug)) {
    issues.push(
      `后端 channelSwitch:'${slug}' 指向未声明 channel 的通道`
    );
  }
}

if (issues.length > 0) {
  console.error(
    `\nscan:runtime-config-registry 发现 ${issues.length} 处问题：\n`
  );
  for (const issue of issues) console.error(`  ✗ ${issue}`);
  console.error(
    '\n新增分类/子分组/通道必须同步前端 meta.ts 登记表；' +
      '漏登记不报错，只会静默降级（通道能力表会谎报「不接收接收方」）。'
  );
  process.exit(1);
}
console.log(
  'scan:runtime-config-registry OK：后端分类/子分组/通道 slug 全部有前端登记表条目'
);
