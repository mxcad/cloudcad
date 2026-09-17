import net from 'net';

/**
 * 最小 RESP2 客户端（0 外部依赖）
 * 仅实现本服务需要的命令子集与回复类型:
 *   simple string (+), error (-), integer (:), bulk string ($), array (*)
 */
export class RedisError extends Error {}

// RESP 回复值是多态的（字符串/整数/Buffer/错误/数组/null），此处以 any 表达动态边界
type RespValue = string | number | Buffer | RedisError | null | RespValue[];

interface PendingEntry {
  resolve: (value: RespValue) => void;
  reject: (reason: RedisError | Error) => void;
  _timer?: ReturnType<typeof setTimeout>;
}

interface RedisClientOptions {
  commandTimeoutMs?: number;
  // 自动重连（S3-1）：瞬时断连后指数退避重连。默认 true。
  autoReconnect?: boolean;
  // 重连退避初始延迟（毫秒），默认 1000
  reconnectBaseDelayMs?: number;
  // 重连退避上限（毫秒），默认 30000
  reconnectMaxDelayMs?: number;
}

function encodeCommand(args: (string | Buffer)[]): Buffer {
  const chunks: Uint8Array[] = [Buffer.from(`*${args.length}\r\n`)];
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
  data: Buffer;
  pos: number;

  constructor() {
    this.data = Buffer.alloc(0);
    this.pos = 0;
  }

  push(chunk: Buffer): void {
    if (this.pos > 0) {
      this.data = this.data.subarray(this.pos);
      this.pos = 0;
    }
    this.data = Buffer.concat([this.data, chunk]);
  }

  tryParse(): { value: RespValue } | null {
    const result = this._parseValue(this.data, this.pos);
    if (result === null) return null;
    this.pos = result.next;
    return { value: result.value };
  }

  _parseValue(buf: Buffer, offset: number): { value: RespValue; next: number } | null {
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
      const items: RespValue[] = [];
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

  _readLine(buf: Buffer, from: number): { data: Buffer; end: number } | null {
    const idx = buf.indexOf('\r\n', from);
    if (idx === -1) return null;
    return { data: buf.subarray(from, idx), end: idx };
  }
}

/**
 * 串行命令客户端。连接后按 FIFO 逐条发送命令并配对回复。
 */
class RedisClient {
  url: string;
  options: RedisClientOptions;
  socket: net.Socket | null;
  parser: RespParser;
  _pending: PendingEntry[];
  _connected: boolean;
  // 自动重连（S3-1）：显式 close() 后置 _closed 停止重连；瞬时断连则退避重连
  private _closed: boolean;
  private _autoReconnect: boolean;
  private _baseDelayMs: number;
  private _maxDelayMs: number;
  private _nextDelayMs: number;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null;

  constructor(url: string, options: RedisClientOptions = {}) {
    this.url = url;
    this.options = options;
    this.socket = null;
    this.parser = new RespParser();
    this._pending = [];
    this._connected = false;
    this._closed = false;
    this._autoReconnect = options.autoReconnect !== false;
    this._baseDelayMs = options.reconnectBaseDelayMs ?? 1000;
    this._maxDelayMs = options.reconnectMaxDelayMs ?? 30000;
    this._nextDelayMs = this._baseDelayMs;
    this._reconnectTimer = null;
  }

  connect(timeoutMs = 3000): Promise<RedisClient> {
    if (this._closed) return Promise.reject(new RedisError('Redis 客户端已关闭'));
    if (this._connected) return Promise.resolve(this);
    return new Promise<RedisClient>((resolve, reject) => {
      let parsed: URL;
      try {
        parsed = new URL(this.url);
      } catch (err) {
        return reject(new RedisError(`无效的 REDIS_URL: ${this.url}`));
      }
      const port = parseInt(parsed.port || '6379', 10);
      const host = parsed.hostname || '127.0.0.1';
      const db = parseInt((parsed.pathname || '/0').replace(/^\//, '') || '0', 10);
      // URL 密码（redis://:pass@host / redis://user:pass@host）。requirepass 的 Redis
      // 未认证即回 -NOAUTH，故 PING 前须先 AUTH——缺它则本最小客户端永远连不上带密码的 Redis。
      const username = parsed.username || '';
      const password = parsed.password || '';

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
        // 重连后旧 socket 的事件：已被新连接取代（this.socket 已指向新 socket）则忽略
        if (this.socket !== socket) return;
        this._connected = false;
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        } else {
          this._rejectPending(err);
          this._scheduleReconnect();
        }
      });

      socket.on('close', () => {
        if (this.socket !== socket) return;
        this._connected = false;
        this._rejectPending(new RedisError('Redis 连接已关闭'));
        this._scheduleReconnect();
      });

      socket.on('connect', async () => {
        try {
          if (password) {
            await this._command(username ? ['AUTH', username, password] : ['AUTH', password]);
          }
          await this._command(['PING']);
          if (db > 0) await this._command(['SELECT', String(db)]);
          this._connected = true;
          this._nextDelayMs = this._baseDelayMs; // 连接成功重置退避
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

  command(args: (string | Buffer)[]): Promise<RespValue> {
    if (!this.socket || !this._connected) {
      return Promise.reject(new RedisError('Redis 未连接'));
    }
    return this._command(args);
  }

  _command(args: (string | Buffer)[]): Promise<RespValue> {
    return new Promise<RespValue>((resolve, reject) => {
      const entry: PendingEntry = { resolve, reject };
      this._pending.push(entry);
      if (this.options.commandTimeoutMs) {
        entry._timer = setTimeout(() => {
          const idx = this._pending.indexOf(entry);
          if (idx !== -1) this._pending.splice(idx, 1);
          reject(new RedisError(`Redis 命令超时: ${String(args[0])}`));
        }, this.options.commandTimeoutMs);
      }
      this.socket!.write(encodeCommand(args));
    });
  }

  _rejectPending(err: RedisError | Error): void {
    while (this._pending.length) {
      const entry = this._pending.shift()!;
      if (entry._timer) clearTimeout(entry._timer);
      entry.reject(err);
    }
  }

  // 当前是否已连接（S3-1）
  isConnected(): boolean {
    return this._connected;
  }

  // 瞬时断连后调度指数退避重连（S3-1）：已有重连计划则不重复调度；
  // 定时器 unref 不阻止进程优雅退出
  private _scheduleReconnect(): void {
    if (this._closed || !this._autoReconnect) return;
    if (this._reconnectTimer) return;
    const delay = this._nextDelayMs;
    this._nextDelayMs = Math.min(this._nextDelayMs * 2, this._maxDelayMs);
    this._reconnectTimer = setTimeout(() => {
      this._reconnectTimer = null;
      this._reconnectAttempt();
    }, delay);
    (this._reconnectTimer as { unref?: () => void }).unref?.();
  }

  private async _reconnectAttempt(): Promise<void> {
    if (this._closed) return;
    try {
      await this.connect();
      this._nextDelayMs = this._baseDelayMs;
    } catch {
      // 重连失败：下一次尝试由 socket 的 close/error 处理器再调度
    }
  }

  close(): void {
    this._closed = true;
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this.socket) {
      const socket = this.socket;
      this.socket = null;
      this._connected = false;
      this._rejectPending(new RedisError('Redis 客户端已关闭'));
      socket.end();
    }
  }
}

export default RedisClient;
