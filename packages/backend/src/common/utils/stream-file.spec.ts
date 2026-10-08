import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PassThrough } from 'stream';
import { streamFileToResponse } from './stream-file';

// 仅替换 createReadStream 为可控 mock，其余 fs 能力保持真实
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  createReadStream: jest.fn(),
}));

const realCreateReadStream = jest.requireActual('fs').createReadStream;

describe('streamFileToResponse', () => {
  let tmpFile: string;
  let res: any;

  beforeEach(() => {
    jest.clearAllMocks();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-file-'));
    tmpFile = path.join(dir, 'a.zip');
    fs.writeFileSync(tmpFile, 'hello zip');
    res = Object.assign(new PassThrough(), {
      headersSent: false,
      setHeader: jest.fn(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    });
    (fs.createReadStream as jest.Mock).mockImplementation(
      (p: string) => realCreateReadStream(p)
    );
  });

  afterEach(() => {
    fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
  });

  it('sets content headers and pipes the file to the response', async () => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));

    await streamFileToResponse(res, tmpFile, 'a.zip', 'application/zip');

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/zip');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Length', '9');
    const cd = res.setHeader.mock.calls.find((c) => c[0] === 'Content-Disposition');
    expect(cd?.[1]).toContain('filename="a.zip"');
    expect(Buffer.concat(chunks).toString()).toBe('hello zip');
  });

  it('calls onDone when the stream closes', async () => {
    const onDone = jest.fn();
    await streamFileToResponse(res, tmpFile, 'a.zip', 'application/zip', onDone);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('responds 500 on read error before headers are sent', async () => {
    const bad = new PassThrough();
    (fs.createReadStream as jest.Mock).mockReturnValue(bad);

    const p = streamFileToResponse(res, tmpFile, 'a.zip');
    bad.emit('error', new Error('read fail'));
    bad.emit('close');
    await p;

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({ message: 'File read failed' });
  });

  it('rejects when the file is missing (statSync throws)', async () => {
    const missing = path.join(path.dirname(tmpFile), 'missing.zip');
    await expect(streamFileToResponse(res, missing, 'x.zip')).rejects.toThrow();
  });
});
