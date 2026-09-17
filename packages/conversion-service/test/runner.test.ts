import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import type { ConversionRequest } from '@cloudcad/contracts';
import MxcadRunner, { ConversionExecutionError } from '../mxcad/runner';

describe('MxcadRunner._parseOutput', () => {
  it('should parse valid JSON output', () => {
    const parsed = new MxcadRunner()._parseOutput('some log\n{"code":0,"newpath":"/out/a.mxweb"}');
    assert.equal(parsed?.code, 0);
    assert.equal(parsed?.newpath, '/out/a.mxweb');
  });

  it('should extract JSON after leading log noise', () => {
    const parsed = new MxcadRunner()._parseOutput(
      'INFO: start\nWARN: skip\n{"code":1,"message":"boom"}'
    );
    assert.equal(parsed?.code, 1);
    assert.equal(parsed?.message, 'boom');
  });

  it('畸形输出返回 null（解析失败不再伪装成 code=1 的结果对象，否则失败性质会丢失）', () => {
    assert.equal(new MxcadRunner()._parseOutput('mxcad produced garbage output'), null);
  });

  it('截断 JSON 返回 null', () => {
    assert.equal(new MxcadRunner()._parseOutput('{"code":0,"newpath":'), null);
  });

  it('缺 code 字段的 JSON 返回 null（不能当成 code=undefined 的成功）', () => {
    assert.equal(new MxcadRunner()._parseOutput('{"newpath":"/out/a.mxweb"}'), null);
  });
});

describe('MxcadRunner._buildParam', () => {
  it('convertFile 形状（无 outpath）：srcpath + src_file_md5 + create_preloading_data + 可选参数', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({
      srcPath: '/in/a.dwg',
      fileHash: 'h1',
      createPreloadingData: true,
      outname: 'a.mxweb',
      cmd: 'to_mxweb',
      width: 2000,
      dwgVersion: 2018,
    });
    // 源路径 + 内容哈希 + 预加载（convertFile 专属）
    assert.equal(param.srcpath, '/in/a.dwg');
    assert.equal(param.src_file_md5, 'h1');
    assert.equal(param.create_preloading_data, true);
    // 可选参数透传
    assert.equal(param.outname, 'a.mxweb');
    assert.equal(param.cmd, 'to_mxweb');
    assert.equal(param.width, '2000'); // 数字转字符串
    assert.equal(param.dwg_version, 2018);
    // binToMxweb 专属键不应出现
    assert.ok(!('outpath' in param));
  });

  it('cut_dwg/print_to_pdf 区域/引用字段（bd_pt*/open_file_md5/create_clip_block）必须转发给引擎', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({
      srcPath: '/in/a.dwg',
      fileHash: 'h1',
      cmd: 'cut_dwg',
      bd_pt1_x: '1',
      bd_pt1_y: '2',
      bd_pt2_x: '3',
      bd_pt2_y: '4',
      open_file_md5: 'md5hash',
      create_clip_block: true,
    });
    // 721fe02 重构 serviceParam 时后端漏抄、_buildParam 也未转发的 6 个字段：
    // 丢失会致 cut_dwg/print_to_pdf 缺区域信息，引擎回 {"message":"false"}——锁定必须转发
    assert.equal(param.bd_pt1_x, '1');
    assert.equal(param.bd_pt1_y, '2');
    assert.equal(param.bd_pt2_x, '3');
    assert.equal(param.bd_pt2_y, '4');
    assert.equal(param.open_file_md5, 'md5hash');
    assert.equal(param.create_clip_block, true);
  });

  it('空字符串字符串字段省略、0/数值/false 保留（空值语义按字段合法域分流）', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({
      srcPath: '/in/a.dwg',
      fileHash: 'h1',
      cmd: 'print_to_pdf',
      // 字符串字段传 ''：不是合法值，须省略（转发 '' 会让引擎按「有值但空」处理回 "false"）
      layout_name: '',
      bd_pt1_x: '',
      bd_pt1_y: '',
      bd_pt2_x: '',
      bd_pt2_y: '',
      open_file_md5: '',
      // 数值字段传 0：0 是合法角度/版本，须保留
      roate_angle: 0,
      view_angle: 0,
      dwgVersion: 0,
      // 布尔字段传 false：false 是合法值（不创建裁剪块），须保留
      create_clip_block: false,
    });
    assert.ok(!('layout_name' in param));
    assert.ok(!('bd_pt1_x' in param));
    assert.ok(!('bd_pt1_y' in param));
    assert.ok(!('bd_pt2_x' in param));
    assert.ok(!('bd_pt2_y' in param));
    assert.ok(!('open_file_md5' in param));
    assert.equal(param.roate_angle, 0);
    assert.equal(param.view_angle, 0);
    assert.equal(param.dwg_version, 0);
    assert.equal(param.create_clip_block, false);
  });

  it('binToMxweb 形状（带 outpath）：srcpath + outpath + outname，无 src_file_md5', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({
      srcPath: '/bin/a.bin',
      outpath: '/out',
      outname: 'a.mxweb',
    });
    assert.equal(param.srcpath, '/bin/a.bin');
    assert.equal(param.outpath, '/out');
    assert.equal(param.outname, 'a.mxweb');
    // binToMxweb 不带 convertFile 的内容哈希/预加载键
    assert.ok(!('src_file_md5' in param));
    assert.ok(!('create_preloading_data' in param));
  });

  it('createPreloadingData 缺省视为 true（与 mxcadassembly 默认一致）', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({ srcPath: '/in/a.dwg', fileHash: 'h1' });
    assert.equal(param.create_preloading_data, true);
  });

  it('createPreloadingData=false 时透传 false', () => {
    const runner = new MxcadRunner();
    const param = runner._buildParam({ srcPath: '/in/a.dwg', fileHash: 'h1', createPreloadingData: false });
    assert.equal(param.create_preloading_data, false);
  });

  it('缺少 srcPath 时显式抛错（而非 .replace 崩溃）', () => {
    const runner = new MxcadRunner();
    // 契约上 srcPath 必填，但 HTTP 边界是松包（Record<string,unknown>），可能塞入缺 srcPath 的
    // 畸形对象——runner 须运行时兜底显式报错（而非 _resolvePath 返回 undefined 后 .replace 崩溃）。
    // 此处用 as 模拟该畸形输入，验证运行时防御。
    assert.throws(() => runner._buildParam({ fileHash: 'h1' } as ConversionRequest), /缺少 srcPath/);
  });
});

