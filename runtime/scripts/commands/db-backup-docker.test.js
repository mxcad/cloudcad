/**
 * db-backup.js Docker 形态分支回归测试（#442，node:test，0 外部依赖）
 *
 * 覆盖：
 * - getEnvPath：docker 形态 → 部署根 .env；裸机/开发仓库 → packages/backend/.env
 * - getDockerExec：裸机返回 null；docker 形态返回 cloudcad-pg 容器 + docker 执行器
 * - backupDatabase docker 分支：容器内 pg_dump + docker cp 取回产物
 * - restoreDatabase docker 分支：容器内清空/恢复 + 重启 app 容器（migrate deploy）
 *
 * 注：backupDatabase/restoreDatabase 内部经 getDbEnv() 读真实 .env
 * （开发仓库 packages/backend/.env），测试只断言 docker exec 调用序列，
 * 不依赖 .env 的具体取值。
 *
 * 运行：node --test runtime/scripts/commands/db-backup-docker.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { getEnvPath, getDockerExec, backupDatabase, restoreDatabase } = require('./db-backup');

/** 造一个带/不带形态标记的临时部署根 */
function makeRoot(marker) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-form-'));
  if (marker !== null) {
    fs.writeFileSync(path.join(dir, '.deploy'), marker);
  }
  return dir;
}

// ==================== getEnvPath ====================

test('getEnvPath：docker 形态 → 部署根 .env', () => {
  const root = makeRoot('form=docker');
  assert.equal(getEnvPath(root), path.join(root, '.env'));
});

test('getEnvPath：裸机形态（.deploy 空内容）→ packages/backend/.env', () => {
  const root = makeRoot('');
  assert.equal(getEnvPath(root), path.join(root, 'packages', 'backend', '.env'));
});

test('getEnvPath：开发仓库（无标记）→ packages/backend/.env', () => {
  const root = makeRoot(null);
  assert.equal(getEnvPath(root), path.join(root, 'packages', 'backend', '.env'));
});

test('getEnvPath：存量 .deploy-docker 标记 → 部署根 .env', () => {
  const root = makeRoot(null);
  fs.writeFileSync(path.join(root, '.deploy-docker'), '');
  assert.equal(getEnvPath(root), path.join(root, '.env'));
});

// ==================== getDockerExec ====================

test('getDockerExec：裸机形态返回 null', () => {
  assert.equal(getDockerExec(makeRoot('')), null);
  assert.equal(getDockerExec(makeRoot(null)), null);
});

test('getDockerExec：docker 形态返回 cloudcad-pg 容器 + docker 执行器', () => {
  const ctx = getDockerExec(makeRoot('form=docker'));
  assert.ok(ctx, 'docker 形态必须返回执行上下文');
  assert.equal(ctx.container, 'cloudcad-pg');
  assert.equal(typeof ctx.exec, 'function');
});

// ==================== backupDatabase docker 分支 ====================

test('backupDatabase docker 分支：容器内 pg_dump + docker cp 取回产物', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-test-'));
  const calls = [];
  const dockerExec = {
    container: 'cloudcad-pg',
    exec: (args) => {
      calls.push(args);
      if (args[0] === 'cp') {
        // 模拟 docker cp 把产物落到宿主
        fs.writeFileSync(args[2], 'fake dump');
      }
      return { ok: true, stdout: '', stderr: '' };
    },
  };
  const ok = await backupDatabase(
    { backupDir: dir, filename: 'test.sql' },
    { dockerExec }
  );
  assert.equal(ok, true);
  assert.ok(fs.existsSync(path.join(dir, 'test.sql')));

  // 第 1 次调用 = 容器内 pg_dump（PGPASSWORD 经 -e 注入）
  assert.equal(calls[0][0], 'exec');
  assert.equal(calls[0][1], '-e');
  assert.ok(calls[0][2].startsWith('PGPASSWORD='));
  assert.equal(calls[0][3], 'cloudcad-pg');
  assert.equal(calls[0][4], 'pg_dump');
  assert.ok(calls[0].includes('--no-owner'));
  assert.ok(calls[0].includes('--clean'));

  // 第 2 次调用 = docker cp 取回产物
  assert.equal(calls[1][0], 'cp');
  assert.equal(calls[1][1], 'cloudcad-pg:/tmp/test.sql');
  assert.equal(calls[1][2], path.join(dir, 'test.sql'));

  // 第 3 次调用 = 清理容器内临时文件
  assert.equal(calls[2][0], 'exec');
  assert.deepEqual(calls[2].slice(2), ['rm', '-f', '/tmp/test.sql']);
});

