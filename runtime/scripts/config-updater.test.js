/**
 * .env 值转义回归测试（node:test，0 外部依赖）
 *
 * 背景缺陷（2026-10-02 断网验证抓到）：setup-offline fillEmptySecrets 生成的
 * INITIAL_ADMIN_PASSWORD 裸写进 .env，而强随机口令必含 !@#$%^&* 等特殊字符——
 * dotenv（后端 @nestjs/config 的读取器）把无引号值里的 # 当行内注释：
 *   - # 开头 → 解析为空值 → 后端首次启动创建管理员失败，PM2 反复重启，部署包断网验证失败
 *   - # 中间 → 静默截断 → 用户拿到的口令 ≠ 实际口令（登录永远失败）
 * 生成口令含 # 的概率约 35%，即每 3 次全新部署约 1 次踩中。
 *
 * 修复约定：所有写 .env 的路径必须走 escapeEnvValue（含敏感字符加双引号），
 * 与 lib/env.js、config-service/lib/env.js 的剥引号解析逻辑配对。
 *
 * 运行：node --test runtime/scripts/config-updater.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { escapeEnvValue, updateEnvFile } = require('./config-updater');
const {
  parseEnvFile,
  parseEnvFileSimple,
} = require('./lib/env');
// config-service 是独立包（0 依赖），其解析器是第三个读取方，必须同口径
const { parseEnvFile: parseEnvFileCs } = require('../../packages/config-service/lib/env');

const SENSITIVE_RE = /[#\s$`!&|;<>]/;

function withTempEnv(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-escape-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, content, 'utf8');
  try {
    return fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// 取文件中某 KEY 的原始行值（= 之后到行尾，不剥引号）
function rawValue(file, key) {
  const line = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  assert.ok(line, `缺少 ${key} 行`);
  return line.slice(key.length + 1);
}

test('escapeEnvValue: 无敏感字符的值原样写入', () => {
  assert.equal(escapeEnvValue('a1b2c3d4e5f6'), 'a1b2c3d4e5f6');
  assert.equal(escapeEnvValue('hex-only-0123456789abcdef'), 'hex-only-0123456789abcdef');
});

test('escapeEnvValue: 含敏感字符的值加双引号（含 # 开头/中间、$、!、空白）', () => {
  const cases = [
    '#GsO8#zJ8^6X8_0?', // E2E 实测踩中的真实口令
    'aB3#xY7kL2mN4pQ',
    'pw$with$dollar',
    'pw!with!bang',
    'pw with space',
    'pw`with`backtick',
  ];
  for (const v of cases) {
    assert.ok(SENSITIVE_RE.test(v), `用例前提: ${v} 应含敏感字符`);
    assert.equal(escapeEnvValue(v), `"${v}"`);
  }
});

test('escapeEnvValue: 值含双引号时先转义再加引号', () => {
  assert.equal(escapeEnvValue('a"b#c'), '"a\\"b#c"');
});

test('回归: 含 # 口令经 escapeEnvValue 写入后，三个读取方都解析出完整值', () => {
  const pw = '#GsO8#zJ8^6X8_0?';
  withTempEnv(`INITIAL_ADMIN_PASSWORD=${escapeEnvValue(pw)}\n`, (file) => {
    assert.equal(parseEnvFile(file).INITIAL_ADMIN_PASSWORD, pw);
    assert.equal(parseEnvFileSimple(file).INITIAL_ADMIN_PASSWORD, pw);
    assert.equal(parseEnvFileCs(file).INITIAL_ADMIN_PASSWORD, pw);
  });
});

test('回归: 裸写 # 口令时仓库解析器与 dotenv 口径分裂（缺陷机理，锁定修复必要性）', () => {
  // 缺陷机理（2026-10-02 断网验证实测）：
  //   - 仓库内解析器（lib/env、config-service）对无引号 # 是宽容的，读回完整值
  //     ——所以 CLI/运维中心一直显示「口令正常」，bug 未被发现
  //   - 后端读取器 dotenv 把无引号值的第一个 # 起当行内注释：# 开头→空值
  //     （首次启动创建管理员失败），# 中间→截断（用户口令 ≠ 实际口令）
  // 两组读取方对同一文件的读回值不一致，即裸写必然坏；加引号后口径归一。
  const pw = '#GsO8#zJ8^6X8_0?';
  // dotenv 无引号值语义的最小参照实现：从第一个 # 起截断（17.4.2 实测锚定）
  const dotenvUnquoted = (line) => {
    const i = line.indexOf('=');
    const v = line.slice(i + 1);
    const h = v.indexOf('#');
    return h === -1 ? v : v.slice(0, h);
  };

  withTempEnv(`INITIAL_ADMIN_PASSWORD=${pw}\n`, (file) => {
    // 仓库解析器宽容：读回完整值
    assert.equal(parseEnvFile(file).INITIAL_ADMIN_PASSWORD, pw);
    // dotenv 口径：# 开头 → 空值
    assert.equal(
      dotenvUnquoted('INITIAL_ADMIN_PASSWORD=' + pw),
      ''
    );
    // dotenv 口径：# 中间 → 截断
    assert.equal(dotenvUnquoted('INITIAL_ADMIN_PASSWORD=aB3#xY7'), 'aB3');
  });

  // 加引号后口径归一：值被双引号包裹（dotenv 引号内 # 为字面量，17.4.2 实测），
  // 仓库解析器剥引号后读回完整值
  withTempEnv(`INITIAL_ADMIN_PASSWORD=${escapeEnvValue(pw)}\n`, (file) => {
    const raw = rawValue(file, 'INITIAL_ADMIN_PASSWORD');
    assert.ok(raw.startsWith('"') && raw.endsWith('"'), '值必须被双引号包裹');
    assert.equal(parseEnvFile(file).INITIAL_ADMIN_PASSWORD, pw);
  });
});

test('回归: updateEnvFile 写含 # 口令自动加引号且可回读', () => {
  const pw = '#Forced#E2E_pw!';
  withTempEnv('INITIAL_ADMIN_PASSWORD=\nDB_PORT=5432\n', (file) => {
    assert.equal(updateEnvFile(file, { INITIAL_ADMIN_PASSWORD: pw }), true);
    assert.equal(parseEnvFile(file).INITIAL_ADMIN_PASSWORD, pw);
    assert.equal(parseEnvFileSimple(file).DB_PORT, '5432');
  });
});

test('回归: fillEmptySecrets 生成的 INITIAL_ADMIN_PASSWORD 恒可完整回读（50 轮随机口令）', () => {
  // 单轮口令含 # 概率约 35%，50 轮至少一轮含 # 的概率 >99.99999%——
  // 修复被移除时本用例几乎必然红，修复在位时恒绿（自洽性断言）
  const { fillEmptySecrets } = require('./setup-offline');
  for (let i = 0; i < 50; i++) {
    withTempEnv(
      'SESSION_SECRET=\nINITIAL_ADMIN_PASSWORD=\n',
      (file) => {
        fillEmptySecrets(file);
        const raw = rawValue(file, 'INITIAL_ADMIN_PASSWORD');
        const parsed = parseEnvFile(file).INITIAL_ADMIN_PASSWORD;
        assert.ok(parsed && parsed.length > 0, `第 ${i} 轮: 解析出空口令`);
        // 自洽性：文件里的值与解析器读回的值必须一致（剥引号后）
        assert.equal(
          raw.startsWith('"') ? raw.slice(1, -1) : raw,
          parsed,
          `第 ${i} 轮: 写入值与解析值不一致（raw=${JSON.stringify(raw)}）`
        );
        // 不变式：值含敏感字符时必须被加引号
        if (SENSITIVE_RE.test(parsed)) {
          assert.ok(
            raw.startsWith('"') && raw.endsWith('"'),
            `第 ${i} 轮: 含敏感字符但未加引号: ${JSON.stringify(raw)}`
          );
        }
        const secret = parseEnvFile(file).SESSION_SECRET;
        assert.ok(secret && secret.length === 64, 'SESSION_SECRET 应为 64 位 hex');
      }
    );
  }
});
