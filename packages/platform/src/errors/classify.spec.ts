import { describe, expect, it } from 'vitest';

import { isAbortError, isPermissionError, isServerError } from './classify';

describe('@cloudcad/platform · errors/classify', () => {
  it('isAbortError：isAborted 标志 / axios code / name / message 子串（并集）', () => {
    expect(isAbortError({ isAborted: true })).toBe(true);
    expect(isAbortError({ code: 'ERR_CANCELED' })).toBe(true);
    expect(isAbortError({ code: 'ERR_FR_TXN_CANCELLED' })).toBe(true);
    expect(isAbortError(new DOMException('aborted', 'AbortError'))).toBe(true);
    expect(isAbortError({ name: 'CanceledError', message: 'xxx' })).toBe(true);
    expect(isAbortError({ message: 'Request aborted by user' })).toBe(true);
    expect(isAbortError({ message: 'Network Error' })).toBe(false);
    expect(isAbortError('aborted')).toBe(false);
  });

  it('isPermissionError：403 三源 + 标志', () => {
    expect(isPermissionError({ status: 403 })).toBe(true);
    expect(isPermissionError({ statusCode: 403 })).toBe(true);
    expect(isPermissionError({ response: { status: 403 } })).toBe(true);
    expect(isPermissionError({ isPermissionError: true })).toBe(true);
    expect(isPermissionError({ status: 401 })).toBe(false);
    expect(isPermissionError({ status: 404 })).toBe(false);
    expect(isPermissionError({ status: 500 })).toBe(false);
    expect(isPermissionError(null)).toBe(false);
  });

  it('isServerError：500-599', () => {
    expect(isServerError({ status: 500 })).toBe(true);
    expect(isServerError({ response: { status: 503 } })).toBe(true);
    expect(isServerError({ status: 404 })).toBe(false);
    expect(isServerError({ status: 600 })).toBe(false);
    expect(isServerError({ status: '500' })).toBe(false);
    expect(isServerError('500')).toBe(false);
    expect(isServerError(undefined)).toBe(false);
  });
});
