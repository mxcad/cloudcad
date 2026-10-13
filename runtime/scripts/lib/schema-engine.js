/**
 * @fileoverview Prisma schema-engine 预置二进制发现（唯一出口）
 *
 * 背景：pack-offline.js bundlePrismaSchemaEngine 预置全平台 schema-engine 到
 * runtime/prisma-engines/。pnpm store manifest 不引用 postinstall 下载的 schema-engine，
 * 部署机重建 @prisma/engines 包目录缺该二进制 → prisma CLI（getEnginesPath）找不到 →
 * 回退联网下载 → 断网 migrate deploy 失败。故由调用方设 PRISMA_SCHEMA_ENGINE_BINARY 指向
 * 预置二进制（绝对路径，prisma CLI Ry() 按 process.cwd() 解析）。
 *
 * 二进制按平台区分（debian/rhel/musl × openssl 版本 × arch）。选择策略：
 *   - Windows：schema-engine-windows.exe。
 *   - Linux：优先选与当前平台匹配的二进制（复刻 prisma CLI 平台检测：/etc/os-release →
 *     distro family，openssl 版本 → libssl 后缀，arch → 文件名）；匹配不到则回退到
 *     静态链接的 schema-engine-debian-openssl-1.1.x（无运行时 openssl 依赖，glibc 通用，
 *     经验证在 ubuntu22 上 ldd 无 libssl 依赖、可正常运行），最后回退任意非 windows 二进制。
 *
 * 收敛自 commands/migrate.js 与 verify-deploy.js 两份逐字节相同的内联副本：调用方只要
 * `findSchemaEngine()` 拿到路径或 null，平台判断 / 候选文件名 / 存在性检查全部藏在这里。
 *
 * 依赖方向铁律：lib 只允许 require 其他 lib 或独立模块，禁止 require commands。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { IS_WINDOWS, PROJECT_ROOT } = require('./context');

// pack-offline.js 预置目录（离线部署包内）
const ENGINES_DIR = path.join(PROJECT_ROOT, 'runtime', 'prisma-engines');

const WINDOWS_ENGINE = 'schema-engine-windows.exe';
// 静态链接、无运行时 openssl 依赖 → glibc 通用回退件
const STATIC_DEBIAN_ENGINE = 'schema-engine-debian-openssl-1.1.x';

/**
 * 复刻 prisma CLI 的 Linux 平台检测，产出期望的二进制文件名。
 * distro family（alpine→musl；rhel/centos/rocky/almalinux/fedora/amzn/ol/suse→rhel；
 * 其余→debian）× openssl 版本（ldconfig libssl.so → openssl version -v）× arch。
 * @returns {string|null} 期望文件名；检测失败返回 null
 */
function detectLinuxSchemaEngineName() {
  try {
    // distro family：alpine→musl；centos/rhel/rocky/almalinux/fedora/suse→rhel；其余→debian
    let family = 'debian';
    try {
      const osRelease = fs.readFileSync('/etc/os-release', 'utf-8');
      const id = ((osRelease.match(/(^|\n)ID="?([^"\n]*)"?/i) || [])[2] || '').toLowerCase();
      const idLike = ((osRelease.match(/(^|\n)ID_LIKE="?([^"\n]*)"?/i) || [])[2] || '').toLowerCase();
      const ids = `${id} ${idLike}`;
      if (ids.includes('alpine')) family = 'musl';
      else if (/rhel|centos|rocky|almalinux|fedora|amzn|\bol\b|suse/.test(ids)) family = 'rhel';
      else family = 'debian'; // ubuntu/debian/raspbian 等默认 debian
    } catch { /* 保持默认 debian */ }
    // openssl 版本：优先 ldconfig 检测 libssl.so（libssl.so.3→3.0.x、libssl.so.1.1→1.1.x），
    // 其次 openssl version -v
    let libssl = '';
    try {
      const out = execSync('ldconfig -p 2>/dev/null', { encoding: 'utf-8' });
      const m = out.match(/libssl\.so\.(\d+)(?:\.(\d+))?/);
      if (m) libssl = `${m[1]}.${m[2] || '0'}.x`;
    } catch { /* 继续 */ }
    if (!libssl) {
      try {
        const out = execSync('openssl version -v 2>/dev/null', { encoding: 'utf-8' });
        const m = out.match(/^OpenSSL\s(\d+)\.(\d+)\.\d+/);
        if (m) libssl = `${m[1]}.${m[2]}.x`;
      } catch { /* 继续 */ }
    }
    const arch = process.arch === 'arm64' ? 'arm64' : '';
    if (family === 'musl') {
      return arch ? `schema-engine-linux-musl-${arch}-openssl-${libssl}` : 'schema-engine-linux-musl';
    }
    const archSuffix = arch ? `-${arch}` : '';
    const libsslSuffix = libssl ? `-openssl-${libssl}` : '';
    return `schema-engine-${family}${archSuffix}${libsslSuffix}`;
  } catch {
    return null;
  }
}

/**
 * 查找预置 schema-engine 二进制绝对路径（平台匹配 + 静态 debian 回退）。
 * @returns {string|null} 预置 schema-engine 绝对路径；未预置返回 null（调用方回退联网下载）
 */
function findSchemaEngine() {
  if (!fs.existsSync(ENGINES_DIR)) return null;
  const engines = fs
    .readdirSync(ENGINES_DIR)
    .filter((f) => f.startsWith('schema-engine') && !f.endsWith('.sha256'));
  if (engines.length === 0) return null;
  if (IS_WINDOWS) {
    const win = engines.find((f) => f === WINDOWS_ENGINE);
    return path.join(ENGINES_DIR, win || engines[0]);
  }
  // Linux：优先平台匹配二进制，回退静态 debian（glibc 通用），最后任意非 windows
  const detected = detectLinuxSchemaEngineName();
  if (detected) {
    const match = engines.find((f) => f === detected);
    if (match) return path.join(ENGINES_DIR, match);
  }
  const fallback =
    engines.find((f) => f === STATIC_DEBIAN_ENGINE) ||
    engines.find((f) => !f.includes('windows')) ||
    engines[0];
  return path.join(ENGINES_DIR, fallback);
}

module.exports = { findSchemaEngine };
