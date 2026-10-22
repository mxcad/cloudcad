/**
 * L1 特征测试 —— runtime/scripts/lib/mxcad-probe.js 双向探针（docker/裸机共享脚本）
 *
 * 目的：锁定「dwg→mxweb + mxweb→dwg」双向探针行为：
 * - 引擎健康（code=0）两方向均 ok
 * - mxweb→dwg 崩溃（SIGSEGV → interpretEngineRun 判 killed）→ ok:false
 *   （线上 DWG 下载 SIGSEGV 的部署期回归：旧单方向探针抓不到该崩溃）
 * - 任一方向失败时 runBothProbes 报出失败方向（direction）
 * - mxweb→dwg 参数形状对齐生产 DWG 下载链路：convertFile 无 outpath、
 *   真实 fileHash、createPreloadingData:false
 *
 * 引擎执行层（engineExec）与参数翻译（contracts）均为注入依赖，测试传 mock，
 * 不起真实引擎进程。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

let probe;

beforeAll(() => {
  probe = require('../../../runtime/scripts/lib/mxcad-probe');
});

afterAll(() => {
  jest.resetModules();
});

const tmpRoots = [];

/** 建临时 mxcadDir（含假 1.dwg）+ outDir；withMxweb 时预置 outDir/probe.mxweb */
function makeDirs({ withMxweb = false, mxwebContent = 'fake-mxweb-bytes' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mxcad-probe-'));
  tmpRoots.push(root);
  const mxcadDir = path.join(root, 'mxcad');
  const outDir = path.join(root, 'out');
  fs.mkdirSync(mxcadDir, { recursive: true });
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(mxcadDir, '1.dwg'), 'fake-dwg-bytes');
  // 假引擎二进制：探针只查存在性（引擎执行走 mock），内容无意义
  fs.writeFileSync(path.join(mxcadDir, 'mxcadassembly'), '#!/bin/sh\n');
  if (withMxweb) {
    fs.writeFileSync(path.join(outDir, 'probe.mxweb'), mxwebContent);
  }
  return { root, mxcadDir, outDir, bin: path.join(mxcadDir, 'mxcadassembly') };
}

