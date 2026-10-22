/**
 * @fileoverview 环境变量演进：废弃键清理与重命名
 *
 * 废弃任何环境变量都在 ENV_MIGRATIONS 加一条规则，升级时由 migrateEnvFiles 自动执行。
 * 两种操作：
 *   rename — 旧键改名（仅当新键不存在时搬值，绝不覆盖用户已填的新键）
 *   remove — 删除废弃键（可带 when 条件，避免误删用户真实值）
 *
 * 为什么独立于 mergeExampleIntoEnv：那个函数负责"example 新增项并入 .env"，语义是
 * 补齐而非清理。它的三条既有语义都让废弃键无法靠改模板自然清理——
 *   - example 注释掉旧键：用户 .env 侧仍是激活态 → 保留用户值
 *   - example 删掉旧键：落进 extraKeys 当"用户自定义配置"追加回来
 * 改它的通用语义不值得（config-updater.js:724 记着按"存在即激活"判过的前车之鉴：
 * 生产 CORS 白名单被整体替换，浏览器只报 Failed to fetch 且后端零日志）。
 * 清理是独立关注点，独立执行。
 *
 * 执行时机：升级路径的 merge 之后（cli.js）。首次部署生成的 .env 全新，无残留，
 * 故迁移不挂在 autoSetupAndShowPasswords 分支。
 *
 * 依赖方向：lib 只允许 require 其他 lib 或独立模块。本模块只用 node 内置模块，
 * 不依赖 config-updater（自己实现行级删除/改名，避免与 merge 耦合）。
 */

const fs = require('fs');
const path = require('path');

// 判定"模板残留"，与 packages/conversion-service/lib/env.ts 的 PLACEHOLDER_RE 同口径。
// 两处都是"这个值看着就是占位符、不可能被真用"的判据，改动须同步。
const PLACEHOLDER_RE = /your-|<[^>]*>|placeholder|changeme/i;

/**
 * 环境变量演进规则表。废弃或重命名环境变量在此加一条，无需改执行逻辑。
 *
 * @type {Array<{
 *   file: string,                         // 相对 PROJECT_ROOT 的 .env 路径
 *   key: string,                          // 待处理的旧键
 *   op: 'rename' | 'remove',
 *   to?: string,                          // rename 的目标键（rename 必填）
 *   when?: (value: string) => boolean,    // 仅当当前值满足条件才执行（默认总是执行）
 *   reason: string,                       // 为什么要动这个键（写进日志与代码注释）
 * }>}
 */
const ENV_MIGRATIONS = [
  {
    file: 'packages/conversion-service/.env',
    key: 'REDIS_URL',
    op: 'remove',
    when: (v) => PLACEHOLDER_RE.test(v),
    reason:
      '部署形态下 REDIS_URL 由 start.js / docker-runtime / verify-deploy 现场从后端 ' +
      'REDIS_* 拼串注入，.env 里的值永不生效；留着会误导运维去改一个无效的值',
  },
  {
    file: 'packages/conversion-service/.env',
    key: 'QUEUE_DRIVER',
    op: 'remove',
    when: (v) => v.trim().toLowerCase() === 'redis',
    reason:
      '与注入值相同的冗余配置——部署形态下 QUEUE_DRIVER 恒为 redis（start.js 硬编码），' +
      '.env 里的值被覆盖。仅清与注入相同的值，用户显式设 local 的调试意图予以保留',
  },
  {
    file: 'packages/backend/.env',
    key: 'QUEUE_DRIVER',
    op: 'remove',
    reason:
      '全仓零消费者——转换服务队列驱动由 conversion-service 自己的配置决定，backend 从不读' +
      '这个键；留着会让人误以为改这里能影响转换服务',
  },
];

/** 取一行的键名；非键值行（注释/空行/非法）返回 null。 */
function parseKey(line) {
  const m = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)=/);
  return m ? m[1] : null;
}

