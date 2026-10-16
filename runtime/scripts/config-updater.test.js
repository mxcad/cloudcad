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
 * 修复约定：runtime 包内所有写 .env 的路径必须走 escapeEnvValue（含敏感字符加双引号），
 * 与 lib/env.js、config-service/lib/env.js 的剥引号解析逻辑配对。
 * config-service 是 0 依赖独立包，其写入器（lib/env.js updateEnvFile）保留一份
 * 逐字相同的 escape 副本；escape 字符类的三份副本（runtime 实现 / config-service
 * 实现 / 本文件 SENSITIVE_RE）由本文件末尾的漂移守卫锁定逐字一致。
 *
 * 运行：node --test runtime/scripts/config-updater.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  escapeEnvValue,
  updateEnvFile,
  alignConversionServiceUrl,
  mergeExampleIntoEnv,
  parseEnvToBlocks,
} = require('./config-updater');
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

test('escape 字符类漂移守卫：runtime 实现 / config-service 实现 / 本文件 SENSITIVE_RE 三份逐字一致', () => {
  // config-service 无法 require escapeEnvValue（0 依赖独立包），在 lib/env.js 保留逐字副本；
  // 本文件 SENSITIVE_RE 是第三份。任一份被单独收紧/放宽，另两份静默漂移 → 加引号判定
  // 口径分裂，含敏感字符的口令被 dotenv 截断（缺陷机理见文件头）。
  // 从源码提取以 # 开头的 escape 字符类（斜杠包裹，全仓仅这三处）。
  const extract = (src) =>
    [...src.matchAll(/\/\[(#[^\]]*)\]\//g)].map((m) => m[1]);
  const implSrc = fs.readFileSync(path.join(__dirname, 'config-updater.js'), 'utf8');
  const testSrc = fs.readFileSync(__filename, 'utf8');
  const impl = extract(implSrc);
  const self = extract(testSrc);
  assert.equal(impl.length, 1, 'runtime 实现应恰有 1 处 escape 字符类');
  assert.equal(self.length, 1, '本测试文件应恰有 1 处 escape 字符类');
  assert.equal(
    SENSITIVE_RE.source,
    `[${impl[0]}]`,
    '本文件 SENSITIVE_RE 必须与 runtime 实现逐字一致'
  );
  const csPath = path.join(
    __dirname,
    '..',
    '..',
    'packages',
    'config-service',
    'lib',
    'env.js'
  );
  if (!fs.existsSync(csPath)) return; // 部署机无 monorepo 布局，跨包比对无从谈起
  const cs = extract(fs.readFileSync(csPath, 'utf8'));
  assert.equal(cs.length, 1, 'config-service 实现应恰有 1 处 escape 字符类');
  assert.equal(cs[0], impl[0], '两份实现的 escape 字符类必须逐字一致');
});

// ==================== alignConversionServiceUrl（CONVERSION_SERVICE_URL ↔ PORT 一致性） ====================
//
// 缺陷机理：CONVERSION_SERVICE_PORT 是端口单一事实源（start.js / verify-deploy.js 经
// PORTS.conversion 据此拉起转换服务），CONVERSION_SERVICE_URL 是后端连接地址；后端对该键
// 的缺省值是硬编码字面量 http://localhost:3100（不读 PORT）。故只改 PORT 不改 URL 时后端
// 恒连旧端口，转换全部静默失败且启动全程无感。

test('alignConversionServiceUrl: 文件不存在返回 missing', () => {
  assert.equal(
    alignConversionServiceUrl(path.join(os.tmpdir(), 'no-such-dir-xyz', '.env')),
    'missing'
  );
});

test('alignConversionServiceUrl: 非 conversion-service 模式不动文件（返回 skipped）', () => {
  const before = [
    'FUNCTION_EXECUTOR=process-pool',
    'CONVERSION_SERVICE_PORT=3101',
    'CONVERSION_SERVICE_URL=http://localhost:3100',
  ].join('\n');
  withTempEnv(before, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'skipped');
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  });
});

test('alignConversionServiceUrl: 已一致时返回 ok 且逐字节不改文件', () => {
  const content = [
    '# 区块注释',
    'FUNCTION_EXECUTOR=conversion-service',
    'CONVERSION_SERVICE_PORT=3101',
    'CONVERSION_SERVICE_URL=http://localhost:3101',
    'UNRELATED=keep',
  ].join('\n');
  withTempEnv(content, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'ok');
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  });
});

