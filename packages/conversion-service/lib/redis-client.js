const net = require('net');

/**
 * 最小 RESP2 客户端（0 外部依赖）
 * 仅实现本服务需要的命令子集与回复类型:
 *   simple string (+), error (-), integer (:), bulk string ($), array (*)
 */
class RedisError extends Error {}

function encodeCommand(args) {
  const chunks = [Buffer.from(`*${args.length}\r\n`)];
  for (const arg of args) {
    const b = Buffer.isBuffer(arg) ? arg : Buffer.from(String(arg));
    chunks.push(Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n'));
  }
  return Buffer.concat(chunks);
}

/**
 * 增量 RESP 解析器: push() 追加数据, tryParse() 尝试取出一个完整回复。
 * 数据不足返回 null; 可一次性消费缓冲区内多个连续回复。
 */
class RespParser {
  constructor() {
    this.data = Buffer.alloc(0);
    this.pos = 0;
  }

  push(chunk) {
    if (this.pos > 0) {
      this.data = this.data.subarray(this.pos);
      this.pos = 0;
    }
    this.data = Buffer.concat([this.data, chunk]);
  }

  tryParse() {
    const result = this._parseValue(this.data, this.pos);
    if (result === null) return null;
    this.pos = result.next;
    return { value: result.value };
  }

  _parseValue(buf, offset) {
    if (offset >= buf.length) return null;
    const first = buf[offset];
    if (first === 43) { // +
      const line = this._readLine(buf, offset + 1);
      if (line === null) return null;
      return { value: line.data.toString('utf8'), next: line.end + 2 };
    }
    if (first === 45) { // -
      const line = this._readLine(buf, offset + 1);
      if (line === null) return null;
      return { value: new RedisError(line.data.toString('utf8')), next: line.end + 2 };
    }
    if (first === 58) { // :
      const line = this._readLine(buf, offset + 1);
      if (line === null) return null;
      return { value: parseInt(line.data.toString('utf8'), 10), next: line.end + 2 };
    }
    if (first === 36) { // $
      const line = this._readLine(buf, offset + 1);
      if (line === null) return null;
      const len = parseInt(line.data.toString('utf8'), 10);
      if (len === -1) return { value: null, next: line.end + 2 };
      const start = line.end + 2;
      if (buf.length < start + len + 2) return null;
      return { value: buf.subarray(start, start + len), next: start + len + 2 };
    }
    if (first === 42) { // *
      const line = this._readLine(buf, offset + 1);
      if (line === null) return null;
      const count = parseInt(line.data.toString('utf8'), 10);
      if (count === -1) return { value: null, next: line.end + 2 };
      const items = [];
      let pos = line.end + 2;
      for (let i = 0; i < count; i++) {
        const item = this._parseValue(buf, pos);
        if (item === null) return null;
        items.push(item.value);
        pos = item.next;
      }
      return { value: items, next: pos };
    }
    throw new RedisError(`未知 RESP 类型字节: ${first}`);
  }

  _readLine(buf, from) {
    const idx = buf.indexOf('\r\n', from);
    if (idx === -1) return null;
    return { data: buf.subarray(from, idx), end: idx };
  }
}

/**
 * 串行命令客户端。连接后按 FIFO 逐条发送命令并配对回复。
 */
class RedisClient {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.socket = null;
    this.parser = new RespParser();
    this._pending = [];
    this._connected = false;
  }

  connect(timeoutMs = 3000) {
    if (this._connected) return Promise.resolve(this);
    return new Promise((resolve, reject) => {
      let parsed;
      try {
        parsed = new URL(this.url);
      } catch (err) {
        return reject(new RedisError(`无效的 REDIS_URL: ${this.url}`));
      }
      const port = parseInt(parsed.port || '6379', 10);
      const host = parsed.hostname || '127.0.0.1';
      const db = parseInt((parsed.pathname || '/0').replace(/^\//, '') || '0', 10);

      const socket = net.createConnection({ host, port });
      socket.setNoDelay(true);
      this.socket = socket;
      this.parser = new RespParser();

      let settled = false;
      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(new RedisError(`Redis 连接超时: ${host}:${port}`));
        }
      }, timeoutMs);

      socket.on('data', (chunk) => {
        this.parser.push(chunk);
        for (;;) {
          const reply = this.parser.tryParse();
          if (!reply) break;
          const entry = this._pending.shift();
          if (!entry) continue;
          if (entry._timer) clearTimeout(entry._timer);
          if (reply.value instanceof RedisError) entry.reject(reply.value);
          else entry.resolve(reply.value);
        }
      });

      socket.on('error', (err) => {
        this._connected = false;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        } else {
          this._rejectPending(err);
        }
      });

      socket.on('close', () => {
        this._connected = false;
        this._rejectPending(new RedisError('Redis 连接已关闭'));
      });

      socket.on('connect', async () => {
        try {
          await this._command(['PING']);
          if (db > 0) await this._command(['SELECT', String(db)]);
          this._connected = true;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            resolve(this);
          }
        } catch (err) {
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            socket.destroy();
            reject(err);
          }
        }
      });
    });
  }

  command(args) {
    if (!this.socket || !this._connected) {
      return Promise.reject(new RedisError('Redis 未连接'));
    }
    return this._command(args);
  }

  _command(args) {
    return new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      this._pending.push(entry);
      if (this.options.commandTimeoutMs) {
        entry._timer = setTimeout(() => {
          const idx = this._pending.indexOf(entry);
          if (idx !== -1) this._pending.splice(idx, 1);
          reject(new RedisError(`Redis 命令超时: ${String(args[0])}`));
        }, this.options.commandTimeoutMs);
      }
      this.socket.write(encodeCommand(args));
    });
  }

  _rejectPending(err) {
    while (this._pending.length) {
      const entry = this._pending.shift();
      if (entry._timer) clearTimeout(entry._timer);
      entry.reject(err);
    }
  }

  close() {
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      socket.end();
    }
  }
}

module.exports = RedisClient;
module.exports.RedisError = RedisError;