afterEach(() => {
  for (const root of tmpRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

/** 引擎执行层 + 参数翻译的 mock（注入依赖） */
function makeMocks() {
  const engineExec = {
    runMxcadAssembly: jest
      .fn()
      .mockResolvedValue({
        stdout: '{"code":0}',
        stderr: '',
        exitCode: 2123,
        signal: null,
        timedOut: false,
      }),
    interpretEngineRun: jest.fn(),
  };
  const contracts = { buildEngineParams: jest.fn((o) => o) };
  return { engineExec, contracts };
}

describe('runDwgToMxwebProbe（dwg→mxweb）', () => {
  test('code=0 → ok；参数为 binToMxweb 形状（带 outpath）', async () => {
    const { mxcadDir, outDir, bin } = makeDirs();
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({ ok: true, result: {} });

    const r = await probe.runDwgToMxwebProbe({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(true);
    expect(contracts.buildEngineParams).toHaveBeenCalledWith({
      srcPath: path.join(mxcadDir, '1.dwg'),
      outPath: outDir,
      outName: 'probe.mxweb',
      compression: true,
    });
  });

  test('SIGSEGV（killed）→ ok:false', async () => {
    const { mxcadDir, outDir, bin } = makeDirs();
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({
      ok: false,
      category: 'killed',
      signal: 'SIGSEGV',
    });

    const r = await probe.runDwgToMxwebProbe({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(false);
    expect(r.category).toBe('killed');
  });

  test('1.dwg 缺失 → probe-missing，不起引擎进程', async () => {
    const { root, mxcadDir, outDir, bin } = makeDirs();
    fs.rmSync(path.join(mxcadDir, '1.dwg'));
    const { engineExec, contracts } = makeMocks();

    const r = await probe.runDwgToMxwebProbe({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(false);
    expect(r.category).toBe('probe-missing');
    expect(engineExec.runMxcadAssembly).not.toHaveBeenCalled();
  });
});

describe('runMxwebToDwgProbe（mxweb→dwg）', () => {
  test('code=0 → ok；参数对齐生产（无 outpath、真实 fileHash、createPreloadingData:false）', async () => {
    const mxwebContent = 'mxweb-probe-content';
    const { mxcadDir, outDir, bin } = makeDirs({ withMxweb: true, mxwebContent });
    const mxwebFile = path.join(outDir, 'probe.mxweb');
    const expectedHash = crypto.createHash('md5').update(mxwebContent).digest('hex');
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({ ok: true, result: {} });

    const r = await probe.runMxwebToDwgProbe({
      engineExec,
      contracts,
      bin,
      mxcadDir,
      outDir,
      mxwebFile,
    });

    expect(r.ok).toBe(true);
    expect(contracts.buildEngineParams).toHaveBeenCalledWith({
      srcPath: mxwebFile,
      fileHash: expectedHash,
      outName: 'probe.dwg',
      createPreloadingData: false,
    });
  });

  test('SIGSEGV（killed）→ ok:false（线上 DWG 下载崩溃的部署期回归）', async () => {
    const { mxcadDir, outDir, bin } = makeDirs({ withMxweb: true });
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({
      ok: false,
      category: 'killed',
      signal: 'SIGSEGV',
    });

    const r = await probe.runMxwebToDwgProbe({
      engineExec,
      contracts,
      bin,
      mxcadDir,
      outDir,
      mxwebFile: path.join(outDir, 'probe.mxweb'),
    });

    expect(r.ok).toBe(false);
    expect(r.category).toBe('killed');
  });

  test('probe.mxweb 缺失 → probe-missing，不起引擎进程', async () => {
    const { mxcadDir, outDir, bin } = makeDirs();
    const { engineExec, contracts } = makeMocks();

    const r = await probe.runMxwebToDwgProbe({
      engineExec,
      contracts,
      bin,
      mxcadDir,
      outDir,
      mxwebFile: path.join(outDir, 'probe.mxweb'),
    });

    expect(r.ok).toBe(false);
    expect(r.category).toBe('probe-missing');
    expect(engineExec.runMxcadAssembly).not.toHaveBeenCalled();
  });
});

describe('runBothProbes（双向编排）', () => {
  test('两方向都成功 → ok，引擎进程起两次', async () => {
    const { mxcadDir, outDir, bin } = makeDirs({ withMxweb: true });
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({ ok: true, result: {} });

    const r = await probe.runBothProbes({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(true);
    expect(engineExec.runMxcadAssembly).toHaveBeenCalledTimes(2);
  });

  test('dwg→mxweb 失败 → direction=dwg→mxweb，不再进行第二方向', async () => {
    const { mxcadDir, outDir, bin } = makeDirs();
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun.mockReturnValue({
      ok: false,
      category: 'killed',
      signal: 'SIGSEGV',
    });

    const r = await probe.runBothProbes({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(false);
    expect(r.direction).toBe('dwg→mxweb');
    expect(engineExec.runMxcadAssembly).toHaveBeenCalledTimes(1);
  });

  test('mxweb→dwg 失败 → direction=mxweb→dwg', async () => {
    const { mxcadDir, outDir, bin } = makeDirs({ withMxweb: true });
    const { engineExec, contracts } = makeMocks();
    engineExec.interpretEngineRun
      .mockReturnValueOnce({ ok: true, result: {} })
      .mockReturnValueOnce({ ok: false, category: 'killed', signal: 'SIGSEGV' });

    const r = await probe.runBothProbes({ engineExec, contracts, bin, mxcadDir, outDir });

    expect(r.ok).toBe(false);
    expect(r.direction).toBe('mxweb→dwg');
    expect(r.category).toBe('killed');
  });
});
