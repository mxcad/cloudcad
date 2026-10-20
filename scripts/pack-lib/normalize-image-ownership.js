/**
 * @fileoverview 把 docker save 镜像 tar 的全部层文件属主归一化为 0:0（root:root）
 *
 * 背景（ADR-0075）：无 newuidmap/newgidmap 的机器上 rootless-ns 只能做单段
 * 0→euid 映射。dockerd 应用镜像层时对每个文件 lchown 到层内记录的 uid/gid；
 * 官方 alpine 基础层含非零属主（/etc/shadow root:shadow gid=42、nginx 100/101、
 * node 1000/1000、yarn 503/20 等），内核对未映射 id 返回 EINVAL →
 * docker load 报 "lchown /etc/shadow: invalid argument"（mx@ubuntu 无 root
 * 机器实测，2026-10-20）。包内三镜像（app/pg/redis）容器内均以 uid 0 运行，
 * 文件属主无运行时意义，故打包时把全部层重写为 0:0：单段映射即够，
 * 「零管理员前置」承诺在任意无 root 机器成立。
 *
 * 实现：流式重写层 tar 各条目头的 uid/gid/uname/gname 字段（ustar；pax 扩展头
 * 的 uid=/gid= 记录作防御性处理），重算头校验和；文件内容字节不变。
 * 层是否变化以 config blob 的 rootfs.diff_ids（未压缩 sha256，docker load 实际
 * 校验的基准）为准，**不重命名层目录**：目录名只是 manifest 的查找键（registry
 * 拉取层的目录名是压缩 digest，本就 ≠ 文件 sha256，docker load 照常工作），
 * 且 docker save 对同内容层用符号链接去重（layer.tar -> ../<他层>/layer.tar），
 * 重命名目录会弄断这些链接。变化的层把真实文件原地替换（符号链接自动指向新
 * 内容，共享目标只重写一次），同步更新 config blob 的 diff_ids（digest 变化则
 * 重命名 config 文件并更新 manifest 的 Config 引用；Layers 引用不变）。
 * 已全 0:0 的层重写后字节不变、diff_id 稳定。
 * 重新打包时外层条目须 `--owner=0 --group=0`（docker save 产物外层条目全 0:0；
 * 单段映射目标机解包外层文件同样会 lchown 到记录属主，非 0 属主会 EINVAL）。
 *
 * 纯文件 IO 模块（无顶层副作用），可单测（tests/runtime-unit）。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const BLOCK = 512;

/** 解析 tar 头 size 字段（octal；GNU base-256 扩展兜底） */
function parseSizeField(hdr) {
  const raw = hdr.toString('ascii', 124, 136).replace(/\0/g, '').trim();
  if (/^[0-7]+$/.test(raw)) return parseInt(raw, 8);
  let n = 0;
  for (let i = 124; i < 136; i++) n = n * 256 + hdr[i];
  return n;
}

function writeSizeField(hdr, size) {
  hdr.write(size.toString(8).padStart(11, '0') + '\0', 124, 'ascii');
}

/** 重算头校验和（校验和字段按空格计；写 6 位 octal + NUL + 空格） */
function recomputeChecksum(hdr) {
  hdr.fill(0x20, 148, 156);
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) sum += hdr[i];
  hdr.write(sum.toString(8).padStart(6, '0'), 148, 'ascii');
  hdr[154] = 0;
  hdr[155] = 0x20;
}

/** 头是否含非 0:0 属主信息（uid/gid 字段或 uname/gname 非空） */
function headerNeedsRewrite(hdr) {
  if (hdr.toString('ascii', 108, 116) !== '0000000\0') return true;
  if (hdr.toString('ascii', 116, 124) !== '0000000\0') return true;
  for (let i = 265; i < 329; i++) {
    if (hdr[i] !== 0) return true;
  }
  return false;
}

function zeroOwnershipFields(hdr) {
  hdr.write('0000000\0', 108, 'ascii');
  hdr.write('0000000\0', 116, 'ascii');
  hdr.fill(0, 265, 329);
}

/**
 * 重写 pax 扩展头内容里的 uid=/gid= 记录为 0（防御分支：本仓库实测层 tar
 * 均为纯 ustar、uid/gid 恒在主头；此分支防未来基础镜像改用 pax 格式）。
 * 返回新内容（已补齐 512 整数倍；无变化时字节不变）。
 */
