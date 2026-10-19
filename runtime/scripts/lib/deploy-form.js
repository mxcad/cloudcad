/**
 * 部署形态检测 —— 唯一出口（ADR-0075 C3）
 *
 * 标记约定：
 *   - `.deploy` 内容 `form=docker` → docker 形态
 *   - `.deploy`（内容 `form=bare` 或空）→ 裸机形态（空 = 存量裸机包，兼容）
 *   - 存量 docker 包标记 `.deploy-docker` → docker 形态（V5 存量兼容）
 *   - 两者皆无 → null（开发仓库，非部署包）
 *
 * 新包只写 `.deploy`（裸机空内容 / docker 写 `form=docker`）；
 * `.deploy-docker` 只读不写。`.deploy` 存在时以其为准（新标记优先于存量标记）。
 *
 * 纯 fs 判定，无副作用；rootDir 参数化以便单测（临时目录 fixture）。
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {string} rootDir 部署根目录（开发仓库 = 项目根）
 * @returns {'bare'|'docker'|null}
 */
function detectDeployForm(rootDir) {
  const deployMarker = path.join(rootDir, '.deploy');
  if (fs.existsSync(deployMarker)) {
    let content = '';
    try {
      content = fs.readFileSync(deployMarker, 'utf8').trim();
    } catch {
      content = '';
    }
    return content === 'form=docker' ? 'docker' : 'bare';
  }
  if (fs.existsSync(path.join(rootDir, '.deploy-docker'))) {
    return 'docker';
  }
  return null;
}

module.exports = { detectDeployForm };
