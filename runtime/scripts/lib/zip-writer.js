/**
 * @fileoverview 零依赖 ZIP 打包器（deflate 压缩）
 *
 * 为什么不用 tar / 系统 zip 命令：部署包在目标机离线运行，不能假设目标机
 * 存在 zip / tar 可执行文件（老系统 Windows 无 bsdtar、精简 Linux 无 zip）。
 * Node 内置 zlib 提供 deflateRaw，ZIP 格式本身只是头信息拼装，因此纯 Node
 * 即可产出标准 ZIP（Windows 资源管理器 / unzip 均可直接打开）。
 *
 * 只实现 ZIP32（条目/体积上限 4GB）：日志打包场景到不了，真到上限时明确
 * 报错让用户分时段打包（--days N），不做 ZIP64。
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// CRC32 查表（ZIP 规范：IEEE 802.3 多项式 0xEDB88320）
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * 转 DOS 本地时间（ZIP 头时间戳，2 秒精度）。ZIP32 只能表达 1980 年起，
 * mtime 异常（0 / 过早）一律钳到 1980-01-01。
 */
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    (Math.floor(date.getSeconds() / 2) & 0x1f);
  const dosDate =
    (((year - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0xf) << 5) |
    (date.getDate() & 0x1f);
  return { time, date: dosDate };
}

/**
 * 生成 ZIP 文件。
 * @param {Array<{name: string, data: Buffer, mtime?: Date}>} entries
 *   name 为 zip 内路径，统一转正斜杠；data 为文件完整内容。
 * @param {string} outPath 输出 zip 绝对路径
 * @returns {{count: number, zipSize: number}}
 */
function createZip(entries, outPath) {
  if (!entries.length) {
    throw new Error('zip-writer: entries 为空，拒绝生成空 zip');
  }

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = String(entry.name).replace(/\\/g, '/');
    const nameBuf = Buffer.from(name, 'utf8');
    if (!nameBuf.length) {
      throw new Error(`zip-writer: 条目名为空（offset=${offset}）`);
    }
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data);
    if (data.length > 0xffffffff) {
      throw new Error(`zip-writer: 条目 ${name} 超过 ZIP32 上限（4GB），请分时段打包`);
    }

    const crc = crc32(data);
    const compressed = zlib.deflateRawSync(data);
    if (compressed.length > 0xffffffff) {
      throw new Error(`zip-writer: 条目 ${name} 压缩后超过 ZIP32 上限，请分时段打包`);
    }
    const { time, date } = dosDateTime(entry.mtime || new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract
    local.writeUInt16LE(0x0800, 6); // flags: bit11 UTF-8 文件名
    local.writeUInt16LE(8, 8); // method 8 = deflate
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra field length

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed
    central.writeUInt16LE(0x0800, 8); // flags
    central.writeUInt16LE(8, 10); // method
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra length
    central.writeUInt16LE(0, 32); // comment length
    central.writeUInt16LE(0, 34); // disk number start
    central.writeUInt16LE(0, 36); // internal attributes
    central.writeUInt32LE(0, 38); // external attributes
    central.writeUInt32LE(offset, 42); // local header offset

    localParts.push(local, nameBuf, compressed);
    centralParts.push(central, nameBuf);
    offset += 30 + nameBuf.length + compressed.length;
  }

  const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0);
  if (offset > 0xffffffff || centralSize > 0xffffffff) {
    throw new Error('zip-writer: 总体积超过 ZIP32 上限（4GB），请分时段打包');
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // central directory disk
  eocd.writeUInt16LE(entries.length, 8); // 本盘条目数
  eocd.writeUInt16LE(entries.length, 10); // 总条目数
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16); // central directory 起始偏移
  eocd.writeUInt16LE(0, 20); // comment length

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.concat([...localParts, ...centralParts, eocd]));
  return { count: entries.length, zipSize: fs.statSync(outPath).size };
}

module.exports = {
  createZip,
  crc32,
};
