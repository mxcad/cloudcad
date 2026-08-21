/**
 * 契约门禁：校验 API SDK / MSW handler 生成产物无未提交变更（#296）
 *
 * 用法：
 *   node scripts/check-generated-clean.js              # 检查全部默认产物
 *   node scripts/check-generated-clean.js <path>...    # 指定路径（仓库根相对）
 *
 * 逻辑：git status --porcelain --untracked-files=all -- <paths>，
 * 任一生成产物存在未提交变更（M/A/D/?? 等）→ 打印列表 + 提示先提交 → exit 1。
 * 无变更 → exit 0。
 *
 * CI 用法：后端 build（generate:swagger → generate:api-types）与
 * `pnpm generate:msw` 之后执行本脚本，确保三层一致性铁律（前端 ↔ API SDK ↔ 后端）
 * 的生成物全部入库，避免 DTO 变更导致前端类型/契约漂移无法被感知。
 */
'use strict';

const { execFileSync } = require('child_process');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

const DEFAULT_PATHS = [
  // @cloudcad/api-sdk 生成产物（sdk.gen.ts / types.gen.ts / client.gen.ts / core/*.gen.ts）
  'packages/api-sdk/src',
  // MSW handler 生成产物（由 swagger_json.json 经 msw-auto-mock 生成）
  'packages/frontend/src/test/msw/generated',
];

const targets = process.argv.slice(2).length
  ? process.argv.slice(2)
  : DEFAULT_PATHS;

let status;
try {
  status = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=all', '--', ...targets],
    { cwd: ROOT, encoding: 'utf8' }
  );
} catch (err) {
  console.error('[check-generated-clean] 无法读取 git 状态:', err.message);
  process.exit(2);
}

const dirty = status.split('\n').filter((line) => line.trim().length > 0);

if (dirty.length > 0) {
  console.error(
    '[check-generated-clean] 发现未提交的生成产物变更，契约门禁失败：'
  );
  for (const line of dirty) console.error('  ' + line);
  console.error(
    '\n修复：运行生成命令（pnpm generate:api-types / pnpm generate:msw）后把生成物一起提交。' +
      '\n禁止在未提交 SDK/MSW 生成物的情况下推进改动。'
  );
  process.exit(1);
}

console.log('[check-generated-clean] 生成产物与仓库一致，门禁通过');
