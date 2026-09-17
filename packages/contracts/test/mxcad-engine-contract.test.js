'use strict';

/**
 * mxcad 两级参数契约的纯函数测试（ADR-0064 / ADR-0069）。
 *
 * 本模块是 camelCase HTTP 契约 ↔ lowercase 引擎参数的唯一翻译点。它的字段集历史上
 * 被手写映射 4-5 次且各份不一致，代价已付两次：
 *   - 368ca55 漏抄 bd_pt1_x/y、bd_pt2_x/y、open_file_md5、create_clip_block
 *     → cut_dwg / print_to_pdf 静默返回 {"message":"false"}；
 *   - 721fe02 转发分支误发 lowercase 参数 → 引擎收到 undefined → 崩溃。
 *
 * 契约包此前 0 测试，上述两个事故的回归只由 backend / conversion-service 的间接行为
 * 兜着，翻译点本身没有任何直接断言。这些用例直接钉在翻译点上。
 *
 * 用 CommonJS + node --test 而非 TypeScript：本包刻意零外部依赖、无 @types/node，
 * 测试跑在 pnpm build 产出的 dist/ 上，不引入任何新依赖。
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildEngineParams,
  parseEngineOutput,
  isTransientFailure,
  isConversionFailureCategory,
  CONVERSION_FAILURE_CATEGORIES,
  TRANSIENT_FAILURE_CATEGORIES,
  ENGINE_INPUT_FIELDS,
  CONTENT_KEY_FIELDS,
} = require('../dist/index.js');

// ── buildEngineParams ──────────────────────────────────────────────────────

test('convertFile 方向：全字段一次性翻出，不丢任何引擎字段（368ca55 回归）', () => {
  const params = buildEngineParams({
    srcPath: 'D:/data/202609/n1/abc/file.dwg',
    fileHash: 'abc123',
    createPreloadingData: false,
    compression: false,
    outname: 'out.dwg',
    cmd: 'toDwg',
    width: 1024,
    height: '768',
    colorPolicy: 'mono',
    outjpg: 'jpg1',
    roate_angle: 0,
    view_angle: 0,
    dwgVersion: 0,
    layout_name: 'Layout1',
    bd_pt1_x: '10',
    bd_pt1_y: '20',
    bd_pt2_x: '30',
    bd_pt2_y: '40',
    open_file_md5: 'md5now',
    create_clip_block: false,
  });

  assert.deepEqual(params, {
    srcpath: 'D:/data/202609/n1/abc/file.dwg',
    src_file_md5: 'abc123',
    create_preloading_data: false,
    compression: 0,
    outname: 'out.dwg',
    cmd: 'toDwg',
    width: '1024',
    height: '768',
    colorPolicy: 'mono',
    outjpg: 'jpg1',
    roate_angle: 0,
    view_angle: 0,
    dwg_version: 0,
    layout_name: 'Layout1',
    bd_pt1_x: '10',
    bd_pt1_y: '20',
    bd_pt2_x: '30',
    bd_pt2_y: '40',
    open_file_md5: 'md5now',
    create_clip_block: false,
  });
});

test('binToMxweb 方向：outpath 替代内容哈希与预加载标志，不混发两套字段', () => {
  const params = buildEngineParams({
    srcPath: 'C:\\data\\202609\\a.bin',
    outpath: 'C:\\out\\dir',
    outname: 'a.mxweb',
    fileHash: 'should-not-appear',
    createPreloadingData: false,
  });

  assert.equal(params.outpath, 'C:/out/dir');
  assert.equal(params.srcpath, 'C:/data/202609/a.bin');
  assert.equal(params.outname, 'a.mxweb');
  assert.equal('src_file_md5' in params, false);
  assert.equal('create_preloading_data' in params, false);
});

test('方向判据是 outpath 是否「有」(!== undefined)，不是真值：空串仍走 binToMxweb 方向', () => {
  const params = buildEngineParams({
    srcPath: 'a.dwg',
    outpath: '',
    fileHash: 'h',
  });
  assert.equal(params.outpath, '');
  assert.equal('src_file_md5' in params, false);
});

test('空串字符串字段一律省略：引擎按「字段缺失」而非「有值但为空」处理', () => {
  const params = buildEngineParams({
    srcPath: 'a.dwg',
    fileHash: 'h',
    outname: '',
    cmd: '',
    colorPolicy: '',
    outjpg: '',
    layout_name: '',
    bd_pt1_x: '',
    bd_pt1_y: '',
    bd_pt2_x: '',
    bd_pt2_y: '',
    open_file_md5: '',
  });

  for (const key of [
    'outname',
    'cmd',
    'colorPolicy',
    'outjpg',
    'layout_name',
    'bd_pt1_x',
    'bd_pt1_y',
    'bd_pt2_x',
    'bd_pt2_y',
    'open_file_md5',
  ]) {
    assert.equal(key in params, false, `${key} 不应出现`);
  }
});

test('0 是合法的角度与版本号，布尔 false 是合法的裁剪块开关，均须保留', () => {
  const params = buildEngineParams({
    srcPath: 'a.dwg',
    roate_angle: 0,
    view_angle: 0,
    dwgVersion: 0,
    create_clip_block: false,
  });
  assert.equal(params.roate_angle, 0);
  assert.equal(params.view_angle, 0);
  assert.equal(params.dwg_version, 0);
  assert.equal(params.create_clip_block, false);
});

test('宽度/高度统一转字符串；compression 关闭写 0、开启则省略', () => {
  assert.deepEqual(
    buildEngineParams({ srcPath: 'a', width: 1024, height: 768 }),
    {
      srcpath: 'a',
      src_file_md5: '',
      create_preloading_data: true,
      compression: 0,
      width: '1024',
      height: '768',
    }
  );
  assert.equal('compression' in buildEngineParams({ srcPath: 'a', compression: true }), false);
});

test('createPreloadingData 缺省为 true、显式 false 才写 false', () => {
  assert.equal(buildEngineParams({ srcPath: 'a' }).create_preloading_data, true);
  assert.equal(
    buildEngineParams({ srcPath: 'a', createPreloadingData: false }).create_preloading_data,
    false
  );
});

test('HTTP 契约字段表不得混入 lowercase 引擎键（混入即两侧行为静默分叉）', () => {
  for (const engineKey of [
    'srcpath',
    'src_file_md5',
    'create_preloading_data',
    'dwg_version',
  ]) {
    assert.equal(ENGINE_INPUT_FIELDS.includes(engineKey), false, `${engineKey} 是引擎键`);
  }
});

// ── parseEngineOutput ──────────────────────────────────────────────────────

test('剥离结果 JSON 之前的日志噪音，取最后一个 {"code" 起解析', () => {
  const raw =
    '引擎启动 v2.3\n[INFO] loading file\n调试输出 {"code": 1}\n{"code":0,"message":"ok","newpath":"D:/out/a.dwg","tz":true}';
  assert.deepEqual(parseEngineOutput(raw), {
    code: 0,
    message: 'ok',
    newpath: 'D:/out/a.dwg',
    tz: true,
  });
});

test('保留引擎的动态扩展字段（索引签名）', () => {
  assert.deepEqual(parseEngineOutput('{"code":0,"newpath":"x","extra":42}'), {
    code: 0,
    newpath: 'x',
    extra: 42,
  });
});

test('引擎回字符串 "false" 的两类输出都按解析失败抛错，绝不当成功', () => {
  // 完全缺 code 键：连结果 JSON 标记都匹配不到，在标记检查阶段即失败
  assert.throws(() => parseEngineOutput('{"message":"false"}'), /缺少结果 JSON/);
  // 有 code 键但值是字符串而非数字：标记能匹配，在 code 类型检查阶段失败
  assert.throws(() => parseEngineOutput('{"code":"false"}'), /缺少 code 字段/);
});

test('截断/畸形/无结果 JSON 的输出抛错', () => {
  assert.throws(() => parseEngineOutput(''), /缺少结果 JSON/);
  assert.throws(() => parseEngineOutput('{"code":0,"message":'), /缺少 code 字段|缺少结果 JSON|JSON/);
  assert.throws(() => parseEngineOutput('纯日志，没有任何 JSON'), /缺少结果 JSON/);
  assert.throws(() => parseEngineOutput('{"code"'), /缺少结果 JSON|JSON/);
});

// ── 失败分类 ────────────────────────────────────────────────────────────────

test('每个分类的瞬态性：仅 content-error 不可重试，其余均可重试', () => {
  for (const category of CONVERSION_FAILURE_CATEGORIES) {
    assert.equal(
      isTransientFailure(category),
      category !== 'content-error',
      `${category} 的瞬态性判定`
    );
  }
});

test('缺分类默认按可重试处理，避免历史数据静默转成永久失败', () => {
  assert.equal(isTransientFailure(null), true);
  assert.equal(isTransientFailure(undefined), true);
});

test('TRANSIENT_FAILURE_CATEGORIES = 全集 − content-error，无重复无遗漏', () => {
  assert.deepEqual(
    TRANSIENT_FAILURE_CATEGORIES,
    CONVERSION_FAILURE_CATEGORIES.filter((category) => category !== 'content-error')
  );
  assert.equal(new Set(TRANSIENT_FAILURE_CATEGORIES).size, TRANSIENT_FAILURE_CATEGORIES.length);
});

test('isConversionFailureCategory 只对合法字符串收窄，HTTP 边界的松包值一律拒绝', () => {
  for (const category of CONVERSION_FAILURE_CATEGORIES) {
    assert.equal(isConversionFailureCategory(category), true);
  }
  assert.equal(isConversionFailureCategory('CONTENT-ERROR'), false);
  assert.equal(isConversionFailureCategory('content_error'), false);
  assert.equal(isConversionFailureCategory(''), false);
  assert.equal(isConversionFailureCategory('ok'), false);
  assert.equal(isConversionFailureCategory(null), false);
  assert.equal(isConversionFailureCategory(undefined), false);
  assert.equal(isConversionFailureCategory(0), false);
  assert.equal(isConversionFailureCategory(true), false);
  assert.equal(isConversionFailureCategory({}), false);
  assert.equal(isConversionFailureCategory([]), false);
});

// ── 内容身份字段集派生 ─────────────────────────────────────────────────────

test('CONTENT_KEY_FIELDS = 引擎输入全集 − outpath（产物落点不是内容身份）', () => {
  assert.equal(ENGINE_INPUT_FIELDS.length, 21);
  assert.equal(CONTENT_KEY_FIELDS.length, ENGINE_INPUT_FIELDS.length - 1);
  assert.deepEqual(
    CONTENT_KEY_FIELDS,
    ENGINE_INPUT_FIELDS.filter((field) => field !== 'outpath')
  );
  assert.equal(CONTENT_KEY_FIELDS.includes('outpath'), false);
});
