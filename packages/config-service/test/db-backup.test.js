'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidBackupFilename,
  restoreDatabase,
  parseDatabaseUrl,
  resolveDbConnection,
} = require('../lib/db-backup');

describe('isValidBackupFilename（备份文件名格式校验：防路径遍历 + 命令注入）', () => {
  it('接受合法备份文件名（backupDatabase 生成的格式）', () => {
    // new Date().toISOString().replace(/[:.]/g, '-') 的产物
    assert.equal(isValidBackupFilename('db_backup_2026-09-17T17-42-12-780Z.sql'), true);
  });

  it('拒绝路径遍历向量（../ 与编码还原后的 ..）', () => {
    assert.equal(isValidBackupFilename('../../backend/.env'), false);
    assert.equal(isValidBackupFilename('db_backup_../../etc/passwd.sql'), false);
    assert.equal(isValidBackupFilename('db_backup_a/b.sql'), false);
  });

  it('拒绝 shell 元字符（restore 走 shell:true 时的命令注入向量）', () => {
    assert.equal(isValidBackupFilename('x.sql & whoami'), false);
    assert.equal(isValidBackupFilename('db_backup_a;rm -rf /.sql'), false);
    assert.equal(isValidBackupFilename('db_backup_a|b.sql'), false);
    assert.equal(isValidBackupFilename('db_backup_a b.sql'), false);
  });

  it('拒绝非 db_backup_ 前缀 / 非 .sql 后缀 / 空串', () => {
    assert.equal(isValidBackupFilename('other.sql'), false);
    assert.equal(isValidBackupFilename('db_backup_x.txt'), false);
    assert.equal(isValidBackupFilename(''), false);
  });

  it('拒绝非字符串输入', () => {
    assert.equal(isValidBackupFilename(undefined), false);
    assert.equal(isValidBackupFilename(null), false);
    assert.equal(isValidBackupFilename(123), false);
  });
});

describe('restoreDatabase 非法文件名前置拦截（不触达 psql）', () => {
  it('路径遍历文件名返回「非法的备份文件名」而非越界', async () => {
    const result = await restoreDatabase('../../etc/passwd');
    assert.deepEqual(result, { success: false, error: '非法的备份文件名' });
  });

  it('shell 元字符文件名返回「非法的备份文件名」', async () => {
    const result = await restoreDatabase('x.sql & whoami');
    assert.deepEqual(result, { success: false, error: '非法的备份文件名' });
  });
});

describe('parseDatabaseUrl（DATABASE_URL 连接部件解析）', () => {
  it('解析完整 URL 的各部件', () => {
    assert.deepEqual(parseDatabaseUrl('postgresql://app:secret@db.example.com:5433/mydb'), {
      host: 'db.example.com',
      port: '5433',
      user: 'app',
      password: 'secret',
      dbName: 'mydb',
    });
  });

  it('URL 编码的用户名/密码被解码', () => {
    const parsed = parseDatabaseUrl('postgresql://us%40er:p%40ss@h:5432/db');
    assert.equal(parsed.user, 'us@er');
    assert.equal(parsed.password, 'p@ss');
  });

  it('空 / 非合法 URL 返回空对象（回落 DB_*）', () => {
    assert.deepEqual(parseDatabaseUrl(''), {});
    assert.deepEqual(parseDatabaseUrl(undefined), {});
    assert.deepEqual(parseDatabaseUrl('not a url'), {});
  });
});

describe('resolveDbConnection（DATABASE_URL 权威，DB_* 回落，内置默认兜底）', () => {
  it('只配 DATABASE_URL：各部件取自 URL，不再静默指向 localhost 空密码', () => {
    const conn = resolveDbConnection({
      DATABASE_URL: 'postgresql://app:secret@db.example.com:5433/mydb',
    });
    assert.deepEqual(conn, {
      host: 'db.example.com',
      port: '5433',
      user: 'app',
      dbName: 'mydb',
      password: 'secret',
    });
  });

  it('DATABASE_URL 部件优先于 DB_*（账本一致，ADR-0073）', () => {
    const conn = resolveDbConnection({
      DATABASE_URL: 'postgresql://app:secret@db.example.com:5433/mydb',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_USERNAME: 'postgres',
      DB_DATABASE: 'cloudcad',
      DB_PASSWORD: 'stale',
    });
    assert.equal(conn.host, 'db.example.com');
    assert.equal(conn.port, '5433');
    assert.equal(conn.user, 'app');
    assert.equal(conn.dbName, 'mydb');
    assert.equal(conn.password, 'secret');
  });

  it('无 DATABASE_URL：回落 DB_*，再回落内置默认', () => {
    assert.deepEqual(resolveDbConnection({}), {
      host: 'localhost',
      port: '5432',
      user: 'postgres',
      dbName: 'cloudcad',
      password: '',
    });
    assert.deepEqual(
      resolveDbConnection({ DB_HOST: 'h1', DB_PORT: '6000', DB_PASSWORD: 'pw' }),
      { host: 'h1', port: '6000', user: 'postgres', dbName: 'cloudcad', password: 'pw' }
    );
  });

  it('DATABASE_URL 缺省部件（无端口）回落 DB_*/默认', () => {
    const conn = resolveDbConnection({
      DATABASE_URL: 'postgresql://app@db.example.com/mydb',
      DB_PORT: '6000',
    });
    assert.equal(conn.host, 'db.example.com');
    assert.equal(conn.port, '6000'); // URL 无端口 → 回落 DB_PORT
    assert.equal(conn.user, 'app');
    assert.equal(conn.dbName, 'mydb');
    assert.equal(conn.password, '');
  });
});
