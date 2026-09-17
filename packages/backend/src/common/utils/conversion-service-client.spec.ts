///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import * as http from 'http';
import { AddressInfo } from 'net';
import { ConversionServiceClient } from './conversion-service-client';

describe('ConversionServiceClient', () => {
  let server: http.Server;
  let client: ConversionServiceClient;
  let requests: Array<{
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
  }> = [];

  const startServer = async (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<void> => {
    server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      timeoutMs: 2000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': 'secret',
      },
    });
  };

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  const drainBody = async (req: http.IncomingMessage): Promise<string> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return Buffer.concat(chunks).toString('utf8');
  };

  it('should POST an object body as JSON with Content-Length and parse the response', async () => {
    requests = [];
    await startServer(async (req, res) => {
      requests.push({
        method: req.method || '',
        url: req.url || '',
        headers: req.headers,
        body: await drainBody(req),
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ taskId: 't-1' }));
    });

    const result = await client.request<{ taskId: string }>(
      '/v1/conversions/batchConvert',
      'POST',
      { tasks: [{ id: 'a:pdf' }] }
    );

    expect(result).toEqual({ taskId: 't-1' });
    expect(requests).toHaveLength(1);
    const sent = requests[0];
    expect(sent.method).toBe('POST');
    expect(sent.url).toBe('/v1/conversions/batchConvert');
    expect(sent.headers['content-type']).toEqual('application/json');
    expect(Number(sent.headers['content-length'])).toBe(
      Buffer.byteLength(JSON.stringify({ tasks: [{ id: 'a:pdf' }] }))
    );
    expect(JSON.parse(sent.body)).toEqual({ tasks: [{ id: 'a:pdf' }] });
  });

  it('should preserve the query string on the outbound path', async () => {
    requests = [];
    await startServer((req, res) => {
      requests.push({
        method: req.method || '',
        url: req.url || '',
        headers: req.headers,
        body: '',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ tasks: [], total: 0 }));
    });

    await client.request('/v1/conversions/tasks?status=failed', 'GET');

    // 只取 url.pathname 会丢掉 query——监控的 status 过滤此前因此从未到达服务侧
    expect(requests[0].url).toBe('/v1/conversions/tasks?status=failed');
  });

  it('should forward configured headers and merge per-request extras', async () => {
    requests = [];
    await startServer((req, res) => {
      requests.push({
        method: req.method || '',
        url: req.url || '',
        headers: req.headers,
        body: '',
      });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({}));
    });

    await client.request('/v1/conversions/stats', 'GET', undefined, {
      'X-Request-Id': 'req-1',
      'X-Internal-Secret': 'override',
    });

    const sent = requests[0];
    expect(sent.headers['x-internal-secret']).toEqual('override');
    expect(sent.headers['x-request-id']).toEqual('req-1');
  });

  it('should reject on 4xx with the status and a body snippet', async () => {
    await startServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"not found"}');
    });

    await expect(
      client.request('/v1/conversions/tasks/missing', 'GET')
    ).rejects.toThrow(/HTTP 404 for GET \/v1\/conversions\/tasks\/missing/);
  });

  it('should reject when the response is not JSON', async () => {
    await startServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>oops</html>');
    });

    await expect(
      client.request('/v1/conversions/stats', 'GET')
    ).rejects.toThrow(/Invalid JSON response from \/v1\/conversions\/stats/);
  });

  it('should reject on timeout', async () => {
    await startServer(() => {
      // 不响应，让客户端超时
    });
    client = new ConversionServiceClient({
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
      timeoutMs: 30,
    });

    await expect(
      client.request('/v1/conversions/stats', 'GET')
    ).rejects.toThrow(/Request timeout: GET \/v1\/conversions\/stats/);
  });
});