describe('MxcadRunner.execute 失败分类', () => {
  // 注入 fake runFn 控制 runMxcadAssembly 返回，验证失败分类（不依赖真实 exe）
  const spawnFailure = {
    stdout: '',
    stderr: 'spawn D:\\runtime\\windows\\mxcad\\mxcadassembly.exe ENOENT',
    exitCode: null,
    signal: null,
    timedOut: false,
  };

  it('spawn 失败（exitCode=null）→ category=not-started', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => spawnFailure;
    await assert.rejects(
      runner.execute({ srcPath: '/in/a.dwg', fileHash: 'h1' }, 60000, undefined, fakeRun),
      (err: unknown) =>
        err instanceof ConversionExecutionError &&
        /未正常启动/.test(err.message) &&
        err.category === 'not-started' &&
        err.transient === true
    );
  });

  it('超时且输出无法解析 → category=timeout', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => ({
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: true,
    });
    await assert.rejects(
      runner.execute({ srcPath: '/in/a.dwg', fileHash: 'h1' }, 60000, undefined, fakeRun),
      (err: unknown) =>
        err instanceof ConversionExecutionError &&
        /转换超时/.test(err.message) &&
        err.category === 'timeout' &&
        err.transient === true
    );
  });

  it('超时但 stdout 已含完整 {"code":0} → 救回为成功，不抛错（与 backend 进程内路径对称）', async () => {
    const runner = new MxcadRunner();
    // 引擎被超时掐在「已写完产物、未及退出」的状态：stdout 已有完整结果，
    // 救回失败即把一次成功判成 FAILED 并触发重试。
    const fakeRun = async () => ({
      stdout: '{"code":0,"message":"ok"}',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: true,
    });
    const result = await runner.execute(
      { srcPath: '/in/a.dwg', fileHash: 'h1', outname: 'a.pdf' },
      60000,
      undefined,
      fakeRun
    );
    assert.equal(result.code, 0);
    assert.equal(result.newpath, path.join('/in', 'a.pdf'));
  });

  it('超时救回也补齐 newpath（outpath+outname 形状）', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => ({
      stdout: '{"code":0,"message":"ok"}',
      stderr: '',
      exitCode: null,
      signal: null,
      timedOut: true,
    });
    const result = await runner.execute(
      { srcPath: '/bin/a.bin', outpath: '/out', outname: 'a.mxweb' },
      60000,
      undefined,
      fakeRun
    );
    assert.equal(result.code, 0);
    assert.equal(result.newpath, path.join('/out', 'a.mxweb'));
  });

  it('进程被信号终止 → category=killed（与 backend 一致：不救回输出）', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => ({
      stdout: '',
      stderr: '',
      exitCode: null,
      signal: 'SIGTERM',
      timedOut: false,
    });
    await assert.rejects(
      runner.execute({ srcPath: '/in/a.dwg', fileHash: 'h1' }, 60000, undefined, fakeRun),
      (err: unknown) =>
        err instanceof ConversionExecutionError &&
        err.category === 'killed' &&
        err.transient === true
    );
  });

  it('引擎输出无法解析 → category=output-unparseable', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => ({
      stdout: 'garbage without result json',
      stderr: '',
      exitCode: 2123,
      signal: null,
      timedOut: false,
    });
    await assert.rejects(
      runner.execute({ srcPath: '/in/a.dwg', fileHash: 'h1' }, 60000, undefined, fakeRun),
      (err: unknown) =>
        err instanceof ConversionExecutionError &&
        err.category === 'output-unparseable' &&
        err.transient === true
    );
  });

  it('mxcadassembly 返回非 0 code（进程正常退出）→ category=content-error 且不可重试', async () => {
    const runner = new MxcadRunner();
    const fakeRun = async () => ({
      stdout: '{"code":12,"message":"param error"}',
      stderr: '',
      exitCode: 2123,
      signal: null,
      timedOut: false,
    });
    await assert.rejects(
      runner.execute({ srcPath: '/in/a.dwg', fileHash: 'h1' }, 60000, undefined, fakeRun),
      (err: unknown) =>
        err instanceof ConversionExecutionError &&
        err.code === 12 &&
        err.category === 'content-error' &&
        err.transient === false
    );
  });
});

