const fs = require('fs');
const { ROUTING_TABLE_PATH, FILES_DATA_PATH } = require('../lib/constants');
const { log } = require('../lib/utils');

/**
 * 目录组 → 存储节点路由层
 *
 * 路由表格式 (JSON):
 * {
 *   "groups": [
 *     { "prefix": "202607", "node": "node1", "basePath": "/mnt/storage1/filesData" },
 *     { "prefix": "202608", "node": "node2", "basePath": "/mnt/storage2/filesData" }
 *   ],
 *   "defaultBasePath": "/home/user/filesData"
 * }
 *
 * 现状（单节点部署）：路由表仅被加载并供 /health 的 nodes 字段上报（getNodes）；
 * 文件读写（FileHandler）仍走固定 FILES_DATA_PATH，未按 prefix 转发到不同节点——
 * ADR-0015 的多节点路由尚未接线。单节点部署无路由表，行为正确；要启用多节点，
 * 需在 FileHandler 侧实现 prefix→节点的解析与转发（本类目前只提供表加载与上报）。
 */
class StorageRouter {
  constructor() {
    this.groups = [];
    this.defaultBasePath = FILES_DATA_PATH;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(ROUTING_TABLE_PATH)) {
        const raw = fs.readFileSync(ROUTING_TABLE_PATH, 'utf-8');
        const config = JSON.parse(raw);
        this.groups = config.groups || [];
        this.defaultBasePath = config.defaultBasePath || FILES_DATA_PATH;
        log(`[StorageRouter] 加载路由表: ${this.groups.length} 个节点组`);
      } else {
        log(`[StorageRouter] 无路由表文件, 使用默认路径: ${FILES_DATA_PATH}`);
      }
    } catch (err) {
      log(`[StorageRouter] 加载路由表失败: ${err.message}, 使用默认路径`);
    }
  }

  getNodes() {
    return this.groups.map(g => ({ prefix: g.prefix, node: g.node }));
  }
}

module.exports = StorageRouter;