function rewritePaxContent(content) {
  const records = [];
  let pos = 0;
  while (pos < content.length) {
    if (content[pos] === 0) {
      pos += 1;
      continue;
    }
    const nl = content.indexOf(0x0a, pos);
    if (nl < 0) break;
    const line = content.toString('utf8', pos, nl + 1);
    const sp = line.indexOf(' ');
    const len = parseInt(line.slice(0, sp), 10);
    const eq = line.indexOf('=', sp);
    records.push({ key: line.slice(sp + 1, eq), value: line.slice(eq + 1, line.length - 1) });
    pos += len;
  }
  let changed = false;
  for (const r of records) {
    if ((r.key === 'uid' || r.key === 'gid') && r.value !== '0') {
      r.value = '0';
      changed = true;
    }
  }
  const pad = (buf) => {
    const out = Buffer.alloc(Math.ceil(buf.length / BLOCK) * BLOCK);
    buf.copy(out);
    return out;
  };
  if (!changed) return pad(content);
  let out = '';
  for (const r of records) {
    const body = `${r.key}=${r.value}\n`;
    let prefix = `${body.length} `;
    for (;;) {
      const rec = `${prefix}${body}`;
      const next = `${rec.length} `;
      if (next === prefix) {
        out += rec;
        break;
      }
      prefix = next;
    }
  }
  return pad(Buffer.from(out, 'utf8'));
}

/**
 * 流式重写层 tar 全部条目属主为 0:0。文件内容字节不变，仅头字段变化
 * （校验和同步重算）。已 0:0 的条目头原样拷贝（digest 稳定）。
 * @param {string} srcPath 原层 tar
 * @param {string} dstPath 输出路径
 * @returns {{entries: number, changed: number}} 条目数 / 实际重写的头数
 */
function rewriteLayerTar(srcPath, dstPath) {
  const srcFd = fs.openSync(srcPath, 'r');
  const dstFd = fs.openSync(dstPath, 'w');
  const srcSize = fs.fstatSync(srcFd).size;
  let srcOff = 0;
  const hdr = Buffer.alloc(BLOCK);
  const chunk = Buffer.alloc(BLOCK);
  let entries = 0;
  let changed = 0;
  try {
    while (srcOff + BLOCK <= srcSize) {
      fs.readSync(srcFd, hdr, 0, BLOCK, srcOff);
      const isZero = hdr.every((b) => b === 0);
      if (isZero) {
        fs.writeSync(dstFd, hdr);
        srcOff += BLOCK;
        continue;
      }
      const typeflag = hdr[156];
      const size = parseSizeField(hdr);
      const contentBytes = Math.ceil(size / BLOCK) * BLOCK;
      if (typeflag === 0x78 || typeflag === 0x67) {
        // pax 扩展头：内容可能含 uid=/gid= 记录，须同步重写
        const content = Buffer.alloc(size);
        if (size > 0) fs.readSync(srcFd, content, 0, size, srcOff + BLOCK);
        const newContent = rewritePaxContent(content);
        const newHdr = Buffer.from(hdr);
        const needs = headerNeedsRewrite(newHdr);
        if (needs) {
          zeroOwnershipFields(newHdr);
          changed += 1;
        }
        if (newContent.length !== contentBytes) {
          writeSizeField(newHdr, newContent.length);
        }
        if (needs || newContent.length !== contentBytes) {
          recomputeChecksum(newHdr);
        }
        fs.writeSync(dstFd, newHdr);
        fs.writeSync(dstFd, newContent);
        srcOff += BLOCK + contentBytes;
        entries += 1;
      } else {
        const needs = headerNeedsRewrite(hdr);
        if (needs) {
          const newHdr = Buffer.from(hdr);
          zeroOwnershipFields(newHdr);
          recomputeChecksum(newHdr);
          fs.writeSync(dstFd, newHdr);
          changed += 1;
        } else {
          fs.writeSync(dstFd, hdr);
        }
        let pos = srcOff + BLOCK;
        let remaining = contentBytes;
        while (remaining > 0) {
          const r = fs.readSync(srcFd, chunk, 0, Math.min(BLOCK, remaining), pos);
          if (r <= 0) break;
          fs.writeSync(dstFd, chunk, 0, r);
          pos += r;
          remaining -= r;
        }
        srcOff += BLOCK + contentBytes;
        entries += 1;
      }
    }
  } finally {
    fs.closeSync(srcFd);
    fs.closeSync(dstFd);
  }
  return { entries, changed };
}

