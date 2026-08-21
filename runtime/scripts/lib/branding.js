/**
 * @fileoverview 产品品牌单一事实源（Single Source of Truth）
 *
 * 所有 CLI / 打包 / 部署脚本中【用户可见】的产品名称，一律从此文件引用
 * （JS 代码 require 本模块），或由 `pnpm brand:sync` 同步到静态脚本
 * （.sh / .bat / .yml / systemd 模板等）。禁止在业务代码中硬编码品牌名。
 *
 * 改名流程（只改这一处）：
 *   1. 修改 PRODUCT_NAME / PRODUCT_NAME_EN_DISPLAY 为新名称；
 *   2. 运行 `pnpm brand:sync`（JS 运行时引用立即生效，静态文件同步刷新）；
 *   3. 提交改动（含 scripts/sync-brand.js 的 LEGACY_NAMES 追加旧名）。
 *
 * ⚠️ PRODUCT_NAME_EN（CloudCAD）为【逻辑标识】：@cloudcad/* 包名、cloudcad.sh
 *    命令名、cloudcad-deploy-* 产物文件名、cloudcad 数据库名、CloudCAD-PM2
 *    注册表键、CloudCAD fixed wrapper 升级检测标识、/etc/cloudcad 目录、
 *    cloudcad 系统用户、noreply@cloudcad.com 邮箱域名等均依赖它，
 *    禁止修改，否则破坏升级检测与既有部署。
 *
 * PRODUCT_NAME_EN_DISPLAY 为用户可见的英文展示名（CLI 横幅、静态脚本 /
 * 服务描述中的英文品牌名等），与逻辑标识 PRODUCT_NAME_EN 相互独立，
 * 可随品牌调整自由修改，不影响任何逻辑标识。
 *
 * 前端 UI 的品牌由 packages/config-service/brand.js 的运行时配置管理，
 * 与本常量（CLI / 部署层）互相独立，互不引用。
 */

/** 产品中文名（用户可见展示名：CLI 横幅、服务描述、监控标题等） */
const PRODUCT_NAME = '梦想网页CAD实时协同平台';

/** 产品英文展示名（用户可见，与逻辑标识 PRODUCT_NAME_EN 相互独立） */
const PRODUCT_NAME_EN_DISPLAY = 'MxCloudCAD';

/** 产品英文标识（逻辑标识，禁止修改） */
const PRODUCT_NAME_EN = 'CloudCAD';

module.exports = { PRODUCT_NAME, PRODUCT_NAME_EN, PRODUCT_NAME_EN_DISPLAY };
