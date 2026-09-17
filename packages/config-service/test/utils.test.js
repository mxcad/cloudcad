'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');

const { parseMultipart } = require('../lib/utils');

// 1x1 透明 PNG，正文含大量 >0x7F 字节，用来证明二进制偏移不能按 utf8 处理
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

// 覆盖 0x00..0xFF 全字节域，任何编码误判都会立刻改变结果
function denseBuffer(size) {
  const buf = Buffer.alloc(size);
  for (let i = 0; i < size; i += 1) buf[i] = i & 0xff;
  return buf;
}

const BOUNDARY = '----WebKitFormBoundary7MA4YWxkTrZu0gW';

// parseMultipart 只消费 req.headers / data / end / error，内存流即可完整覆盖
function requestOf(body, boundary = BOUNDARY) {
  const req = Readable.from([body]);
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };
  return req;
}

function buildMultipart(file, { crlf = '\r\n', field = 'logo', filename = 'logo.png', textFields = [] } = {}) {
  const segments = [];
  for (const name of textFields) {
    segments.push(
      Buffer.from(
        `--${BOUNDARY}${crlf}Content-Disposition: form-data; name="${name}"${crlf}${crlf}${name}-value${crlf}`,
        'latin1'
      )
    );
  }
  segments.push(
    Buffer.from(
      `--${BOUNDARY}${crlf}Content-Disposition: form-data; name="${field}"; filename="${filename}"${crlf}Content-Type: image/png${crlf}${crlf}`,
      'latin1'
    )
  );
  segments.push(file);
  segments.push(Buffer.from(`${crlf}--${BOUNDARY}--${crlf}`, 'latin1'));
  return Buffer.concat(segments);
}

describe('parseMultipart（Logo 上传解析）', () => {
  it('解析真实 PNG 并逐字节保真', async () => {
    const { file, error } = await parseMultipart(requestOf(buildMultipart(PNG_1x1)));

    assert.equal(error, undefined);
    assert.equal(file.fieldname, 'logo');
    assert.equal(file.filename, 'logo.png');
    assert.equal(file.contentType, 'image/png');
    assert.deepEqual(file.buffer, PNG_1x1);
    assert.deepEqual(file.buffer.subarray(0, 4), PNG_MAGIC);
  });

  it('全字节域内容不会因编码往返错位', async () => {
    const payload = denseBuffer(4096);
    const { file, error } = await parseMultipart(requestOf(buildMultipart(payload)));

    assert.equal(error, undefined);
    assert.deepEqual(file.buffer, payload);
  });

  it('正文里出现 Content-Disposition 片段时仍切出完整文件', async () => {
    const payload = Buffer.concat([
      Buffer.from('Content-Disposition: form-data; name="x"', 'latin1'),
      PNG_1x1,
    ]);
    const { file, error } = await parseMultipart(requestOf(buildMultipart(payload)));

    assert.equal(error, undefined);
    assert.deepEqual(file.buffer, payload);
  });

  it('文本字段在前、文件字段在后也能找到文件', async () => {
    const { file, error } = await parseMultipart(
      requestOf(buildMultipart(PNG_1x1, { textFields: ['title', 'tagline'] }))
    );

    assert.equal(error, undefined);
    assert.equal(file.fieldname, 'logo');
    assert.deepEqual(file.buffer, PNG_1x1);
  });

  it('仅 LF 行分隔（无 CR）也能解析', async () => {
    const { file, error } = await parseMultipart(
      requestOf(buildMultipart(PNG_1x1, { crlf: '\n' }))
    );

    assert.equal(error, undefined);
    assert.deepEqual(file.buffer, PNG_1x1);
  });

  it('缺少 header/body 分隔符的畸形 part 被跳过', async () => {
    const body = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="logo"; filename="a.png"\r\n${PNG_1x1.toString('latin1')}\r\n--${BOUNDARY}--\r\n`,
      'latin1'
    );

    const { file, error } = await parseMultipart(requestOf(body));

    assert.equal(file, undefined);
    assert.equal(error, '未找到文件');
  });

  it('只有文本字段时返回未找到文件', async () => {
    const body = Buffer.from(
      `--${BOUNDARY}\r\nContent-Disposition: form-data; name="title"\r\n\r\nCloudCAD\r\n--${BOUNDARY}--\r\n`,
      'latin1'
    );

    const { file, error } = await parseMultipart(requestOf(body));

    assert.equal(file, undefined);
    assert.equal(error, '未找到文件');
  });

  it('Content-Type 缺失时回落到 application/octet-stream', async () => {
    const boundary = '----customBoundary';
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="logo"; filename="a.png"\r\n\r\n`,
        'latin1'
      ),
      PNG_1x1,
      Buffer.from(`\r\n--${boundary}--\r\n`, 'latin1'),
    ]);

    const { file, error } = await parseMultipart(requestOf(body, boundary));

    assert.equal(error, undefined);
    assert.equal(file.contentType, 'application/octet-stream');
    assert.deepEqual(file.buffer, PNG_1x1);
  });

  it('带引号的 boundary 也能解析', async () => {
    const body = buildMultipart(PNG_1x1);
    const req = Readable.from([body]);
    req.headers = {
      'content-type': `multipart/form-data; boundary="${BOUNDARY}"`,
    };

    const { file, error } = await parseMultipart(req);

    assert.equal(error, undefined);
    assert.deepEqual(file.buffer, PNG_1x1);
  });

  it('缺 boundary 时返回解析错误', async () => {
    const req = Readable.from([Buffer.from('x', 'latin1')]);
    req.headers = { 'content-type': 'multipart/form-data' };

    const { file, error } = await parseMultipart(req);

    assert.equal(file, undefined);
    assert.equal(error, '无法解析 multipart boundary');
  });
});