test('alignConversionServiceUrl: 幂等——第二次调用返回 ok', () => {
  const content = [
    'FUNCTION_EXECUTOR=conversion-service',
    'CONVERSION_SERVICE_PORT=3101',
    'CONVERSION_SERVICE_URL=http://localhost:3100',
  ].join('\n');
  withTempEnv(content, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'repaired');
    assert.equal(alignConversionServiceUrl(file), 'ok');
    assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3101');
  });
});

test('alignConversionServiceUrl: 只改 PORT 未改 URL 时改写端口段，其余行保留', () => {
  const content = [
    'FUNCTION_EXECUTOR=conversion-service',
    'CONVERSION_SERVICE_PORT=3101',
    'CONVERSION_SERVICE_URL=http://localhost:3100',
    'UNRELATED=keep',
  ].join('\n');
  withTempEnv(content, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'repaired');
    assert.equal(
      fs.readFileSync(file, 'utf8'),
      content.replace('http://localhost:3100', 'http://localhost:3101')
    );
  });
});

test('alignConversionServiceUrl: 端口段之后的路径与查询参数逐字保留', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3200',
      'CONVERSION_SERVICE_URL=http://localhost:3100/v1?ssl=on&retry=2',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      // & 属敏感字符，按 escapeEnvValue 约定加引号（与写口令同一规则）
      assert.equal(
        rawValue(file, 'CONVERSION_SERVICE_URL'),
        '"http://localhost:3200/v1?ssl=on&retry=2"'
      );
      // 解析回读须逐字一致
      assert.equal(
        parseEnvFile(file).CONVERSION_SERVICE_URL,
        'http://localhost:3200/v1?ssl=on&retry=2'
      );
    }
  );
});

test('alignConversionServiceUrl: URL 带 userinfo 时只改端口、凭据段保留', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3300',
      'CONVERSION_SERVICE_URL=http://svc:secr3t@localhost:3100',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(
        rawValue(file, 'CONVERSION_SERVICE_URL'),
        'http://svc:secr3t@localhost:3300'
      );
    }
  );
});

test('alignConversionServiceUrl: URL 无端口段时补齐端口', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3101',
      'CONVERSION_SERVICE_URL=http://localhost',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3101');
    }
  );
});

test('alignConversionServiceUrl: URL 缺失而 PORT 非默认时补写显式地址', () => {
  withTempEnv(
    ['FUNCTION_EXECUTOR=conversion-service', 'CONVERSION_SERVICE_PORT=3101'].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3101');
    }
  );
});

test('alignConversionServiceUrl: PORT 缺失（后端缺省 3100）时 URL 指向其他端口即漂移', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_URL=http://localhost:3200',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3100');
    }
  );
});

test('alignConversionServiceUrl: PORT 非正整数按 context.js 口径回退 3100', () => {
  for (const bad of ['abc', '0', '-1', '  ']) {
    withTempEnv(
      [
        'FUNCTION_EXECUTOR=conversion-service',
        `CONVERSION_SERVICE_PORT=${bad}`,
        'CONVERSION_SERVICE_URL=http://localhost:3100',
      ].join('\n'),
      (file) => {
        assert.equal(alignConversionServiceUrl(file), 'ok', `PORT=${bad}`);
        assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3100');
      }
    );
  }
});

test('alignConversionServiceUrl: 已按默认 3100 且 PORT 未改时不补写 URL', () => {
  const content = [
    'FUNCTION_EXECUTOR=conversion-service',
    'CONVERSION_SERVICE_PORT=3100',
    'UNRELATED=keep',
  ].join('\n');
  withTempEnv(content, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'ok');
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  });
});