/** 文件 sha256（hex） */
function sha256File(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const hash = crypto.createHash('sha256');
    const buf = Buffer.alloc(1024 * 1024);
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(buf.slice(0, n));
    }
    return hash.digest('hex');
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * 扫描单个层 tar 的全部条目头，返回非 0:0 属主条目样例（纯头解析，
 * 不依赖 tar 文本输出格式，GNU/bsdtar 宿主皆可用）。
 * @param {string} layerTarPath
 * @returns {string[]} 违规条目描述（空 = 全部 0:0）
 */
function scanLayerOwnership(layerTarPath) {
  const fd = fs.openSync(layerTarPath, 'r');
  const bad = [];
  const hdr = Buffer.alloc(BLOCK);
  const size = fs.fstatSync(fd).size;
  let off = 0;
  try {
    while (off + BLOCK <= size) {
      fs.readSync(fd, hdr, 0, BLOCK, off);
      const isZero = hdr.every((b) => b === 0);
      if (isZero) {
        off += BLOCK;
        continue;
      }
      const name = hdr.toString('utf8', 0, 100).replace(/\0.*$/, '');
      if (headerNeedsRewrite(hdr)) {
        bad.push(`${name} (uid=${hdr.toString('ascii', 108, 116).replace(/\0.*$/, '')} gid=${hdr.toString('ascii', 116, 124).replace(/\0.*$/, '')})`);
      }
      const contentBytes = Math.ceil(parseSizeField(hdr) / BLOCK) * BLOCK;
      off += BLOCK + contentBytes;
    }
  } finally {
    fs.closeSync(fd);
  }
  return bad;
}

/**
 * 断言镜像 tar 全部层的所有条目属主均为 0:0（单段映射可加载的充分条件）。
 * 存在非 0:0 条目时抛错（附前 10 条样例）。
 * @param {string} imageTarPath docker save 产物
 * @param {string} [tarBin] tar 可执行文件（Windows 宿主传 bsdtar 全路径）
 */
