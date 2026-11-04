/**
 * @fileoverview 部署/升级包「剥离 pnpm.patchedDependencies」转换（纯函数，无 IO）
 *
 * 背景：根 package.json 的 pnpm.patchedDependencies（@voerkai18n/cli，dev-only
 * i18n 翻译 CLI 的百度 provider 修复补丁——上游 3.1.0 至今未修，本地补丁是唯一来源）
 * 会随部署/升级包拷到目标机。目标机 pnpm install --offline --prod 即使装不到该包
 * （dev 依赖 + filter 排除），也会按声明校验 patch 文件哈希
 * （createBase32HashFromFile）→ 包内无 patches/ 目录即 ENOENT 中断安装
 * （2026-11-04 windows 部署包实测）。
 *
 * 补丁只服务开发期翻译流程，部署用不到：部署包不携带 patches/ 目录，
 * 须同步剥离包内 package.json 的 pnpm.patchedDependencies 与 pnpm-lock.yaml 的
 * 全部 patch 引用（顶层段 + importers 的 patch_hash 引用 + packages 的补丁条目），
 * 使 lockfile 自洽（纯版本条目保留），pnpm 离线安装不再触碰 patch 文件。
 *
 * 无 patchedDependencies 时为空操作（未来仓库去掉补丁后管道自动退化）。
 *
 * 纯函数准入：仅依赖 node 内置，无框架、无全局状态、无 IO；
 * 文件内容一律由调用方传入，写盘由编排器（pack-offline.js）负责。
 */

/**
 * 剥离 lockfile 中全部 patch 引用（行级手术）。
 *
 * 处理三类引用：
 *   a. 顶层 `patchedDependencies:` 段（键行 + 缩进内容，段后空行归下段）
 *   b. importers 的 `version: X.Y.Z(patch_hash=H)` → `version: X.Y.Z`
 *   c. packages 的 `'name@ver(patch_hash=H)':` 条目块（键行 + 缩进内容；
 *      纯版本条目 `'name@ver':` 保留，importers 改写后指向它）
 *
 * @param {string} lockfileRaw pnpm-lock.yaml 原始内容（LF 行尾）
 * @returns {string} 剥离后的内容
 */
function stripLockfilePatchRefs(lockfileRaw) {
  const lines = lockfileRaw.split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // a. 顶层 patchedDependencies 段：列 0 键行 + 缩进内容。
    // 段后空行直接吃掉——段前空行（已随上文推出）已提供分隔，留下会成双空行
    if (line === 'patchedDependencies:') {
      i += 1;
      while (i < lines.length && lines[i].startsWith(' ')) i += 1;
      if (i < lines.length && lines[i] === '') i += 1;
      continue;
    }

    if (line.includes('(patch_hash=')) {
      if (line.startsWith('  ') && line.trim().endsWith(':')) {
        // c. packages 段补丁条目块：键行（2 空格）+ 内容（恒 4+ 空格缩进，
        //    按 4 空格吃内容，遇 2 空格下一条目键即停，防无空行分隔时误吞）
        i += 1;
        while (i < lines.length && lines[i].startsWith('    ')) i += 1;
        if (i < lines.length && lines[i] === '') i += 1;
        continue;
      }
      // b. importers 的 version 引用（含嵌套依赖引用）：去掉 (patch_hash=H)
      out.push(line.replace(/\(patch_hash=[a-z0-9]+\)/g, ''));
      i += 1;
      continue;
    }

    out.push(line);
    i += 1;
  }
  return out.join('\n');
}

/**
 * 剥离包内 package.json 的 pnpm.patchedDependencies 与 pnpm-lock.yaml 的 patch 引用。
 *
 * @param {string} packageJsonRaw 包内 package.json 原始内容
 * @param {string} lockfileRaw 包内 pnpm-lock.yaml 原始内容
 * @returns {{packageJson: string, lockfile: string, changed: boolean}}
 * @throws {Error} 转换后 lockfile 仍残留 patch 引用（门禁：宁可中止打包不出坏包）
 */
function stripPatchedDependencies(packageJsonRaw, lockfileRaw) {
  let packageJson = packageJsonRaw;
  let pkgChanged = false;

  const pkg = JSON.parse(packageJsonRaw);
  if (pkg.pnpm && pkg.pnpm.patchedDependencies) {
    delete pkg.pnpm.patchedDependencies;
    if (Object.keys(pkg.pnpm).length === 0) delete pkg.pnpm;
    const eol = packageJsonRaw.includes('\r\n') ? '\r\n' : '\n';
    const trailing =
      packageJsonRaw.endsWith('\n') || packageJsonRaw.endsWith('\r') ? eol : '';
    packageJson = JSON.stringify(pkg, null, 2) + trailing;
    pkgChanged = true;
  }

  let lockfile = lockfileRaw;
  let lockChanged = false;
  if (lockfileRaw.includes('patchedDependencies') || lockfileRaw.includes('patch_hash=')) {
    lockfile = stripLockfilePatchRefs(lockfileRaw);
    lockChanged = lockfile !== lockfileRaw;
    const leftovers = lockfile
      .split('\n')
      .filter((l) => l.includes('patchedDependencies') || l.includes('patch_hash='));
    if (leftovers.length > 0) {
      throw new Error(
        `pnpm-lock.yaml 剥离后仍残留 patch 引用，中止打包: ${leftovers.join(' | ')}`
      );
    }
  }

  return { packageJson, lockfile, changed: pkgChanged || lockChanged };
}

module.exports = {
  stripPatchedDependencies,
  stripLockfilePatchRefs,
};