describe('MxcadRunner.execute newpath 补齐', () => {
  // 真实 mxcadassembly 输出只含 code/message（无 newpath 键），退出码恒 2123、成败只认 code
  const okRun = async () => ({
    stdout: '{"code":0,"message":"ok"}',
    stderr: '',
    exitCode: 2123,
    signal: null,
    timedOut: false,
  });

  it('binToMxweb（outpath+outname）：runner 按 outpath+outname 补齐 newpath（消费方不能拿到空串）', async () => {
    const runner = new MxcadRunner();
    const result = await runner.execute(
      { srcPath: '/bin/a.bin', outpath: '/out', outname: 'a.mxweb' },
      60000,
      undefined,
      okRun
    );
    assert.equal(result.code, 0);
    assert.equal(result.newpath, path.join('/out', 'a.mxweb'));
  });

  it('convertFile（无 outpath，带 outname）：引擎把 outname 写到 srcpath 同目录，runner 按 dirname(srcPath)+outname 补齐', async () => {
    const runner = new MxcadRunner();
    const result = await runner.execute(
      { srcPath: '/in/a.dwg', fileHash: 'h1', outname: 'a.pdf' },
      60000,
      undefined,
      okRun
    );
    assert.equal(result.code, 0);
    // 与 backend 进程内 convertInProcess 的 path.join(dirname(srcPath), outname) 一致
    assert.equal(result.newpath, path.join('/in', 'a.pdf'));
  });

  it('无 outname：引擎自定产物名、位置不可推导，newpath 为空串', async () => {
    const runner = new MxcadRunner();
    const result = await runner.execute(
      { srcPath: '/in/a.dwg', fileHash: 'h1' },
      60000,
      undefined,
      okRun
    );
    assert.equal(result.code, 0);
    assert.equal(result.newpath, '');
  });
});
