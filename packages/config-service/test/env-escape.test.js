'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { parseEnvFile, updateEnvFile } = require('../lib/env');

/**
 * updateEnvFile 的 .env 值转义回归测试（node:test，0 外部依赖）
 *
 * 本包写入器的 escape 字符类是 runtime/scripts/config-updater.js escapeEnvValue
 * 的逐字副本（0 依赖独立服务无法 require 它）——跨包漂移守卫在
 * runtime/scripts/config-updater.test.js（断言三份副本逐字一致）。
 * dotenv 截断缺陷机理由 runtime 侧测试锁定；本文件只钉本包写入器行为：
 * 含敏感字符的值必须加双引号（否则后端 dotenv 把 # 当行内注释截断口令），
 * 且加引号后本包解析器能完整回读。
 */

const SENSITIVE = [
  'a#b',
  'a b',
  'a$b',
  'a`b',
  'a!b',
  'a&b',
  'a|b',
  'a;b',
  'a<b',
  'a>b',
];

function withTempEnv(content, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cs-env-escape-'));
  const file = path.join(dir, '.env');
  fs.writeFileSync(file, content, 'utf8');
  try {
    fn(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('updateEnvFile 转义（与 runtime escapeEnvValue 同契约的副本）', () => {
  it('含敏感字符的值加双引号且经本包解析器完整回读', () => {
    withTempEnv('# header\nDB_PASSWORD=old\n', (file) => {
      const updates = {};
      SENSITIVE.forEach((v, i) => {
        updates[`K${i}`] = v;
      });
      // 顺带覆盖已有 KEY 的原地更新路径
      updates.DB_PASSWORD = SENSITIVE[0];
      updateEnvFile(file, updates);
      const parsed = parseEnvFile(file);
      for (const [key, value] of Object.entries(updates)) {
        assert.equal(parsed[key], value, `${key} 回读应无损`);
      }
    });
  });

  it('已有 KEY 原地更新，不在文件尾追加孤儿行', () => {
    withTempEnv('DB_PASSWORD=old\nREDIS_PASSWORD=x\n', (file) => {
      updateEnvFile(file, { DB_PASSWORD: 'new#pw' });
      const lines = fs
        .readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => l.startsWith('DB_PASSWORD='));
      assert.equal(lines.length, 1, '同一 KEY 在文件中应只出现一次');
      assert.equal(lines[0], 'DB_PASSWORD="new#pw"');
    });
  });

  it('无敏感字符的值原样写入（不加引号）', () => {
    withTempEnv('PLAIN=old\n', (file) => {
      updateEnvFile(file, { PLAIN: 'hex0123456789abcdef' });
      assert.ok(
        fs.readFileSync(file, 'utf8').includes('PLAIN=hex0123456789abcdef'),
        '无敏感字符的值不应加引号'
      );
    });
  });
});