test('alignConversionServiceUrl: 远程主机不由本部署拉起，不改写', () => {
  const content = [
    'FUNCTION_EXECUTOR=conversion-service',
    'CONVERSION_SERVICE_PORT=3101',
    'CONVERSION_SERVICE_URL=http://cloudcad-conversion:3100',
  ].join('\n');
  withTempEnv(content, (file) => {
    assert.equal(alignConversionServiceUrl(file), 'ok');
    assert.equal(fs.readFileSync(file, 'utf8'), content);
  });
});

test('alignConversionServiceUrl: IPv6 地址（URL 须用方括号）按本机改写', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3103',
      'CONVERSION_SERVICE_URL=http://[::1]:3100',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://[::1]:3103');
    }
  );
});

test('alignConversionServiceUrl: URL 形状无法识别时原样保留（不猜测）', () => {
  for (const url of ['not-a-url', 'ftp://localhost:3100', 'localhost:3100', '::1:3100']) {
    const content = [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3101',
      `CONVERSION_SERVICE_URL=${url}`,
    ].join('\n');
    withTempEnv(content, (file) => {
      assert.equal(alignConversionServiceUrl(file), 'ok', `url=${url}`);
      assert.equal(fs.readFileSync(file, 'utf8'), content, `url=${url}`);
    });
  }
});

test('alignConversionServiceUrl: FUNCTION_EXECUTOR 大小写/首尾空白容忍，URL 引号容忍', () => {
  withTempEnv(
    [
      'FUNCTION_EXECUTOR= Conversion-Service ',
      'CONVERSION_SERVICE_PORT=3102',
      'CONVERSION_SERVICE_URL="http://localhost:3100"',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(rawValue(file, 'CONVERSION_SERVICE_URL'), 'http://localhost:3102');
    }
  );
});

test('回归: 对齐写入后两个启动脚本的解析器都读到新值（write-once, read-twice）', () => {
  // start.js 用 parseEnvFile，verify-deploy.js 用 parseEnvFileSimple（D5 验收器独立）——
  // 写一处、读两处，两口径必须一致，否则验收器与启动器对漂移的判定分裂。
  withTempEnv(
    [
      'FUNCTION_EXECUTOR=conversion-service',
      'CONVERSION_SERVICE_PORT=3107',
      'CONVERSION_SERVICE_URL=http://localhost:3100',
    ].join('\n'),
    (file) => {
      assert.equal(alignConversionServiceUrl(file), 'repaired');
      assert.equal(parseEnvFile(file).CONVERSION_SERVICE_URL, 'http://localhost:3107');
      assert.equal(
        parseEnvFileSimple(file).CONVERSION_SERVICE_URL,
        'http://localhost:3107'
      );
    }
  );
});

test('本机形态口径: 改写与否的判定与 lib/infra-gate 的 isLocalHost 逐例一致', () => {
  const { isLocalHost } = require('./lib/infra-gate');
  // 只取「既是本机形态、又是合法 URL 主机」的取值：裸 '::1' 在 URL 中非法（须 [::1]），
  // 归入上方「形状无法识别」用例，不与 isLocalHost 口径比对。
  const hosts = [
    'localhost',
    'LOCALHOST',
    '127.0.0.1',
    '[::1]',
    'cloudcad-conversion',
    'db.internal',
    '10.0.0.5',
    '192.168.1.10',
  ];
  for (const host of hosts) {
    withTempEnv(
      [
        'FUNCTION_EXECUTOR=conversion-service',
        'CONVERSION_SERVICE_PORT=3999',
        `CONVERSION_SERVICE_URL=http://${host}:3100`,
      ].join('\n'),
      (file) => {
        assert.equal(
          alignConversionServiceUrl(file),
          isLocalHost(host.replace(/^\[|\]$/g, '')) ? 'repaired' : 'ok',
          `host=${host} 应与 isLocalHost 同口径`
        );
      }
    );
  }
});

