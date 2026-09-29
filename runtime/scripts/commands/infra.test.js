/**
 * infra.js isPm2AppFromThisProject 回归测试（node:test，0 外部依赖）
 *
 * 锁定 PM2 app 归属判定：Windows 上 PM2 daemon 全机唯一，多个部署目录共写同一份
 * app 注册表，reconcile 依赖本函数识别"别家定义"并删除重注册。
 *
 * 回归背景：部署包解包进开发仓库（release/...）时，其目录是本仓库的前缀——
 * 纯前缀匹配会把别家定义误判为本项目，reconcile 对别家 redis 定义发 restart
 * （别家 .env 密码/数据目录），本目录后端 AUTH 恒失败（ERR invalid password
 * 循环）。独立部署目录的判据 = 目录内有 .deploy 标记（pack-offline 写入，
 * 开发仓库没有）。
 *
 * 运行：node --test runtime/scripts/commands/infra.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { isPm2AppFromThisProject } = require('./infra');
const { PROJECT_ROOT } = require('../lib/context');

test('无 cwd 信息 → 按本项目处理（维持现行为）', () => {
  assert.equal(isPm2AppFromThisProject({}), true);
  assert.equal(isPm2AppFromThisProject({ pm2_env: {} }), true);
  assert.equal(isPm2AppFromThisProject(null), true);
});

test('cwd = 本仓库根 → 本项目', () => {
  assert.equal(isPm2AppFromThisProject({ pm2_env: { pm_cwd: PROJECT_ROOT } }), true);
});

test('cwd = 本仓库子目录（无 .deploy 标记）→ 本项目', () => {
  assert.equal(
    isPm2AppFromThisProject({
      pm2_env: { pm_cwd: path.join(PROJECT_ROOT, 'packages') },
    }),
    true
  );
});

test('解包进仓库的部署目录（有 .deploy 标记）→ 另一部署目录', () => {
  const tmp = path.join(PROJECT_ROOT, 'data', `pm2-deploy-test-${process.pid}`);
  fs.mkdirSync(tmp, { recursive: true });
  try {
    fs.writeFileSync(path.join(tmp, '.deploy'), '');
    assert.equal(
      isPm2AppFromThisProject({ pm2_env: { pm_cwd: tmp } }),
      false,
      '带 .deploy 标记的子目录必须判为另一部署目录'
    );
    fs.unlinkSync(path.join(tmp, '.deploy'));
    assert.equal(
      isPm2AppFromThisProject({ pm2_env: { pm_cwd: tmp } }),
      true,
      '无标记的普通子目录仍判为本项目'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('cwd 在本仓库外 → 另一部署目录', () => {
  assert.equal(
    isPm2AppFromThisProject({
      pm2_env: { pm_cwd: path.join(PROJECT_ROOT, '..', 'other-project') },
    }),
    false
  );
});
