import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { interpretEngineRun, resolveEngineNewpath, salvageSuccessResult } from '../runner';
import type { EngineRunContext } from '../runner';
import type { ManagedProcessResult } from '../spawn';
import type {
  MxCadConversionResult,
  MxCadEngineParams,
} from '@cloudcad/contracts';

/**
 * 结果解读层的单元测试。
 *
 * 这一层历史上是 backend 与 conversion-service 各自一份，靠手写注释维持同步；
 * 现在只有一份实现，故测试直接钉住「判定顺序」与「产物路径规则」，
 * 两侧 adapter 不需要再各自写一遍分类测试。
 *
 * 不测文案：adapter 各自渲染 message（backend 用户可见中文 / conversion-service 经 HTTP 下发），
 * 本层只出结构化事实。
 */

function runResult(overrides: Partial<ManagedProcessResult> = {}): ManagedProcessResult {
  return {
    stdout: '',
    stderr: '',
    exitCode: 0,
    signal: null,
    timedOut: false,
    ...overrides,
  };
}

/** convertFile 方向入参：无 outpath，有 outname → 产物落 srcpath 同目录 */
function convertFileParam(): MxCadEngineParams {
  return { srcpath: 'C:/drawings/a.dwg', outname: 'a.mxweb' };
}

/** bin→mxweb 方向入参：有 outpath + outname → 产物落 outpath */
function binToMxwebParam(): MxCadEngineParams {
  return { srcpath: 'C:/drawings/a.bin', outpath: 'C:/out', outname: 'a.mxweb' };
}

function ctx(param: MxCadEngineParams = convertFileParam(), extra: Partial<EngineRunContext> = {}): EngineRunContext {
  return { param, ...extra };
}

const SUCCESS_JSON = '{"code":0,"message":"ok"}';

