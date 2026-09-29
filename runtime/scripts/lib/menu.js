/**
 * @fileoverview 交互式菜单的纯逻辑（平台/形态过滤 + 编号 + 渲染）
 *
 * 菜单数据（含命令 action）在 commands/menu-sections.js，本模块不依赖 commands：
 * - buildVisibleMenu：按 item.platform（'linux'/'win'）与 item.scope
 *   （'dev' 仅源码开发机 / 'deploy' 仅部署包）过滤，空 section 整体移除，
 *   剩余项跨 section 顺序编号 1..N（连续编号避免重复数字歧义）
 * - formatMenu：渲染为行数组（不直接 console，便于测试断言）；退出项固定 [q]
 *
 * 运行：node --test runtime/scripts/lib/menu.test.js
 */

const { colors } = require('./logger');

/**
 * 过滤菜单项并顺序编号。
 * @param {Array<{title: string, items: Array}>} sections 菜单数据（action 原样透传）
 * @param {{isLinux: boolean, isWindows: boolean, isDeployPackage: boolean}} env
 * @returns {Array<{title: string, items: Array}]} 过滤后的 sections（空 section 移除）
 */
function buildVisibleMenu(sections, env) {
  const visible = [];
  let counter = 0;
  for (const section of sections) {
    const items = section.items
      .filter((item) => {
        if (item.platform === 'linux' && !env.isLinux) return false;
        if (item.platform === 'win' && !env.isWindows) return false;
        if (item.scope === 'dev' && env.isDeployPackage) return false;
        if (item.scope === 'deploy' && !env.isDeployPackage) return false;
        return true;
      })
      .map((item) => {
        counter += 1;
        return { ...item, key: String(counter) };
      });
    if (items.length > 0) {
      visible.push({ title: section.title, items });
    }
  }
  return visible;
}

/**
 * 渲染菜单为行数组。
 * @param {Array<{title: string, items: Array}>} sections buildVisibleMenu 的产物
 * @returns {string[]}
 */
function formatMenu(sections) {
  const lines = [];
  lines.push(`${colors.bright}请选择操作：${colors.reset}`);
  lines.push('');
  for (const section of sections) {
    lines.push(`  ${colors.dim}—— ${section.title} ——${colors.reset}`);
    for (const item of section.items) {
      const desc = item.desc ? `  ${colors.dim}${item.desc}${colors.reset}` : '';
      lines.push(`  ${colors.cyan}[${item.key}]${colors.reset} ${item.label}${desc}`);
    }
    lines.push('');
  }
  lines.push(`  ${colors.cyan}[q]${colors.reset} 退出`);
  lines.push('');
  return lines;
}

module.exports = {
  buildVisibleMenu,
  formatMenu,
};