// ---------------------------------------------------------------------------
// mergeExampleIntoEnv 回归（2026-10-15 部署包实跑定位）
//
// 缺陷：全新 .env 由 .env.example 逐字生成，含注释行
//   # CORS_ORIGINS=https://app.cloudcad.com,https://admin.cloudcad.com
// 首次 deploy 走密码向导，第二次 deploy 走 cli.js 的「合并 .env.example」分支，
// mergeExampleIntoEnv 见「.env 里存在这个 key（虽是注释态）」就激活它 → 生产环境
// CORS 白名单整体替换掉 FRONTEND_URL（离线部署 http://localhost:8000）→ 浏览器
// 预检 204 通过却拿不到 Access-Control-Allow-Origin，所有接口只报
// TypeError: Failed to fetch，后端一条错误日志都不留。
//
// 约定：注释就是注释——example 里是 # KEY=VALUE 的项，输出必须仍是注释。
// 只有用户在 .env 里主动去掉了 # 才输出为激活项；其余情况（用户副本仍是注释态、
// 或从未配置过）一律逐字沿用模板注释行，不回写用户在注释里改过的值——注释行是
// 文档不是配置。反向（example 激活 / 用户副本注释）仍按模板激活，那是模板作者
// 提升默认值的显式动作。
// ---------------------------------------------------------------------------

const CORS_EXAMPLE = [
  '# 安全配置',
  '# CORS 允许的源 (生产环境必须设置，逗号分隔多个域名)',
  '# CORS_ORIGINS=https://app.cloudcad.com,https://admin.cloudcad.com',
  '# REDIS_PASSWORD=',
  'FRONTEND_URL=http://localhost:8000',
].join('\n');

test('mergeExampleIntoEnv: 模板注释值逐字拷贝保持注释（回归：不得静默激活 CORS_ORIGINS）', () => {
  const out = mergeExampleIntoEnv(CORS_EXAMPLE, CORS_EXAMPLE);
  assert.equal(
    /(^|\n)CORS_ORIGINS=/.test(out),
    false,
    'CORS_ORIGINS 是模板注释默认值，用户从未配置过，不得被激活'
  );
  assert.ok(
    /(^|\n)# CORS_ORIGINS=https:\/\/app\.cloudcad\.com,https:\/\/admin\.cloudcad\.com/.test(
      out
    ),
    '注释行应原样保留'
  );
});

test('mergeExampleIntoEnv: 用户只改了注释里的值仍然保持注释（注释就是注释）', () => {
  // 用 9876 这类与前端端口迁移无关的端口，避免断言随端口改名静默失配。
  // 旧实现见「.env 里存在这个 key」或「值与模板不同」就激活，等于替用户解开了
  // 注释——用户在注释行里写的是「想配什么」的备忘，不是「现在生效」的意图。
  const userEnv = CORS_EXAMPLE.replace(
    '# CORS_ORIGINS=https://app.cloudcad.com,https://admin.cloudcad.com',
    '# CORS_ORIGINS=http://localhost:9876,http://127.0.0.1:9876'
  );
  const out = mergeExampleIntoEnv(userEnv, CORS_EXAMPLE);
  assert.equal(
    /(^|\n)CORS_ORIGINS=/.test(out),
    false,
    '注释项不得被 merge 解开'
  );
  assert.ok(
    /(^|\n)# CORS_ORIGINS=https:\/\/app\.cloudcad\.com,https:\/\/admin\.cloudcad\.com/.test(
      out
    ),
    '注释行回到模板权威文案（注释是文档不是配置，不回写用户注释值）'
  );
});

test('mergeExampleIntoEnv: 同 key 的散文行不被改写也不重复', () => {
  // `# IMPL=true 或 IMPL=1 → ...` 这类散文行与 `# IMPL=` 都会被解析成
  // commented_keyvalue(IMPL)，而 envKeyMap 只保留最后一次出现——按 key 回写用户
  // 注释值会把散文行改写成用户值，并因 example 中该 key 出现两次而重复输出。
  const implExample = [
    '# IMPL=true 或 IMPL=1 → 加载私有包默认路径 packages/impl-mx/dist',
    '# IMPL=',
    'JWT_SECRET=abc',
  ].join('\n');
  assert.equal(
    mergeExampleIntoEnv(implExample, implExample),
    implExample,
    '散文行与注释行必须逐字保留、不增不减'
  );
});