/** 取一行的值，剥成对引号（与 parseEnvFile 同口径）。 */
function extractValue(line) {
  const eq = line.indexOf('=');
  if (eq === -1) return '';
  let v = line.slice(eq + 1).trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    v = v.slice(1, -1);
  }
  return v;
}

/** 删除目标键的激活行；保留所有注释行与其余配置，逐字节不动它们。 */
function removeEnvKey(content, key) {
  const lines = content.split(/\r?\n/);
  const out = [];
  let removed = null;
  for (const line of lines) {
    if (parseKey(line) === key) {
      removed = extractValue(line);
      continue;
    }
    out.push(line);
  }
  return { content: out.join('\n'), removed };
}

/** 把旧键改名；新键已存在时不搬值（绝不覆盖用户已填的新键）。 */
function renameEnvKey(content, oldKey, newKey) {
  const lines = content.split(/\r?\n/);
  const idx = lines.findIndex((l) => parseKey(l) === oldKey);
  if (idx === -1) return { content, moved: false, value: null };
  const value = extractValue(lines[idx]);
  if (lines.some((l) => parseKey(l) === newKey)) {
    return { content, moved: false, value, newKeyExists: true };
  }
  lines[idx] = lines[idx].replace(new RegExp(`^${oldKey}=`), `${newKey}=`);
  return { content: lines.join('\n'), moved: true, value };
}

/**
 * 执行所有迁移规则，返回实际发生的变更。
 *
 * 幂等：已清理的键不再命中（removed === null 跳过），跑多次结果一致。
 * 文件不存在时静默跳过——首次部署无残留，且 conversion-service/.env 很多机器本来就没有
 * （bootstrap 不合并该文件，见 manifest.js:139 的注释与实际行为不符）。
 * 规则写错（未知 op / rename 缺 to）跳过该条而非抛错，避免升级因单条规则坏掉而中断。
 *
 * @param {string} projectRoot 项目根目录
 * @param {(message: string) => void} [logFn] 变更回调，默认静默
 * @param {Array} [rules] 规则表，默认 ENV_MIGRATIONS（注入以便测试覆盖 rename 路径）
 * @returns {Array<{file:string, key:string, op:string, reason:string, removed?:string, moved?:boolean, to?:string}>}
 */
function migrateEnvFiles(
  projectRoot,
  logFn = () => {},
  rules = ENV_MIGRATIONS
) {
  const changes = [];
  for (const rule of rules) {
    if (rule.op === 'rename' && !rule.to) continue;

    const filePath = path.join(projectRoot, rule.file);
    if (!fs.existsSync(filePath)) continue;

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    let next;
    let result;
    if (rule.op === 'remove') {
      const r = removeEnvKey(content, rule.key);
      if (r.removed === null) continue; // 键不存在 → 幂等跳过
      if (rule.when && !rule.when(r.removed)) continue; // 条件不满足 → 保留用户值
      next = r.content;
      result = { removed: r.removed };
    } else if (rule.op === 'rename') {
      const r = renameEnvKey(content, rule.key, rule.to);
      if (!r.moved) continue; // 旧键不存在，或新键已存在
      next = r.content;
      result = { moved: true, to: rule.to, value: r.value };
    } else {
      continue;
    }

    fs.writeFileSync(filePath, next, 'utf8');
    const change = {
      file: rule.file,
      key: rule.key,
      op: rule.op,
      reason: rule.reason,
      ...result,
    };
    changes.push(change);
    logFn(
      `  [env 迁移] ${rule.file}: ${rule.key}` +
        (rule.op === 'remove' ? ' 已删除' : ` 已重命名为 ${rule.to}`) +
        `（${rule.reason}）`
    );
  }
  return changes;
}

module.exports = {
  ENV_MIGRATIONS,
  PLACEHOLDER_RE,
  migrateEnvFiles,
  removeEnvKey,
  renameEnvKey,
};
