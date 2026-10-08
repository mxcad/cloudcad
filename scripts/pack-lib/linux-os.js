/**
 * @fileoverview Linux 发行版清单单一事实源（ADR-0059：发行版收敛 3 glibc 档）
 *
 * 打包侧（pack-offline / pack-menu / pack-linux-deploy / pack-runtime-deps /
 * verify-linux-deploy）与运行时侧（scripts/ensure-runtime.js 的 tier 探测）必须使用
 * 同一组 tier。历史上 pack-offline/pack-menu 硬编码 6 档而 pack-linux-deploy 只有
 * 3 个基础镜像，ubuntu24/rocky8/debian 会静默回退 centos7 基础镜像，产出「标签
 * ubuntu24、底座 centos7」的包且包名误导。所有脚本一律从这里读清单，禁止各自
 * 硬编码；新增 tier = 在此加一条（并同步 ensure-runtime 的探测）。
 */
const LINUX_OS = {
  centos7: { label: 'CentOS 7 (glibc 2.17)', baseImage: 'centos:7' },
  ubuntu22: { label: 'Ubuntu 22.04 (glibc 2.35)', baseImage: 'ubuntu:22.04' },
  rocky9: { label: 'Rocky Linux 9 (glibc 2.34)', baseImage: 'rockylinux:9' },
};

/** 各 tier 的 Docker 基础镜像（{ os: image }，保持 LINUX_OS 键序） */
const LINUX_OS_BASE_IMAGES = Object.fromEntries(
  Object.entries(LINUX_OS).map(([os, def]) => [os, def.baseImage])
);

function isSupportedOs(os) {
  return Object.prototype.hasOwnProperty.call(LINUX_OS, os);
}

function supportedOsList() {
  return Object.keys(LINUX_OS);
}

module.exports = {
  LINUX_OS,
  LINUX_OS_BASE_IMAGES,
  isSupportedOs,
  supportedOsList,
};
