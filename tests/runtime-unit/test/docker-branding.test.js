/**
 * docker-runtime 品牌名回归守卫（ADR-0075 C10 / #436）
 *
 * docker-runtime 的用户可见输出（日志前缀、横幅、错误文案）必须经
 * runtime/scripts/lib/branding.js 的 PRODUCT_NAME 引用，禁止硬编码品牌名。
 * 历史违规：index.js 硬编码 [CloudCAD] 前缀（痛点 P8），未走单一事实源。
 *
 * sync-brand.js（pnpm brand:check）只校验静态文件（.sh/.yml 等）与 JS 里的
 * 中文名，无法覆盖 JS 里硬编码的大写英文品牌词（CloudCAD 同时是逻辑标识，
 * 全局替换会误伤 @cloudcad / CloudCAD-PM2 等），故本守卫单独锁定 docker-runtime：
 *   - 所有 .js 文件不得出现大写品牌词 CloudCAD（同时覆盖逻辑标识 CloudCAD
 *     与展示名 MxCloudCAD 两种硬编码，二者都含该子串）；
 *   - 不得出现中文展示名（branding.js 的 PRODUCT_NAME，动态读取，随改名自动更新）。
 * 小写 cloudcad（镜像 tag / 容器名 / 项目名 / DB 名 / systemd slice 等逻辑标识）不受限。
 */
const fs = require('fs');
const path = require('path');
const { PRODUCT_NAME } = require('../../../runtime/scripts/lib/branding');

const ROOT = path.resolve(__dirname, '../../..');
const DOCKER_RUNTIME = path.join(ROOT, 'runtime', 'docker-runtime');

/** 递归列出 docker-runtime 下的 .js 文件（跳过 vendor/ 第三方工具目录） */
function listJsFiles(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === 'vendor') continue;
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) out.push(...listJsFiles(p));
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 相对 ROOT 的正斜杠路径（Windows 下 path.relative 返回反斜杠，统一转换） */
function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join('/');
}

describe('docker-runtime 品牌名守卫（C10）', () => {
  it('所有 .js 文件不硬编码大写品牌词 CloudCAD（含展示名 MxCloudCAD）', () => {
    const offenders = [];
    for (const f of listJsFiles(DOCKER_RUNTIME)) {
      if (fs.readFileSync(f, 'utf8').includes('CloudCAD')) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });

  it('所有 .js 文件不硬编码中文展示名（应引用 branding.js 的 PRODUCT_NAME）', () => {
    const offenders = [];
    for (const f of listJsFiles(DOCKER_RUNTIME)) {
      if (fs.readFileSync(f, 'utf8').includes(PRODUCT_NAME)) offenders.push(rel(f));
    }
    expect(offenders).toEqual([]);
  });
});