test('backupDatabase docker 分支：pg_dump 失败即中止，不取回产物', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-backup-test-'));
  const calls = [];
  const dockerExec = {
    container: 'cloudcad-pg',
    exec: (args) => {
      calls.push(args);
      if (args[0] === 'exec' && args[4] === 'pg_dump') {
        return { ok: false, stdout: '', stderr: 'pg_dump: connection failed' };
      }
      return { ok: true, stdout: '', stderr: '' };
    },
  };
  const ok = await backupDatabase(
    { backupDir: dir, filename: 'fail.sql' },
    { dockerExec }
  );
  assert.equal(ok, false);
  assert.equal(calls.length, 1, 'pg_dump 失败后不得再 docker cp');
});

// ==================== restoreDatabase docker 分支 ====================

test('restoreDatabase docker 分支：容器内清空/恢复 + 重启 app 容器', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-restore-test-'));
  const backupFile = path.join(dir, 'b.sql');
  fs.writeFileSync(backupFile, 'fake dump');
  const calls = [];
  const dockerExec = {
    container: 'cloudcad-pg',
    exec: (args) => {
      calls.push(args);
      return { ok: true, stdout: '', stderr: '' };
    },
  };
  const ok = await restoreDatabase(backupFile, {
    dockerExec,
    confirm: async () => true,
  });
  assert.equal(ok, true);

  // 步骤 1：容器内 psql 清空 public schema
  assert.equal(calls[0][0], 'exec');
  assert.equal(calls[0][4], 'psql');
  assert.ok(
    calls[0].includes('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
  );

  // 步骤 2：docker cp 进容器 + psql -f 恢复
  assert.equal(calls[1][0], 'cp');
  assert.equal(calls[1][1], backupFile);
  assert.equal(calls[1][2], 'cloudcad-pg:/tmp/cloudcad-restore.sql');
  assert.equal(calls[2][0], 'exec');
  // 恢复调用带 -i 标志（exec -i -e PGPASSWORD=…），psql 落在索引 5
  assert.equal(calls[2][5], 'psql');
  assert.ok(calls[2].includes('-f'));
  assert.ok(calls[2].includes('/tmp/cloudcad-restore.sql'));

  // 步骤 3：重启 app 容器（entrypoint 幂等跑 prisma migrate deploy）
  assert.deepEqual(calls[calls.length - 1], ['restart', 'cloudcad-app']);
});

test('restoreDatabase docker 分支：清空失败即中止', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-restore-test-'));
  const backupFile = path.join(dir, 'b.sql');
  fs.writeFileSync(backupFile, 'fake dump');
  const calls = [];
  const dockerExec = {
    container: 'cloudcad-pg',
    exec: (args) => {
      calls.push(args);
      if (args.includes('-c')) {
        return { ok: false, stdout: '', stderr: 'ERROR: schema "public" is not empty' };
      }
      return { ok: true, stdout: '', stderr: '' };
    },
  };
  const ok = await restoreDatabase(backupFile, {
    dockerExec,
    confirm: async () => true,
  });
  assert.equal(ok, false);
  assert.equal(calls.length, 1, '清空失败后不得继续恢复');
});
