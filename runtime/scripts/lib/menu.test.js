/**
 * menu.js 回归测试（node:test，0 外部依赖）
 *
 * 锁定交互式菜单的可见性矩阵与编号规则（菜单数据用 commands/menu-sections.js 真数据）：
 * - platform: 'linux' 项（Linux 初始化）在 Windows 上隐藏——代码内部本有 !IS_LINUX
 *   守卫，旧菜单在 Windows 上仍显示该项，选了只提示"不适用"
 * - scope: 'dev' 项（开发模式/数据库种子）在部署包（.deploy 标记）上隐藏——
 *   部署包离线安装只装生产依赖（pnpm --filter backend ... --prod），
 *   vite/ts-node 不存在，选了必失败
 * - 空 section 整体移除；编号跨 section 连续 1..N 无重复
 *
 * 运行：node --test runtime/scripts/lib/menu.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { buildVisibleMenu, formatMenu } = require('./menu');
const { menuSections } = require('../commands/menu-sections');

const ENVS = {
  winDeploy: { isLinux: false, isWindows: true, isDeployPackage: true },
  winDev: { isLinux: false, isWindows: true, isDeployPackage: false },
  linuxDeploy: { isLinux: true, isWindows: false, isDeployPackage: true },
  linuxDev: { isLinux: true, isWindows: false, isDeployPackage: false },
};

function visibleLabels(env) {
  return buildVisibleMenu(menuSections, env)
    .flatMap((s) => s.items)
    .map((i) => i.label);
}

test('Windows + 部署包：无 Linux 初始化、无开发模式/种子', () => {
  const labels = visibleLabels(ENVS.winDeploy);
  assert.ok(!labels.includes('Linux 初始化（首次部署）'));
  assert.ok(!labels.includes('开发模式'));
  assert.ok(!labels.includes('数据库种子'));
});

test('Linux + 部署包：有 Linux 初始化，仍无开发模式/种子', () => {
  const labels = visibleLabels(ENVS.linuxDeploy);
  assert.ok(labels.includes('Linux 初始化（首次部署）'));
  assert.ok(!labels.includes('开发模式'));
  assert.ok(!labels.includes('数据库种子'));
});

test('开发机（无 .deploy 标记）：两个平台都显示开发模式/种子', () => {
  for (const env of [ENVS.winDev, ENVS.linuxDev]) {
    assert.ok(visibleLabels(env).includes('开发模式'), `开发模式应在 ${env} 可见`);
    assert.ok(visibleLabels(env).includes('数据库种子'), `数据库种子应在 ${env} 可见`);
  }
});

test('Windows 开发机：无 Linux 初始化', () => {
  assert.ok(!visibleLabels(ENVS.winDev).includes('Linux 初始化（首次部署）'));
});

test('菜单项总数守恒（防静默丢项：旧平铺 14 项拆分后一项不能少）', () => {
  // linuxDev = 全量 14 项；winDev 少 Linux 初始化；部署包再少 开发模式/数据库种子
  assert.equal(visibleLabels(ENVS.linuxDev).length, 14);
  assert.equal(visibleLabels(ENVS.winDev).length, 13);
  assert.equal(visibleLabels(ENVS.linuxDeploy).length, 12);
  assert.equal(visibleLabels(ENVS.winDeploy).length, 11);
});

test('编号跨 section 连续 1..N，无重复无跳号', () => {
  for (const env of Object.values(ENVS)) {
    const items = buildVisibleMenu(menuSections, env).flatMap((s) => s.items);
    assert.deepEqual(
      items.map((i) => i.key),
      items.map((_, idx) => String(idx + 1))
    );
  }
});

test('部署包菜单不含空 section（开发环境整组消失）', () => {
  for (const env of [ENVS.winDeploy, ENVS.linuxDeploy]) {
    const sections = buildVisibleMenu(menuSections, env);
    assert.ok(sections.every((s) => s.items.length > 0));
    assert.ok(!sections.some((s) => s.title.startsWith('开发环境')));
  }
});

test('核心项在所有环境都可见，退出项恒为 [q]', () => {
  const must = [
    '启动服务（含前后端）',
    '查看服务状态',
    '查看服务日志',
    '停止服务',
    '部署 / 升级',
    '数据库备份与恢复',
  ];
  for (const env of Object.values(ENVS)) {
    const labels = visibleLabels(env);
    for (const label of must) {
      assert.ok(labels.includes(label), `${label} 应在 ${env} 可见`);
    }
  }
  const lines = formatMenu(buildVisibleMenu(menuSections, ENVS.winDeploy));
  // [q] 与 退出 之间夹 ANSI 转义码，不能按字面量整串匹配
  assert.ok(lines.some((l) => l.includes('[q]') && l.includes('退出')));
});

test('每个菜单项都有 action（防止数据与命令脱钩）', () => {
  for (const section of menuSections) {
    for (const item of section.items) {
      assert.equal(typeof item.action, 'function', `${item.label} 缺少 action`);
    }
  }
});
