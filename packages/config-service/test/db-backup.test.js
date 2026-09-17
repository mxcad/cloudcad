'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { isValidBackupFilename, restoreDatabase } = require('../lib/db-backup');

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
