/**
 * @fileoverview 交互式菜单数据（分组 + 可见性标记）
 *
 * 纯数据模块：label/desc/action + 可见性标记；过滤与渲染逻辑在 lib/menu.js。
 * 可见性标记（buildVisibleMenu 按环境过滤）：
 * - platform: 'linux' 仅 Linux 显示；'win' 仅 Windows 显示
 * - scope: 'dev' 仅源码开发机显示；'deploy' 仅部署包显示
 * - form: 'bare' 仅裸机形态显示（docker 形态隐藏，ADR-0075 C5：v1 长尾命令
 *   db-backup / 密码重置 / infra / dev 在 docker 形态不可用，v2 补齐）
 *
 * 为什么开发模式/种子只在开发机显示：部署包（.deploy 标记）离线安装只装
 * 生产依赖（pnpm --filter backend ... --prod），vite/ts-node 不存在，
 * 开发模式与种子（ts-node prisma/seed.ts）在部署机上选了一定失败。
 * 部署机判据 = 仓库根存在 .deploy 标记（pack-offline 打部署/升级包时写入）。
 */

const { devMode } = require('./dev');
const { deployMode } = require('./deploy');
const { startOnly, startMode } = require('./start');
const { stopInfrastructure } = require('./stop');
const { linuxInit } = require('./init');
const { runDatabaseMigration, runDatabaseSeed } = require('./migrate');
const { viewStatus, logCenterMenu } = require('./status');
const { databaseBackupMenu } = require('./db-backup');
const { mfaTotpUnbind } = require('./mfa');
const { adminResetPassword } = require('./admin-reset-password');
const { dbResetPassword } = require('./db-reset-password');
const { redisResetPassword } = require('./redis-reset-password');
const versionHelper = require('../drawing-version-helper');

const menuSections = [
  {
    title: '常用',
    items: [
      {
        label: '启动服务（含前后端）',
        desc: '生产运行，默认前台运行',
        action: startMode,
      },
      { label: '查看服务状态', action: viewStatus },
      {
        label: '查看服务日志',
        desc: '实时 / 位置一览 / 打包',
        action: logCenterMenu,
      },
      { label: '停止服务', action: stopInfrastructure },
    ],
  },
  {
    title: '部署与数据库',
    items: [
      {
        label: '部署 / 升级',
        desc: '检查 + 迁移 + 构建 + 启动',
        action: deployMode,
      },
      {
        label: '数据库迁移',
        desc: '应用 schema 变更',
        action: runDatabaseMigration,
      },
      {
        label: '数据库备份与恢复',
        desc: '备份 / 恢复 / 列表 / 清理',
        action: databaseBackupMenu,
        form: 'bare',
      },
      {
        label: 'Linux 初始化（首次部署）',
        desc: '设置 mxcad 权限与 locale',
        action: linuxInit,
        platform: 'linux',
      },
    ],
  },
  {
    title: '高级（排障 / 特殊场景）',
    items: [
      {
        label: '仅启动基础服务',
        desc: '只起 PG/Redis/协同，排障用',
        action: startOnly,
        // 排障三项仅开发机显示（部署包用户用不上）；部署包内的部署流程会
        // 自动执行版本检查/验证，工程师可在部署包用 `start:infra`/
        // `version:check`/`version:verify` 子命令排障
        scope: 'dev',
        form: 'bare',
      },
      {
        label: '图纸版本检查',
        desc: '部署前检查版本仓库',
        action: () => versionHelper.runHealthCheck({ silent: false }),
        scope: 'dev',
      },
      {
        label: '图纸版本验证',
        desc: '部署后验证版本仓库',
        action: () => versionHelper.runVerification({ silent: false }),
        scope: 'dev',
      },
      {
        label: '解绑管理员 TOTP',
        desc: '管理员丢失验证器时的恢复通道',
        action: () => mfaTotpUnbind(),
      },
    ],
  },
  {
    // 密码重置单独成节（ADR-0072/0073）：三条都是锁死时才会跑的恢复通道，
    // 与排障工具混在一节里既不好找也会稀释语义。刻意不给 scope/platform
    // 标记——恢复入口绝不能只在开发机出现。form:'bare'：v1 docker 形态的
    // 密码重置走 docker exec（v2 补齐），故 docker 形态整节隐藏（ADR-0075 C5）。
    title: '密码重置',
    items: [
      {
        label: '重置管理员密码',
        desc: '管理员忘记密码时的恢复通道',
        action: () => adminResetPassword(),
        form: 'bare',
      },
      {
        label: '重置数据库密码',
        desc: '数据库口令轮换，改密后自动更新 .env 并重启后端',
        action: () => dbResetPassword(),
        form: 'bare',
      },
      {
        label: '重置 Redis 密码',
        desc: 'Redis 口令轮换，改密后自动更新 .env 并重启服务',
        action: () => redisResetPassword(),
        form: 'bare',
      },
    ],
  },
  {
    title: '开发环境（仅源码开发机）',
    items: [
      {
        label: '开发模式',
        desc: '启动前后端 dev server',
        action: devMode,
        scope: 'dev',
        form: 'bare',
      },
      {
        label: '数据库种子',
        desc: '初始化系统角色与权限数据',
        action: runDatabaseSeed,
        scope: 'dev',
        form: 'bare',
      },
    ],
  },
];

module.exports = {
  menuSections,
};
