/**
 * L1 特征测试 —— lib/env.js 纯函数
 *
 * 目的：在 Step A-2 重构（上下文统一）之前，用测试锁定 lib/env 拆分产物的当前行为。
 * 若后续 A-2/B 修改这些函数，本测试保证行为不漂移。
 *
 * 被测模块：runtime/scripts/lib/env.js（纯函数，无顶层副作用）
 * 说明：parseEnvFileSimple / parseEnvFile 通过文件路径读取，用临时文件注入内容。
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseEnvFileSimple,
  parseEnvFile,
} = require('../../../runtime/scripts/lib/env');

// 写临时文件并返回路径（测试后清理）
let tmpFiles = [];
function writeTemp(content) {
  const file = path.join(os.tmpdir(), `env-lib-test-${Date.now()}-${Math.random().toString(36).slice(2)}.env`);
  fs.writeFileSync(file, content, 'utf8');
  tmpFiles.push(file);
  return file;
}
function cleanupTemp() {
  for (const f of tmpFiles) {
    try { fs.unlinkSync(f); } catch (e) {}
  }
  tmpFiles = [];
}

describe('parseEnvFileSimple', () => {
  afterAll(cleanupTemp);

  test('解析普通键值对', () => {
    const file = writeTemp('DB_HOST=localhost\nDB_PORT=5432\n');
    expect(parseEnvFileSimple(file)).toEqual({
      DB_HOST: 'localhost',
      DB_PORT: '5432',
    });
  });

  test('跳过空行和注释行', () => {
    const file = writeTemp(['# 注释', '', 'A=1', '# 中间注释', 'B=2'].join('\n'));
    expect(parseEnvFileSimple(file)).toEqual({ A: '1', B: '2' });
  });

  test('去除值的首尾引号', () => {
    const file = writeTemp(['NAME="admin"', "PASS='secret'"].join('\n'));
    expect(parseEnvFileSimple(file)).toEqual({ NAME: 'admin', PASS: 'secret' });
  });

  test('值含等号时只按第一个等号拆分', () => {
    const file = writeTemp('URL=https://a=b.com\n');
    expect(parseEnvFileSimple(file)).toEqual({ URL: 'https://a=b.com' });
  });

  test('key 与值均做 trim', () => {
    const file = writeTemp('  A  =  hello  \n');
    expect(parseEnvFileSimple(file)).toEqual({ A: 'hello' });
  });

  test('无等号的行被忽略', () => {
    const file = writeTemp('NO_EQUAL_SIGN\nA=1\n');
    expect(parseEnvFileSimple(file)).toEqual({ A: '1' });
  });

  test('等号在首位（key 为空）被忽略', () => {
    const file = writeTemp('=value\n');
    expect(parseEnvFileSimple(file)).toEqual({});
  });
});

describe('parseEnvFile', () => {
  afterAll(cleanupTemp);

  test('解析普通键值对', () => {
    const file = writeTemp('PORT=3001\nFRONTEND_PORT=3000\n');
    expect(parseEnvFile(file)).toEqual({ PORT: '3001', FRONTEND_PORT: '3000' });
  });

  test('跳过空行和注释行', () => {
    const file = writeTemp(['# a', '', 'A=1', '# b', 'B=2'].join('\n'));
    expect(parseEnvFile(file)).toEqual({ A: '1', B: '2' });
  });

  test('去除值的首尾引号', () => {
    const file = writeTemp('K="v"\nL=\'w\'\n');
    expect(parseEnvFile(file)).toEqual({ K: 'v', L: 'w' });
  });

  test('值含等号时只按第一个等号拆分', () => {
    const file = writeTemp('URL=a=b=c\n');
    expect(parseEnvFile(file)).toEqual({ URL: 'a=b=c' });
  });

  test('key 与值 trim', () => {
    const file = writeTemp('  X  =  yz  \n');
    expect(parseEnvFile(file)).toEqual({ X: 'yz' });
  });
});

// 两个解析器对同一输入行为一致（当前实现重合，作为一致性守卫）
describe('parseEnvFileSimple vs parseEnvFile 行为一致性', () => {
  test('对典型 .env 内容解析结果一致', () => {
    const content = [
      '# 数据库',
      'DB_HOST=localhost',
      'DB_PORT=5432',
      '',
      '# Redis',
      'REDIS_HOST=127.0.0.1',
      'REDIS_PORT="6379"',
      'URL=https://x=1',
    ].join('\n');
    const file = writeTemp(content);
    expect(parseEnvFileSimple(file)).toEqual(parseEnvFile(file));
  });
});
