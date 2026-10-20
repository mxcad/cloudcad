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

test('Windows + 部署包：无 Linux 初始化、无开发模式/种子、无排障三项', () => {
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

test('排障三项（仅启动基础服务/版本检查/版本验证）仅开发机可见', () => {
  // 部署包用户用不上排障项（版本检查/验证由部署流程自动执行）；工程师在
  // 部署包可用 start:infra / version:check / version:verify 子命令
  const troubleshoot = ['仅启动基础服务', '图纸版本检查', '图纸版本验证'];
  for (const env of [ENVS.winDeploy, ENVS.linuxDeploy]) {
    const labels = visibleLabels(env);
    for (const label of troubleshoot) {
      assert.ok(!labels.includes(label), `${label} 不应在部署包（${env}）可见`);
    }
  }
  for (const env of [ENVS.winDev, ENVS.linuxDev]) {
    const labels = visibleLabels(env);
    for (const label of troubleshoot) {
      assert.ok(labels.includes(label), `${label} 应在开发机（${env}）可见`);
    }
  }
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

test('菜单项总数守恒（防静默丢项：旧平铺项拆分后一项不能少）', () => {
  // linuxDev = 全量 15 项；winDev 少 Linux 初始化；部署包再少 开发模式/种子 +
  // 排障三项（仅启动基础服务/版本检查/版本验证，scope:'dev'）
  // 四条恢复通道（解绑 TOTP + 三条密码重置）无 scope 无 platform，
  // 四种环境全可见——恢复入口绝不能只在开发机出现
  assert.equal(visibleLabels(ENVS.linuxDev).length, 17);
  assert.equal(visibleLabels(ENVS.winDev).length, 16);
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

test('「密码重置」独立成节，四种环境都出现且只含三条重置项', () => {
  // ADR-0072/0073：三条都是锁死时才会跑的恢复通道，与排障工具混一节既不好找
  // 也稀释语义。锁定两点：不因 scope/platform 被过滤掉（恢复入口绝不能只在
  // 开发机出现），以及这一节不会被排障项污染。
  for (const env of Object.values(ENVS)) {
    const section = buildVisibleMenu(menuSections, env).find((s) => s.title === '密码重置');
    assert.ok(section, `密码重置节应在 ${env} 可见`);
    assert.deepEqual(
      section.items.map((i) => i.label),
      ['重置管理员密码', '重置数据库密码', '重置 Redis 密码']
    );
  }
});

test('核心项在所有（裸机）环境都可见，退出项恒为 [q]', () => {
  // 注意：ENVS 均为裸机形态（无 isDockerForm）。db-backup / 三条密码重置自
  // #442 起双形态全可见（docker 形态走 docker exec），docker 形态可见性见下方用例。
  const must = [
    '启动服务（含前后端）',
    '查看服务状态',
    '查看服务日志',
    '停止服务',
    '部署 / 升级',
    '数据库备份与恢复',
    // 恢复通道：凭据丢失时这是唯一出路，裸机形态必须可见
    '解绑管理员 TOTP',
    '重置管理员密码',
    '重置数据库密码',
    '重置 Redis 密码',
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

// ==================== docker 形态可见性（ADR-0075 C5 + #442） ====================
// v1 时 docker 形态隐藏全部长尾命令；#442 起 db-backup / 三条密码重置已支持
// docker 形态（docker exec），解除隐藏，双形态全可见。仍隐藏的只剩
// form:'bare' 的排障/开发项（仅启动基础服务 / 开发模式 / 数据库种子）。
// CLI 侧 docker 形态实际走 docker-form-adapter 精简菜单；此处锁定
// menu-sections.js 单一事实源的可见性数据。
const DOCKER_ENV = { isLinux: true, isWindows: false, isDeployPackage: true, isDockerForm: true };

test('docker 形态：db-backup/密码重置可见，infra/dev 项仍隐藏', () => {
  const labels = visibleLabels(DOCKER_ENV);
  for (const label of [
    '数据库备份与恢复',
    '重置管理员密码',
    '重置数据库密码',
    '重置 Redis 密码',
  ]) {
    assert.ok(labels.includes(label), `${label} 应在 docker 形态可见（#442）`);
  }
  for (const label of ['仅启动基础服务', '开发模式', '数据库种子']) {
    assert.ok(!labels.includes(label), `${label} 应在 docker 形态隐藏`);
  }
});

test('docker 形态：主路径命令保留（启动/状态/日志/停止/部署/迁移/TOTP）', () => {
  const labels = visibleLabels(DOCKER_ENV);
  for (const label of [
    '启动服务（含前后端）',
    '查看服务状态',
    '查看服务日志',
    '停止服务',
    '部署 / 升级',
    '数据库迁移',
    '解绑管理员 TOTP',
  ]) {
    assert.ok(labels.includes(label), `${label} 应在 docker 形态可见`);
  }
});

test('docker 形态：「密码重置」保留、「开发环境」整节消失（空 section 移除）', () => {
  const sections = buildVisibleMenu(menuSections, DOCKER_ENV);
  assert.ok(sections.some((s) => s.title === '密码重置'), '密码重置节应在 docker 形态保留（#442）');
  assert.ok(!sections.some((s) => s.title.startsWith('开发环境')), '开发环境节应在 docker 形态移除');
  assert.ok(sections.every((s) => s.items.length > 0), 'docker 形态不应出现空 section');
});
