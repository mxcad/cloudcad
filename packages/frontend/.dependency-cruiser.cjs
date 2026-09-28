///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

/**
 * 前端依赖分层与模块入口门禁
 *
 * 三层模型，导入方向只能向下 L3 → L2 → L1：
 *   L1 基础设施  constants/ types/ utils/ lib/ languages/ config/ api-sdk/ styles/
 *   L2 核心业务  services/ stores/ contexts/ hooks/
 *   L3 业务编排  pages/ components/
 *
 * 存量违反由 `depcruise-baseline` 记录在 `.dependency-cruiser.baseline.cjs`，
 * 随「前端依赖违反清理」收敛；新增违反仍为红灯。
 *
 * @see docs/adr/0028-front-end-dependency-layering.md
 * @see docs/adr/0029-front-end-module-entry.md
 */

const L1 = '^src/(constants|types|utils|lib|languages|config|api-sdk|styles)/';
const L2 = '^src/(services|stores|contexts|hooks)/';
const L3 = '^src/(pages|components)/';
const BUSINESS = '^src/(services|stores|contexts|hooks|pages|components)/';
const SRC = '^src/';

/** 已建 barrel（index.ts）的模块：外部消费者必须从入口导入（ADR-0029） */
const FACCED = [
  'components/ui',
  'components/common',
  'components/file-item',
  'components/export',
  'components/notice',
  'components/notification',
  'components/search',
  'components/tour',
  'components/ProjectDrawingsPanel',
  'components/FileIcons',
  'services/mxcadManager',
  'hooks/file-system',
  'hooks/file-browser',
];

/** 目录正则特殊字符需转义，否则 `|` 会被解释成分组内选择 */
const escapePath = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FACCED_RE = FACCED.map(escapePath).join('|');

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    parser: 'tsc',
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '^src/test/',
        '\\.spec\\.(ts|tsx)$',
        '\\.test\\.(ts|tsx)$',
        '__tests__/',
      ],
    },
  },
  forbidden: [
    {
      name: 'no-circular',
      comment: 'ADR-0028：禁止循环依赖（限 src/，第三方包内部环不纳入）',
      severity: 'error',
      from: { path: SRC },
      to: { circular: true, path: SRC },
    },
    {
      name: 'no-upward-from-l1',
      comment:
        'ADR-0028：L1 基础设施不得依赖业务层（services/stores/contexts/hooks/pages/components）',
      severity: 'error',
      from: { path: L1 },
      to: { path: BUSINESS },
    },
    {
      name: 'no-l2-to-l3',
      comment: 'ADR-0028：L2 核心业务不得依赖 L3 表现层（pages/components）',
      severity: 'error',
      from: { path: L2 },
      to: { path: L3 },
    },
    {
      name: 'no-ui-to-business',
      comment:
        'ADR-0028：components/ui 不得依赖业务层或业务组件/pages（UI 组件是叶子）',
      severity: 'error',
      from: { path: '^src/components/ui/' },
      to: { path: BUSINESS, pathNot: '^src/components/ui/' },
    },
    {
      name: 'no-cross-page-import',
      comment: 'ADR-0028：pages 之间不互相 import，页面跳转走路由导航',
      severity: 'warn',
      from: { path: '^src/pages/([^/]+)/', pathNot: '^src/pages/$1/' },
      to: { path: '^src/pages/([^/]+)/' },
    },
    {
      name: 'no-deep-path-import',
      comment:
        'ADR-0029：已有入口的模块，外部消费者只能从 index.ts 导入；模块内部子树可直连',
      severity: 'warn',
      from: { pathNot: `^src/${FACCED_RE}/` },
      to: { path: `^src/${FACCED_RE}/[^/]+$`, pathNot: 'index\\.(ts|tsx)$' },
    },
  ],
};
