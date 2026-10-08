/**
 * server / sketches / quick-command 三个配置资源
 * 端点模板统一走 routes/config-resource.js 工厂
 */

const { configResource } = require('./config-resource');
const serverConfig = require('../server-config');
const sketchesConfig = require('../sketches-config');
const quickCommandConfig = require('../quick-command-config');

const routes = [
  configResource('server-config', serverConfig, 'myServerConfig.json'),
  configResource(
    'sketches-config',
    sketchesConfig,
    'mySketchesAndNotesUiConfig.json'
  ),
  configResource('quick-command', quickCommandConfig, 'myQuickCommand.json'),
];

async function handle(req, res, pathname, method) {
  for (const route of routes) {
    if (await route.handle(req, res, pathname, method)) return true;
  }
  return false;
}

module.exports = { handle };
