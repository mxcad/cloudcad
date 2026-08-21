/**
 * CloudCAD 部署运行时单元测试配置（L1 纯函数基线）
 *
 * 测试对象：runtime/scripts 下的纯函数模块（无顶层副作用、可安全 require）
 * 目的：在拆分（Step A）之前用测试钉住当前行为，作为重构锚点 + 特征快照守卫
 *
 * 说明：
 * - testEnvironment: node（纯 Node 脚本，无 DOM）
 * - 无 transform（纯 CJS JS，不需编译）
 * - 不收集 coverage（当前仅基线，不设阈值）
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/test/**/*.test.js'],
  transform: {},
  clearMocks: true,
  restoreMocks: true,
  resetMocks: true,
};
