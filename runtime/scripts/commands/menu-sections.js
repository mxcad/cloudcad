/**
 * @fileoverview 交互式菜单数据（分组 + 可见性标记）
 *
 * 纯数据模块：label/desc/action + 可见性标记；过滤与渲染逻辑在 lib/menu.js。
 * 可见性标记（buildVisibleMenu 按环境过滤）：
 * - platform: 'linux' 仅 Linux 显示；'win' 仅 Windows 显示
 * - scope: 'dev' 仅源码开发机显示；'deploy' 仅部署包显示
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
const { viewStatus, viewLogs } = require('./status');
const { databaseBackupMenu } = require('./db-backup');
const { mfaTotpUnbind } = require('./mfa');
const versionHelper = require('../drawing-version-helper');

const menuSections = [
  {
    title: '常用',
    items: [
      {
        label: '启动服务（含前后端）',
        desc: '生产运行，默认 PM2 后台',
        action: startMode,
      },
      { label: '查看服务状态', action: viewStatus },
      { label: '查看服务日志', action: viewLogs },
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
      },
      {
        label: '图纸版本检查',
        desc: '部署前检查版本仓库',
        action: () => versionHelper.runHealthCheck({ silent: false }),
      },
      {
        label: '图纸版本验证',
        desc: '部署后验证版本仓库',
        action: () => versionHelper.runVerification({ silent: false }),
      },
      {
        label: '解绑管理员 TOTP',
        desc: '管理员丢失验证器时的恢复通道',
        action: () => mfaTotpUnbind(),
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
      },
      {
        label: '数据库种子',
        desc: '初始化系统角色与权限数据',
        action: runDatabaseSeed,
        scope: 'dev',
      },
    ],
  },
];

module.exports = {
  menuSections,
};