describe('interpretEngineRun：判定顺序与分类', () => {
  it('code=0 且引擎不回 newpath：补齐产物路径（srcpath 同目录）', () => {
    const out = interpretEngineRun(runResult({ stdout: SUCCESS_JSON }), ctx());
    assert.equal(out.ok, true);
    assert.equal(out.category, undefined);
    assert.equal(out.result?.newpath, path.join('C:/drawings', 'a.mxweb'));
  });

  it('bin→mxweb 方向：产物落 outpath 而非 srcpath 同目录', () => {
    const out = interpretEngineRun(
      runResult({ stdout: SUCCESS_JSON }),
      ctx(binToMxwebParam())
    );
    assert.equal(out.ok, true);
    assert.equal(out.result?.newpath, path.join('C:/out', 'a.mxweb'));
  });

  it('引擎已回 newpath 时不覆盖（引擎值优先）', () => {
    const out = interpretEngineRun(
      runResult({ stdout: '{"code":0,"newpath":"C:/engine/said.pdf"}' }),
      ctx()
    );
    assert.equal(out.ok, true);
    assert.equal(out.result?.newpath, 'C:/engine/said.pdf');
  });

  it('无 outname：引擎自定产物名、位置不可推导 → newpath 为空串（键恒存在，结果自描述）', () => {
    const out = interpretEngineRun(
      runResult({ stdout: SUCCESS_JSON }),
      ctx({ srcpath: 'C:/drawings/a.dwg' })
    );
    assert.equal(out.ok, true);
    assert.equal(out.result?.newpath, '');
  });

  it('stdout 为空时回退 stderr 解析', () => {
    const out = interpretEngineRun(runResult({ stderr: SUCCESS_JSON }), ctx());
    assert.equal(out.ok, true);
  });

  it('stdout 空且 stderr 空：判为输出无法解析，不是成功', () => {
    const out = interpretEngineRun(runResult(), ctx());
    assert.equal(out.ok, false);
    assert.equal(out.category, 'output-unparseable');
  });

  it('code 非 0：确定性内容失败，保留引擎结果对象', () => {
    const out = interpretEngineRun(
      runResult({ stdout: '{"code":1,"message":"read file error"}' }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'content-error');
    assert.equal(out.result?.code, 1);
    assert.equal(out.result?.message, 'read file error');
  });

  it('输出无法解析：带诊断片段（解析器报错 + 原始输出）', () => {
    const out = interpretEngineRun(
      runResult({ stdout: 'garbled engine output' }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'output-unparseable');
    assert.match(out.rawFragment || '', /原始输出=garbled engine output/);
  });

  it('输出缺 code 字段：判为解析失败，而不是当成成功', () => {
    const out = interpretEngineRun(runResult({ stdout: '{"newpath":"x"}' }), ctx());
    assert.equal(out.ok, false);
    assert.equal(out.category, 'output-unparseable');
  });
});

describe('interpretEngineRun：超时救回', () => {
  it('timedOut 但 stdout 已含完整 code=0：采信成功（大图纸卡在超时线上的正解）', () => {
    const out = interpretEngineRun(
      runResult({ timedOut: true, stdout: SUCCESS_JSON, signal: 'SIGKILL' }),
      ctx()
    );
    assert.equal(out.ok, true);
    assert.equal(out.category, undefined);
    assert.equal(out.result?.newpath, path.join('C:/drawings', 'a.mxweb'));
  });

  it('救回成功标记 salvaged（adapter 据此留诊断日志）；正常成功与超时失败均不标记', () => {
    assert.equal(
      interpretEngineRun(
        runResult({ timedOut: true, stdout: SUCCESS_JSON }),
        ctx()
      ).salvaged,
      true
    );
    assert.equal(interpretEngineRun(runResult({ stdout: SUCCESS_JSON }), ctx()).salvaged, undefined);
    assert.equal(
      interpretEngineRun(
        runResult({ timedOut: true, stdout: 'partial' }),
        ctx()
      ).salvaged,
      undefined
    );
  });

  it('timedOut 且输出不完整：判 timeout', () => {
    const out = interpretEngineRun(
      runResult({ timedOut: true, stdout: 'partial', signal: 'SIGKILL' }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'timeout');
  });

  it('timedOut 但引擎明确报失败（code 非 0）：不救回，判 timeout', () => {
    const out = interpretEngineRun(
      runResult({ timedOut: true, stdout: '{"code":1,"message":"false"}' }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'timeout');
  });

  it('超时救回时同样补齐 newpath', () => {
    const out = interpretEngineRun(
      runResult({ timedOut: true, stdout: SUCCESS_JSON }),
      ctx(binToMxwebParam())
    );
    assert.equal(out.ok, true);
    assert.equal(out.result?.newpath, path.join('C:/out', 'a.mxweb'));
  });
});

describe('interpretEngineRun：进程未正常退出', () => {
  it('被信号终止：killed，透出 signal', () => {
    const out = interpretEngineRun(
      runResult({ exitCode: null, signal: 'SIGKILL' }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'killed');
    assert.equal(out.signal, 'SIGKILL');
  });

  it('signal 非空时优先判 killed，而非 not-started', () => {
    const out = interpretEngineRun(
      runResult({ exitCode: null, signal: 'SIGTERM' }),
      ctx()
    );
    assert.equal(out.category, 'killed');
  });

  it('signal 分支不救回输出（进程被外部终止，stdout 可能是不完整的中途产物）', () => {
    const out = interpretEngineRun(
      runResult({ exitCode: null, signal: 'SIGKILL', stdout: SUCCESS_JSON }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'killed');
  });

  it('spawn 失败（exitCode=null，无 signal）：not-started，不折叠成输出无法解析', () => {
    const out = interpretEngineRun(
      runResult({ exitCode: null, stderr: "spawn ENOENT 'C:/missing.exe'" }),
      ctx()
    );
    assert.equal(out.ok, false);
    assert.equal(out.category, 'not-started');
  });

  it('优先级：timedOut > signal > exitCode===null > 解析', () => {
    const r = runResult({
      timedOut: true,
      exitCode: null,
      signal: 'SIGKILL',
      stdout: 'garbled',
    });
    assert.equal(interpretEngineRun(r, ctx()).category, 'timeout');
  });
});

describe('interpretEngineRun：解析器可注入', () => {
  it('注入自定义解析器后生效（测试替换，不必真的喂 JSON）', () => {
    const out = interpretEngineRun(runResult({ stdout: 'whatever' }), ctx(undefined, {
      parse: () => ({ code: 0 }),
    }));
    assert.equal(out.ok, true);
    assert.equal(out.result?.newpath, path.join('C:/drawings', 'a.mxweb'));
  });

  it('注入的解析器抛错：归为输出无法解析', () => {
    const out = interpretEngineRun(runResult({ stdout: 'x' }), ctx(undefined, {
      parse: () => {
        throw new Error('injected parse failure');
      },
    }));
    assert.equal(out.ok, false);
    assert.equal(out.category, 'output-unparseable');
    assert.match(out.rawFragment || '', /injected parse failure/);
  });
});

describe('salvageSuccessResult', () => {
  it('完整 code=0 输出：返回结果对象', () => {
    assert.equal(salvageSuccessResult(SUCCESS_JSON)?.code, 0);
  });

  it('非 JSON：返回 null（不误判成功）', () => {
    assert.equal(salvageSuccessResult('garbled'), null);
  });

  it('引擎明确报失败（code 非 0）：返回 null', () => {
    assert.equal(salvageSuccessResult('{"code":1,"message":"false"}'), null);
  });

  it('空串/undefined：返回 null', () => {
    assert.equal(salvageSuccessResult(''), null);
    assert.equal(salvageSuccessResult(undefined as unknown as string), null);
  });
});

describe('resolveEngineNewpath', () => {
  it('outpath 优先于 srcpath 同目录', () => {
    assert.equal(
      resolveEngineNewpath({ code: 0 }, binToMxwebParam()).newpath,
      path.join('C:/out', 'a.mxweb')
    );
  });

  it('无 outpath 时用 srcpath 所在目录', () => {
    assert.equal(
      resolveEngineNewpath({ code: 0 }, convertFileParam()).newpath,
      path.join('C:/drawings', 'a.mxweb')
    );
  });

  it('无 outname 时补 newpath: ""（引擎自定产物名、位置不可推导；键恒存在）', () => {
    const input: MxCadConversionResult = { code: 0 };
    const param: MxCadEngineParams = { srcpath: 'C:/drawings/a.dwg' };
    assert.deepEqual(resolveEngineNewpath(input, param), { code: 0, newpath: '' });
    assert.notEqual(resolveEngineNewpath(input, param), input);
  });

  it('已有 newpath 时不覆盖', () => {
    assert.equal(
      resolveEngineNewpath({ code: 0, newpath: 'C:/kept.pdf' }, convertFileParam()).newpath,
      'C:/kept.pdf'
    );
  });

  it('空串 newpath（引擎回 ""）视为缺失并补齐', () => {
    assert.equal(
      resolveEngineNewpath({ code: 0, newpath: '' }, convertFileParam()).newpath,
      path.join('C:/drawings', 'a.mxweb')
    );
  });
});
