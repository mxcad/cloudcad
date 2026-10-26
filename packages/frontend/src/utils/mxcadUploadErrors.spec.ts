import { describe, it, expect, vi, afterEach } from 'vitest';
import { MxCadUploadError, throwOnSdkError } from './mxcadUploadErrors';
import { t } from '@/languages';

/** 复刻 @hey-api client 非 2xx 的返回形态：{ error, response } */
function sdkError(error: unknown, status?: number) {
  return status === undefined
    ? { error }
    : { error, response: { status } };
}

const FALLBACK = '检查文件失败';

/** 执行断言并取出抛出的错误对象（不抛则返回 undefined） */
function tryThrow(
  error: unknown,
  status?: number,
  fallback: string = FALLBACK,
  fileName?: string
): unknown {
  try {
    throwOnSdkError(sdkError(error, status), fallback, fileName);
    return undefined;
  } catch (e) {
    return e;
  }
}

describe('throwOnSdkError', () => {
  afterEach(() => vi.restoreAllMocks());

  it('结果无 error 字段时不抛错', () => {
    expect(() =>
      throwOnSdkError({ data: { exists: false } }, FALLBACK)
    ).not.toThrow();
    expect(() =>
      throwOnSdkError(undefined, FALLBACK)
    ).not.toThrow();
    expect(() => throwOnSdkError({ error: null }, FALLBACK)).not.toThrow();
    expect(() => throwOnSdkError({ error: undefined }, FALLBACK)).not.toThrow();
  });

  it('4xx 业务错误：保留后端 message 并提取配额字段', () => {
    const err = tryThrow(
      {
        code: 'QUOTA_EXCEEDED',
        message: '存储空间不足',
        restrictionKey: 'storage',
        current: 10,
        limit: 10,
        need: 1,
      },
      403,
      FALLBACK,
      'a.dwg'
    ) as MxCadUploadError;

    expect(err).toBeInstanceOf(MxCadUploadError);
    expect(err.message).toBe('存储空间不足');
    expect(err.fileName).toBe('a.dwg');
    expect(err.code).toBe('QUOTA_EXCEEDED');
    expect(err.restrictionKey).toBe('storage');
    expect(err.current).toBe(10);
    expect(err.limit).toBe(10);
    expect(err.need).toBe(1);
  });

  it('4xx 业务错误无 message 时退回调用方的兜底文案', () => {
    const err = tryThrow({ code: 'BAD_REQUEST' }, 400, FALLBACK) as MxCadUploadError;
    expect(err.message).toBe(FALLBACK);
    expect(err.code).toBe('BAD_REQUEST');
  });

  it('回归：反向代理 502 纯文本响应体不再落业务兜底文案「检查文件失败」', () => {
    const detail = 'Proxy Error: connect ECONNREFUSED 127.0.0.1:3001';
    const err = tryThrow(detail, 502, FALLBACK) as MxCadUploadError;

    expect(err.message).toBe(t('服务器繁忙，请稍后重试'));
    expect(err.message).not.toBe(FALLBACK);
    // 中间层细节不应出现在用户可见文案里
    expect(err.message).not.toContain('Proxy Error');
  });

  it('5xx 对象错误也不泄露后端异常原文，统一给服务侧兜底文案', () => {
    const backendText = 'Internal server error';
    const err = tryThrow(
      { code: 'P2022', message: backendText },
      500,
      FALLBACK
    ) as MxCadUploadError;

    expect(err.message).toBe(t('服务器繁忙，请稍后重试'));
    expect(err.message).not.toBe(backendText);
    // 结构化字段仍保留，便于上游按错误码分支
    expect(err.code).toBe('P2022');
  });

  it('原始文案被兜底文案替换时只进控制台日志', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = tryThrow('Proxy Error: boom', 502) as MxCadUploadError;

    expect(err.message).toBe(t('服务器繁忙，请稍后重试'));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][1]).toMatchObject({
      statusCode: 502,
      detail: 'Proxy Error: boom',
    });
    spy.mockRestore();
  });

  it('业务错误保留原始 message 时不打控制台日志', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    tryThrow({ code: 'OK_ERR', message: '已存在同名文件' }, 409);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('断网（fetch 自身失败）归到网络类文案，而非业务兜底', () => {
    const err = tryThrow(
      new TypeError('Failed to fetch'),
      undefined,
      FALLBACK
    ) as MxCadUploadError;
    expect(err.message).toBe(t('网络连接异常，请检查网络或稍后重试'));
    expect(err.message).not.toBe(FALLBACK);
    expect(err.message).not.toContain('Failed to fetch');
  });

  it('断网文案匹配大小写与常见变体', () => {
    for (const variant of ['LOAD FAILED', 'NetworkError when attempting to fetch resource.']) {
      const err = tryThrow(new TypeError(variant)) as MxCadUploadError;
      expect(err.message).toBe(t('网络连接异常，请检查网络或稍后重试'));
    }
  });

  it('非网络类 Error 使用其 message', () => {
    const err = tryThrow(
      new Error('文件名包含非法字符'),
      400,
      FALLBACK
    ) as MxCadUploadError;
    expect(err.message).toBe('文件名包含非法字符');
  });

  it('非 5xx 的纯文本响应体同样不当作用户文案，退回兜底', () => {
    const err = tryThrow('<html>403 Forbidden</html>', 403) as MxCadUploadError;
    expect(err.message).toBe(FALLBACK);
    expect(err.message).not.toContain('<html>');
  });

  it('缺少 response 时按业务错误处理（有 message 用 message）', () => {
    const err = tryThrow({ message: '未登录' }, undefined) as MxCadUploadError;
    expect(err.message).toBe('未登录');
  });

  it('error 为字符串且 response.status 类型异常时不崩溃', () => {
    expect(() =>
      throwOnSdkError(
        { error: 'some body', response: { status: '500' } },
        FALLBACK
      )
    ).toThrowError(MxCadUploadError);
  });
});
