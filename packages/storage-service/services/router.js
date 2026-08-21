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
