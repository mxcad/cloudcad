/**
 * ESLint 自定义插件
 * 包含项目特定的代码检查规则
 */

module.exports = {
  rules: {
    'no-prisma-enum-in-api-property': require('./no-prisma-enum-in-api-property'),
  },
};
