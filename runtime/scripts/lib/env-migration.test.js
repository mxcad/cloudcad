/**
 * 环境变量演进（lib/env-migration.js）回归测试（node:test，0 外部依赖）
 *
 * 覆盖两类操作的语义边界，重点锁三条"绝不破坏用户配置"的不变式：
 *   1. remove 的 when 条件不满足时保留用户值——不得误删真实值
 *   2. rename 在新键已存在时不搬值——不得覆盖用户已填的新键
 *   3. 逐字节保留注释行与其余配置——删除/改名只动目标键那一行
 * 另加幂等性（跑两次第二次无变更）与容错（文件不存在、规则写错不中断升级）。
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ENV_MIGRATIONS,
  migrateEnvFiles,
  removeEnvKey,
  renameEnvKey,
  PLACEHOLDER_RE,
} = require('./env-migration');

// 临时项目根，绝不碰真实 .env
function makeProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-mig-'));
  for (const [rel, content] of Object.entries(files)) {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  }
  return dir;
}

function read(project, rel) {
  return fs.readFileSync(path.join(project, rel), 'utf8');
}

// ==================== removeEnvKey ====================

test('removeEnvKey 删目标键，逐字节保留注释与其余配置', () => {
  const src =
    '# 注释保留\nDB_PORT=5433\nQUEUE_DRIVER=local\n# 尾部注释\nFRONTEND_PORT=8000\n';
  const { content, removed } = removeEnvKey(src, 'QUEUE_DRIVER');
  assert.equal(removed, 'local');
  assert.equal(
    content,
    '# 注释保留\nDB_PORT=5433\n# 尾部注释\nFRONTEND_PORT=8000\n'
  );
});

test('removeEnvKey 键不存在时 removed 为 null 且内容不变', () => {
  const src = 'A=1\nB=2\n';
  const r = removeEnvKey(src, 'C');
  assert.equal(r.removed, null);
  assert.equal(r.content, src);
});

test('removeEnvKey 只删激活行，不删注释掉的同名键', () => {
  const src = '# QUEUE_DRIVER=old\nQUEUE_DRIVER=local\n';
  const { content, removed } = removeEnvKey(src, 'QUEUE_DRIVER');
  assert.equal(removed, 'local');
  assert.equal(content, '# QUEUE_DRIVER=old\n');
});

test('removeEnvKey 剥离引号后取值得到真实值', () => {
  const { removed } = removeEnvKey(
    'REDIS_URL="redis://:p@h:6379/0"\n',
    'REDIS_URL'
  );
  assert.equal(removed, 'redis://:p@h:6379/0');
});

// ==================== renameEnvKey ====================

test('renameEnvKey 旧键存在且新键不存在时改名并搬值', () => {
  const { content, moved, value } = renameEnvKey(
    'OLD_KEY=42\nB=2\n',
    'OLD_KEY',
    'NEW_KEY'
  );
  assert.equal(moved, true);
  assert.equal(value, '42');
  assert.equal(content, 'NEW_KEY=42\nB=2\n');
});

test('renameEnvKey 新键已存在时不搬值——绝不覆盖用户已填的新键', () => {
  const src = 'OLD_KEY=old-val\nNEW_KEY=user-val\n';
  const { content, moved, newKeyExists } = renameEnvKey(
    src,
    'OLD_KEY',
    'NEW_KEY'
  );
  assert.equal(moved, false);
  assert.equal(newKeyExists, true);
  assert.equal(content, src);
});

test('renameEnvKey 旧键不存在时不动内容', () => {
  const src = 'B=2\n';
  const r = renameEnvKey(src, 'OLD_KEY', 'NEW_KEY');
  assert.equal(r.moved, false);
  assert.equal(r.content, src);
});

// ==================== migrateEnvFiles：remove ====================

test('migrateEnvFiles remove 无条件删除废弃键并返回变更', () => {
  const project = makeProject({ 'x/.env': 'KEEP=1\nDROP=go\n' });
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      { file: 'x/.env', key: 'DROP', op: 'remove', reason: 'r' },
    ]);
    assert.equal(read(project, 'x/.env'), 'KEEP=1\n');
    assert.equal(changes.length, 1);
    assert.equal(changes[0].key, 'DROP');
    assert.equal(changes[0].removed, 'go');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('migrateEnvFiles remove 的 when 不满足时保留用户值', () => {
  const project = makeProject({ 'x/.env': 'URL=https://real/production\n' });
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      {
        file: 'x/.env',
        key: 'URL',
        op: 'remove',
        when: () => false,
        reason: 'r',
      },
    ]);
    assert.equal(read(project, 'x/.env'), 'URL=https://real/production\n');
    assert.equal(changes.length, 0);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// ==================== migrateEnvFiles：rename ====================

test('migrateEnvFiles rename 把值搬到新键', () => {
  const project = makeProject({ 'x/.env': 'OLD_NAME=v1\nKEEP=1\n' });
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      {
        file: 'x/.env',
        key: 'OLD_NAME',
        op: 'rename',
        to: 'NEW_NAME',
        reason: 'r',
      },
    ]);
    assert.equal(read(project, 'x/.env'), 'NEW_NAME=v1\nKEEP=1\n');
    assert.equal(changes[0].to, 'NEW_NAME');
    assert.equal(changes[0].value, 'v1');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('migrateEnvFiles rename 在新键已存在时不搬值', () => {
  const project = makeProject({ 'x/.env': 'OLD=a\nNEW=b\n' });
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      { file: 'x/.env', key: 'OLD', op: 'rename', to: 'NEW', reason: 'r' },
    ]);
    assert.equal(read(project, 'x/.env'), 'OLD=a\nNEW=b\n');
    assert.equal(changes.length, 0);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// ==================== 容错与幂等 ====================

test('migrateEnvFiles 文件不存在时静默跳过，不抛错', () => {
  const project = makeProject({});
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      { file: 'missing/.env', key: 'K', op: 'remove', reason: 'r' },
    ]);
    assert.equal(changes.length, 0);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('migrateEnvFiles 幂等：第二次跑无变更', () => {
  const project = makeProject({ 'x/.env': 'KEEP=1\nDROP=go\n' });
  try {
    const rules = [{ file: 'x/.env', key: 'DROP', op: 'remove', reason: 'r' }];
    assert.equal(migrateEnvFiles(project, () => {}, rules).length, 1);
    assert.equal(migrateEnvFiles(project, () => {}, rules).length, 0);
    assert.equal(read(project, 'x/.env'), 'KEEP=1\n');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('migrateEnvFiles 规则写错时跳过该条而非中断升级', () => {
  const project = makeProject({ 'x/.env': 'K=1\n' });
  try {
    const changes = migrateEnvFiles(project, () => {}, [
      { file: 'x/.env', key: 'K', op: 'unknown-op', reason: 'r' },
      { file: 'x/.env', key: 'K', op: 'rename', reason: 'r' }, // 缺 to
    ]);
    assert.equal(changes.length, 0);
    assert.equal(read(project, 'x/.env'), 'K=1\n');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('migrateEnvFiles 有变更时收到日志回调', () => {
  const project = makeProject({ 'x/.env': 'DROP=go\n' });
  const msgs = [];
  try {
    migrateEnvFiles(project, (m) => msgs.push(m), [
      { file: 'x/.env', key: 'DROP', op: 'remove', reason: '废弃了' },
    ]);
    assert.equal(msgs.length, 1);
    assert.match(msgs[0], /DROP.*已删除/);
    assert.match(msgs[0], /废弃了/);
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

// ==================== 规则表完整性 ====================

test('ENV_MIGRATIONS 每条规则结构完整，rename 必有 to', () => {
  assert.ok(ENV_MIGRATIONS.length > 0);
  for (const rule of ENV_MIGRATIONS) {
    assert.ok(rule.file, `缺 file: ${JSON.stringify(rule)}`);
    assert.ok(rule.key, `缺 key`);
    assert.ok(rule.reason, `缺 reason: ${rule.key}`);
    assert.ok(
      rule.op === 'remove' || rule.op === 'rename',
      `op 非法: ${rule.op}`
    );
    if (rule.op === 'rename') assert.ok(rule.to, `rename 缺 to: ${rule.key}`);
  }
});

// ==================== 真实规则端到端 ====================

test('真实规则：conversion-service/.env 的占位符 REDIS_URL 被清，真实值保留', () => {
  const project = makeProject({
    'packages/conversion-service/.env':
      'QUEUE_DRIVER=redis\nREDIS_URL=redis://:your-redis-password@127.0.0.1:6379/0\nCONVERSION_SERVICE_PORT=3100\n',
  });
  try {
    const changes = migrateEnvFiles(project);
    assert.equal(
      read(project, 'packages/conversion-service/.env'),
      'CONVERSION_SERVICE_PORT=3100\n'
    );
    const byKey = Object.fromEntries(changes.map((c) => [c.key, c]));
    assert.equal(
      byKey.REDIS_URL.removed,
      'redis://:your-redis-password@127.0.0.1:6379/0'
    );
    assert.ok(
      byKey.QUEUE_DRIVER,
      'QUEUE_DRIVER=redis 亦应被清（与注入值相同）'
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('真实规则：用户填过的真实 REDIS_URL 与显式 local 一律保留', () => {
  const project = makeProject({
    'packages/conversion-service/.env':
      'QUEUE_DRIVER=local\nREDIS_URL=redis://:real-pass@10.0.0.5:6381/0\n',
  });
  try {
    const changes = migrateEnvFiles(project);
    assert.equal(changes.length, 0);
    assert.equal(
      read(project, 'packages/conversion-service/.env'),
      'QUEUE_DRIVER=local\nREDIS_URL=redis://:real-pass@10.0.0.5:6381/0\n'
    );
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('真实规则：backend/.env 的零消费者 QUEUE_DRIVER 被清，其余键不动', () => {
  const project = makeProject({
    'packages/backend/.env': 'PORT=3001\nQUEUE_DRIVER=local\nDB_PORT=5433\n',
  });
  try {
    const changes = migrateEnvFiles(project);
    assert.equal(
      read(project, 'packages/backend/.env'),
      'PORT=3001\nDB_PORT=5433\n'
    );
    assert.equal(changes.length, 1);
    assert.equal(changes[0].file, 'packages/backend/.env');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('真实规则：目标文件不存在时整体跳过（多数机器本无 conversion-service/.env）', () => {
  const project = makeProject({
    'packages/backend/.env': 'QUEUE_DRIVER=local\n',
  });
  try {
    const changes = migrateEnvFiles(project);
    assert.equal(changes.length, 1);
    assert.equal(read(project, 'packages/backend/.env'), '');
  } finally {
    fs.rmSync(project, { recursive: true, force: true });
  }
});

test('PLACEHOLDER_RE 覆盖模板占位符形态，不匹配真实连接串', () => {
  assert.match('redis://:your-redis-password@127.0.0.1:6379/0', PLACEHOLDER_RE);
  assert.match('redis://:changeme@127.0.0.1:6379/0', PLACEHOLDER_RE);
  assert.match('redis://:placeholder@127.0.0.1:6379/0', PLACEHOLDER_RE);
  assert.doesNotMatch('redis://:wdx123456@127.0.0.1:6380/0', PLACEHOLDER_RE);
  assert.doesNotMatch('redis://:pwxxtoken@10.0.0.5:6380/2', PLACEHOLDER_RE);
});
