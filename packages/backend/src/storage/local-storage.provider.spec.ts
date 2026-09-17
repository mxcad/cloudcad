import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BadRequestException } from '@nestjs/common';
import { LocalStorageProvider } from './local-storage.provider';

/**
 * LocalStorageProvider 路径包含性回归测试。
 *
 * validatePath 的包含性判定必须带 path.sep 后缀：key='.' 解析为 basePath 本身时
 * 裸 startsWith 会放行（现收紧为必须严格位于其内）；后缀比较同时防 basePath 的
 * 同名前缀兄弟目录在 resolve 语义变化时被误判为内部。
 * 实际越界（.. / 绝对路径 / 盘符相对路径）已由前置校验 + Node path.resolve 语义
 * 挡住，本组测试钉住各向量下「解析结果恒在 basePath 内或拒绝」的不变量。
 */
describe('LocalStorageProvider 路径包含性', () => {
  let tmpBase: string;
  let basePath: string;
  let provider: LocalStorageProvider;

  const createProvider = (base: string) => {
    const configService = {
      get: jest.fn((key: string) => (key === 'filesDataPath' ? base : undefined)),
    };
    return new LocalStorageProvider(configService as never);
  };

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'local-storage-spec-'));
    basePath = path.join(tmpBase, 'files');
    provider = createProvider(basePath);
  });

  afterEach(() => {
    fs.rmSync(tmpBase, { recursive: true, force: true });
  });

  it('正常相对路径：解析在 basePath 内', () => {
    const resolved = provider.getAbsolutePath('202509/node-1/a.dwg');
    expect(resolved.startsWith(path.resolve(basePath) + path.sep)).toBe(true);
  });

  it('.. 路径：拒绝', () => {
    expect(() => provider.getAbsolutePath('../files-evil/a.dwg')).toThrow(
      BadRequestException
    );
  });

  it('绝对路径（非 /mxcad/file/ 例外）：拒绝', () => {
    expect(() => provider.getAbsolutePath('/etc/passwd')).toThrow(
      BadRequestException
    );
  });

  it('key=. 解析为 basePath 本身：拒绝（必须严格位于其内）', () => {
    expect(() => provider.getAbsolutePath('.')).toThrow(BadRequestException);
  });

  it('Windows：盘符相对路径（C:x/…）不越出 basePath', () => {
    if (process.platform !== 'win32') return; // 仅 Windows 有意义
    const base = path.resolve(basePath);
    if (!/^[a-zA-Z]:/.test(base)) return;
    // 盘符相对形式：C:\x → C:x（isAbsolute 判为相对路径）。
    // Node 的 path.resolve 将其按相对段拼在 basePath 下（不会跳到盘符根），
    // 故必须仍解析在 basePath 内
    const driveRelative = base.replace(/^([a-zA-Z]):\\/, '$1:').replace(/\\/g, '/');
    const resolved = provider.getAbsolutePath(`${driveRelative}/x.dwg`);
    expect(resolved.startsWith(base + path.sep)).toBe(true);
  });
});
