const fs = require('fs');
const path = require('path');
const { FILES_DATA_PATH } = require('../lib/constants');
const { log } = require('../lib/utils');
const LruCache = require('./lru-cache');

/**
 * 文件读写处理器
 * 使用 LRU 缓存加速热文件读取
 */
class FileHandler {
  constructor() {
    this.cache = new LruCache();
  }

  _resolvePath(filePath) {
    const cleaned = filePath.replace(/\.\./g, '_').replace(/~/g, '_');
    const absolute = path.resolve(FILES_DATA_PATH, cleaned);
    if (!absolute.startsWith(path.resolve(FILES_DATA_PATH))) {
      throw new Error('Path traversal detected');
    }
    return absolute;
  }

  async read(filePath) {
    const absolute = this._resolvePath(filePath);
    const cached = this.cache.get(absolute);
    if (cached) {
      log(`[FileHandler] 缓存命中: ${filePath}`);
      return cached;
    }
    const data = await fs.promises.readFile(absolute);
    this.cache.set(absolute, data);
    log(`[FileHandler] 读取文件: ${filePath} (${data.length} bytes)`);
    return data;
  }

  readStream(filePath) {
    const absolute = this._resolvePath(filePath);
    return fs.createReadStream(absolute);
  }

  async write(filePath, data) {
    const absolute = this._resolvePath(filePath);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    await fs.promises.writeFile(absolute, data);
    this.cache.set(absolute, data);
    log(`[FileHandler] 写入文件: ${filePath} (${data.length} bytes)`);
  }

  async writeStream(filePath, stream) {
    const absolute = this._resolvePath(filePath);
    await fs.promises.mkdir(path.dirname(absolute), { recursive: true });
    const writeStream = fs.createWriteStream(absolute);
    await new Promise((resolve, reject) => {
      stream.pipe(writeStream);
      stream.on('end', resolve);
      stream.on('error', reject);
      writeStream.on('error', reject);
    });
    this.cache.delete(absolute);
    log(`[FileHandler] 流写入: ${filePath}`);
  }

  async delete(filePath) {
    const absolute = this._resolvePath(filePath);
    this.cache.delete(absolute);
    await fs.promises.unlink(absolute);
    log(`[FileHandler] 删除文件: ${filePath}`);
  }

  async exists(filePath) {
    const absolute = this._resolvePath(filePath);
    try {
      await fs.promises.access(absolute, fs.constants.F_OK);
      return true;
    } catch { return false; }
  }

  getCacheStats() {
    return this.cache.getStats();
  }

  clearCache() {
    this.cache.clear();
    log('[FileHandler] 缓存已清空');
  }
}

module.exports = FileHandler;
