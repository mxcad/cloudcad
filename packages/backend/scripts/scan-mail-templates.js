/**
 * 邮件模板消费者门禁（scan:mail-templates，挂 backend check）。
 *
 * `src/assets/templates/` 里的 .hbs 模板没有任何消费者门禁：模板是纯静态文件，
 * 不被 tsc 检查、不被 jest 引用、也不进 API 契约。写好了没接线的模板会一直躺到
 * `nest build` 的 copy:assets 把它塞进 dist，随每个部署包发到生产。
 *
 * 实例：`password-reset.hbs`（magic-link 方案：`{{resetLink}}` + `{{expiresIn}}`）
 * 从未被任何 `template: 'password-reset'` 引用——它连变量生产者都不存在（全仓
 * `resetLink` 只在它自身出现），配套也没有 reset token 表、没有 token 校验端点，
 * 前端 /reset-password 只吃 email/phone + code。它随初始仓库导入进来（51df614），
 * 在本仓历史上出生即死，且与 ADR-0073（infra 层 DB/Redis 密码重置）共享
 * "password-reset" 词面，安全敏感区里三义混用。已删，本门禁防止下一个死模板。
 *
 * 两道检查：
 *   A. 死模板：.hbs 存在但全后端源码零 `template: '<name>'` 字面量引用。
 *   B. 悬空引用：`template: '<name>'` 引用了不存在的模板——SMTP 发送期才炸，
 *      且 sendMail 失败在部分调用点被 try/catch 吞掉，只留 warn 日志。
 *
 * 只扫字符串字面量：`template: string`（函数参数类型注解）与 `template: {`
 * （MailerModule 的目录配置）都不构成消费，正则不加引号边界会误判。
 *
 * 用法: node scripts/scan-mail-templates.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..'); // packages/backend
const TEMPLATE_DIR = path.join(ROOT, 'src', 'assets', 'templates');
const IGNORE_SEG = new Set(['node_modules', 'dist']);
const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.cjs', '.mjs']);

/** 模板名 → 引用位置（rel:line） */
const CONSUMER_RE = /template:\s*['"]([^'"\s]+)['"]/g;
const consumers = new Map();

function walk(dir, out) {
  let ents = [];
  try {
    ents = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  for (const ent of ents) {
    const abs = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!IGNORE_SEG.has(ent.name)) walk(abs, out);
      continue;
    }
    if (!CODE_EXT.has(path.extname(ent.name))) continue;
    out.push(abs);
  }
}

const issues = [];

// ── 收集模板清单 ──
let templates = [];
try {
  templates = fs
    .readdirSync(TEMPLATE_DIR)
    .filter((f) => f.endsWith('.hbs'))
    .map((f) => f.replace(/\.hbs$/, ''))
    .sort();
} catch (e) {
  issues.push(
    `模板目录不可读：${path.relative(ROOT, TEMPLATE_DIR)}（${e.code || e.message}）`
  );
}

// ── 扫全部源码的 template: 字面量 ──
const sources = [];
walk(path.join(ROOT, 'src'), sources);
walk(path.join(ROOT, 'test'), sources);

for (const file of sources) {
  const rel = path.relative(ROOT, file).split(path.sep).join('/');
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      CONSUMER_RE.lastIndex = 0;
      for (const m of line.matchAll(CONSUMER_RE)) {
        if (!consumers.has(m[1])) consumers.set(m[1], []);
        consumers.get(m[1]).push(`${rel}:${i + 1}`);
      }
    });
}

// ── 检查 A：死模板 ──
for (const name of templates) {
  if (!consumers.has(name)) {
    issues.push(
      `assets/templates/${name}.hbs 零消费者——没有任何 template: '${name}' 引用。` +
        '模板是纯静态文件，tsc/jest/API 契约都不检查它，会随 copy:assets 静默打进 dist 发到生产'
    );
  }
}

// ── 检查 B：悬空引用 ──
for (const [name, locs] of [...consumers].sort()) {
  if (!templates.includes(name)) {
    issues.push(
      `${locs.join(', ')} 引用了 template: '${name}'，但 assets/templates/${name}.hbs 不存在——` +
        'SMTP 发送期才炸，且部分调用点的 sendMail 失败被 try/catch 吞掉，只留 warn 日志'
    );
  }
}

// ── 汇总 ──
if (issues.length > 0) {
  console.error(
    `\nscan:mail-templates 发现 ${issues.length} 处问题：\n`
  );
  for (const issue of issues) console.error(`  ✗ ${issue}`);
  console.error(
    '\n模板目录必须零死代码：每个 .hbs 都要有 template: 字面量消费者；' +
      '每个 template: 引用都要有对应 .hbs。'
  );
  process.exit(1);
}

console.log(
  `scan:mail-templates OK：${templates.length} 个模板全部有消费者，无悬空引用`
);
