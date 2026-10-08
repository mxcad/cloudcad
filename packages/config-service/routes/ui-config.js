/**
 * ui / theme 两个配置资源
 * 端点模板统一走 routes/config-resource.js 工厂
 */

const { configResource } = require('./config-resource');
const uiConfig = require('../ui-config');
const themeConfig = require('../theme-config');

const routes = [
  configResource('ui-config', uiConfig, 'myUiConfig.json'),
  configResource('theme-config', themeConfig, 'myVuetifyThemeConfig.json'),
];

async function handle(req, res, pathname, method) {
  for (const route of routes) {
    if (await route.handle(req, res, pathname, method)) return true;
  }
  return false;
}

module.exports = { handle };