function assertAllZeroOwnership(imageTarPath, tarBin = 'tar') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-normimg-check-'));
  try {
    execFileSync(tarBin, ['-xf', imageTarPath, '-C', tmp], { stdio: 'pipe' });
    const bad = [];
    for (const d of fs.readdirSync(tmp)) {
      const layerTar = path.join(tmp, d, 'layer.tar');
      if (!fs.existsSync(layerTar) || !fs.statSync(layerTar).isFile()) continue;
      for (const entry of scanLayerOwnership(layerTar)) {
        bad.push(`${d}/layer.tar: ${entry}`);
      }
    }
    // manifest 引用的层/config 必须真实存在（防 digest 更新后引用悬空）
    const manifest = JSON.parse(fs.readFileSync(path.join(tmp, 'manifest.json'), 'utf8'));
    for (const image of manifest) {
      if (!fs.existsSync(path.join(tmp, image.Config))) {
        bad.push(`manifest 引用缺失的 config: ${image.Config}`);
      }
      for (const ref of image.Layers) {
        if (!fs.existsSync(path.join(tmp, ref))) {
          bad.push(`manifest 引用缺失的层: ${ref}`);
        }
      }
    }
    if (bad.length > 0) {
      throw new Error(
        `镜像层仍含非 0:0 属主条目或引用缺失（前 ${Math.min(10, bad.length)} 条）：\n  ${bad.slice(0, 10).join('\n  ')}`,
      );
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 保留 diff_id 原有的 "sha256:" 前缀形态 */
function withPrefix(orig, hex) {
  return orig.startsWith('sha256:') ? `sha256:${hex}` : hex;
}

/**
 * 把 docker save 镜像 tar 的全部层属主归一化为 0:0，同步更新 config blob
 * （rootfs.diff_ids）与 manifest.json（仅 Config 引用，Layers 不变）。
 * 原地变换（新 tar 替换原文件）。
 * @param {string} imageTarPath docker save 产物
 * @param {object} [opts]
 * @param {Function} [opts.log] 日志函数
 * @param {string} [opts.tarBin] tar 可执行文件（Windows 宿主传 bsdtar 全路径）
 * @returns {{layers: number, rewritten: number}} 层数 / 属主被重写的层数
 */
function normalizeImageTar(imageTarPath, opts = {}) {
  const log = opts.log || (() => {});
  const tarBin = opts.tarBin || 'tar';
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-normimg-'));
  const extractDir = path.join(tmp, 'extract');
  fs.mkdirSync(extractDir, { recursive: true });
  try {
    execFileSync(tarBin, ['-xf', imageTarPath, '-C', extractDir], { stdio: 'pipe' });
    const realExtractDir = fs.realpathSync(extractDir);
    const manifestPath = path.join(extractDir, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    let layers = 0;
    let rewritten = 0;
    // 真实文件 → 重写结果缓存：docker save 对同内容层用符号链接去重
    // （layer.tar -> ../<他层>/layer.tar），同一真实文件可能被多个层目录引用，
    // 只重写/替换一次，其余引用经符号链接自动看到新内容
    const processed = new Map();
    let manifestChanged = false;
    for (const image of manifest) {
      const configPath = path.join(extractDir, image.Config);
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const origDiffIds = (config.rootfs && config.rootfs.diff_ids) || [];
      if (!Array.isArray(origDiffIds) || origDiffIds.length !== image.Layers.length) {
        throw new Error(
          `config ${image.Config} 的 rootfs.diff_ids（${origDiffIds.length} 条）与 manifest Layers（${image.Layers.length} 条）不匹配`,
        );
      }
      const newDiffIds = origDiffIds.slice();
      for (let i = 0; i < image.Layers.length; i++) {
        const layerTar = path.join(extractDir, path.dirname(image.Layers[i]), 'layer.tar');
        // 解析符号链接到真实文件（断链/缺失在此抛 ENOENT，错误信息含完整路径）
        const realFile = fs.realpathSync(layerTar);
        if (!realFile.startsWith(realExtractDir + path.sep)) {
          throw new Error(`层符号链接指向解包目录之外：${image.Layers[i]} → ${realFile}`);
        }
        let info = processed.get(realFile);
        if (!info) {
          const newTar = `${realFile}.new`;
          rewriteLayerTar(realFile, newTar);
          const newDigest = sha256File(newTar);
          const replaced = newDigest !== origDiffIds[i].replace(/^sha256:/, '');
          if (replaced) {
            // 原地替换真实文件：指向它的符号链接自动生效；不重命名层目录
            // （目录名是 manifest 查找键，registry 拉取层本就是压缩 digest ≠ 文件 sha）
            fs.renameSync(newTar, realFile);
          } else {
            fs.unlinkSync(newTar); // 层已全 0:0，重写后字节不变
          }
          info = { newDigest, replaced };
          processed.set(realFile, info);
        }
        layers += 1;
        if (info.replaced) {
          newDiffIds[i] = withPrefix(origDiffIds[i], info.newDigest);
          rewritten += 1;
        }
      }
      if (newDiffIds.some((d, i) => d !== origDiffIds[i])) {
        // config blob：diff_ids 同步更新，digest 变化则重命名文件并更新 manifest 引用
        config.rootfs = Object.assign({}, config.rootfs, { diff_ids: newDiffIds });
        const newContent = JSON.stringify(config);
        const newRef = `${crypto.createHash('sha256').update(newContent).digest('hex')}.json`;
        fs.writeFileSync(configPath, newContent);
        if (newRef !== image.Config) {
          fs.renameSync(configPath, path.join(extractDir, newRef));
        }
        image.Config = newRef;
        manifestChanged = true;
      }
    }
    if (manifestChanged) {
      fs.writeFileSync(manifestPath, JSON.stringify(manifest));
    }
    // 重新打包：显式列顶层条目（保持无 ./ 前缀的条目名）；--owner/--group=0
    // 对齐 docker save 产物的外层条目属主（单段映射目标机解包外层同样 lchown）
    const newTar = `${imageTarPath}.new`;
    const topEntries = fs.readdirSync(extractDir);
    execFileSync(
      tarBin,
      ['-cf', newTar, '--owner=0', '--group=0', '--numeric-owner', '-C', extractDir, ...topEntries],
      { stdio: 'pipe' },
    );
    fs.renameSync(newTar, imageTarPath);
    assertAllZeroOwnership(imageTarPath, tarBin);
    log(`  层属主归一化完成：${layers} 层，${rewritten} 层含非 0:0 条目已重写`);
    return { layers, rewritten };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

module.exports = {
  rewriteLayerTar,
  rewritePaxContent,
  scanLayerOwnership,
  normalizeImageTar,
  assertAllZeroOwnership,
  sha256File,
};
