'use strict';

const net = require('net');

// 解析客户端发送的 RESP 命令（array of bulk strings）
function parseCommand(buf) {
  if (buf.length === 0 || buf[0] !== 42) return null;
  const nl = buf.indexOf('\r\n');
  if (nl === -1) return null;
  const count = parseInt(buf.subarray(1, nl).toString('utf8'), 10);
  let pos = nl + 2;
  const args = [];
  for (let i = 0; i < count; i++) {
    if (pos >= buf.length || buf[pos] !== 36) return null;
    const nl2 = buf.indexOf('\r\n', pos);
    if (nl2 === -1) return null;
    const len = parseInt(buf.subarray(pos + 1, nl2).toString('utf8'), 10);
    const start = nl2 + 2;
    if (buf.length < start + len + 2) return null;
    args.push(buf.subarray(start, start + len));
    pos = start + len + 2;
  }
  return { args, consumed: pos };
}

function bulk(value) {
  const b = Buffer.from(value);
  return Buffer.concat([Buffer.from(`$${b.length}\r\n`), b, Buffer.from('\r\n')]);
}

function simple(str) {
  return Buffer.from(`+${str}\r\n`);
}

function integer(n) {
  return Buffer.from(`:${n}\r\n`);
}

function arrayReply(items) {
  const parts = [Buffer.from(`*${items.length}\r\n`)];
  for (const it of items) parts.push(bulk(it));
  return Buffer.concat(parts);
}

function nullBulk() {
  return Buffer.from('$-1\r\n');
}

/**
 * 内存版 mock Redis 服务。
 * options.chunkSize: 回复按该字节数分片发送（模拟 TCP 分片）。
 * options.custom(args): 自定义处理器，返回 Buffer 则覆盖默认行为。
 */
function startMockRedis(options = {}) {
  const state = {
    hash: new Map(),
    commands: [],
    chunkSize: options.chunkSize || 0,
  };

  function handleCommand(args) {
    if (options.custom) {
      const custom = options.custom(args);
      if (custom !== null) return custom;
    }
    const cmd = args[0].toString().toUpperCase();
    state.commands.push(args.map((a) => a.toString()));
    if (cmd === 'PING') return simple('PONG');
    if (cmd === 'SELECT') return simple('OK');
    if (cmd === 'HSET') {
      const key = args[1].toString();
      const field = args[2].toString();
      const value = args[3].toString();
      let h = state.hash.get(key);
      if (!h) {
        h = new Map();
        state.hash.set(key, h);
      }
      h.set(field, value);
      return integer(1);
    }
    if (cmd === 'HGET') {
      const h = state.hash.get(args[1].toString());
      const v = h && h.get(args[2].toString());
      return v === undefined ? nullBulk() : bulk(v);
    }
    if (cmd === 'HGETALL') {
      const h = state.hash.get(args[1].toString());
      if (!h || h.size === 0) return Buffer.from('*0\r\n');
      const items = [];
      for (const [k, v] of h.entries()) items.push(k, v);
      return arrayReply(items);
    }
    if (cmd === 'HDEL') {
      const h = state.hash.get(args[1].toString());
      const existed = h ? h.delete(args[2].toString()) : false;
      if (h && h.size === 0) state.hash.delete(args[1].toString());
      return integer(existed ? 1 : 0);
    }
    return simple('OK');
  }

  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const parsed = parseCommand(buffer);
        if (!parsed) break;
        buffer = buffer.subarray(parsed.consumed);
        const reply = handleCommand(parsed.args);
        if (state.chunkSize > 0) {
          for (let i = 0; i < reply.length; i += state.chunkSize) {
            socket.write(reply.subarray(i, i + state.chunkSize));
          }
        } else {
          socket.write(reply);
        }
      }
    });
  });

  return new Promise((resolve) => {
    server.listen(0, () => resolve({ server, state, port: server.address().port }));
  });
}

module.exports = { startMockRedis, parseCommand, bulk, simple, integer, arrayReply, nullBulk };