test('mergeExampleIntoEnv: 用户显式去掉 # 的项保持激活（注释态判据不误伤）', () => {
  const userEnv = CORS_EXAMPLE.replace(
    '# CORS_ORIGINS=https://app.cloudcad.com,https://admin.cloudcad.com',
    'CORS_ORIGINS=https://prod.example.com'
  );
  const out = mergeExampleIntoEnv(userEnv, CORS_EXAMPLE);
  assert.ok(
    /(^|\n)CORS_ORIGINS=https:\/\/prod\.example\.com/.test(out),
    '用户在 .env 里主动激活的配置不得被退回注释'
  );
});

test('mergeExampleIntoEnv: 模板把选项提升为默认值时按模板激活（反向不对称）', () => {
  // example 已激活 + 用户副本仍是注释 → 按模板激活。这是模板作者显式把可选项
  // 提升为默认值的动作，与「example 注释被解开」不是同一件事，必须保留。
  const promoted = CORS_EXAMPLE.replace(
    '# CORS_ORIGINS=https://app.cloudcad.com,https://admin.cloudcad.com',
    'CORS_ORIGINS=https://app.cloudcad.com'
  );
  const out = mergeExampleIntoEnv(CORS_EXAMPLE, promoted);
  assert.ok(
    /(^|\n)CORS_ORIGINS=https:\/\/app\.cloudcad\.com/.test(out),
    '模板激活的项在存量 .env 中应生效'
  );
});

test('mergeExampleIntoEnv: 已激活的同值项不得被反向注释', () => {
  const userEnv = CORS_EXAMPLE.replace(
    '# CORS_ORIGINS=',
    'CORS_ORIGINS='
  );
  const out = mergeExampleIntoEnv(userEnv, CORS_EXAMPLE);
  assert.ok(
    /(^|\n)CORS_ORIGINS=https:\/\/app\.cloudcad\.com/.test(out),
    '用户已显式激活的项不得被注释回去'
  );
});

test('mergeExampleIntoEnv: fillEmptySecrets 补过的空白密钥仍然激活（不回归）', () => {
  const userEnv = CORS_EXAMPLE.replace(
    '# REDIS_PASSWORD=',
    'REDIS_PASSWORD=quote-d"ollar-abc123'
  );
  const out = mergeExampleIntoEnv(userEnv, CORS_EXAMPLE);
  assert.ok(
    /(^|\n)REDIS_PASSWORD=quote-d"ollar-abc123/.test(out),
    '已填入真实值的密钥必须保持激活，否则后端生产校验拒绝启动'
  );
});

// ---------------------------------------------------------------------------
// 模板重复键守卫
//
// envKeyMap 对同一 key 只保留「最后一次出现」，所以模板里「激活行 + 注释行同键」
// 的写法会让注释值污染激活值。实测：
//   WECHATPAY_CERT_PATH=.../apiclient_cert.pem    ← 默认 PEM
//   # WECHATPAY_CERT_PATH=.../apiclient_cert.p12  ← PFX 备选值
// 第二次跑 deploy/start 就把激活行改写成 .p12——PEM 与 PFX 是同一个键的两种取值，
// 备选值只能写成散文，不能写成 # KEY= 形式。
// 全是注释行的重复（如 IMPL 的散文说明块）无害：注释块逐字沿用模板，不改写任何
// 激活值，故不在此列。
// ---------------------------------------------------------------------------

test('模板守卫: backend .env.example 同一 key 不得同时有激活行与注释行', () => {
  const examplePath = path.join(
    __dirname,
    '..',
    '..',
    'packages',
    'backend',
    '.env.example'
  );
  const stateByKey = new Map();
  for (const b of parseEnvToBlocks(fs.readFileSync(examplePath, 'utf8'))) {
    if (!b.key) continue;
    if (!stateByKey.has(b.key)) stateByKey.set(b.key, new Set());
    stateByKey.get(b.key).add(b.type === 'keyvalue' ? 'active' : 'commented');
  }
  const offenders = [...stateByKey.entries()]
    .filter(([, states]) => states.size > 1)
    .map(([key]) => key);
  assert.deepEqual(
    offenders,
    [],
    `以下 key 同时存在激活行与注释行，注释值会污染激活值: ${offenders.join(', ')}`
  );
});

