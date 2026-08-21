import { describe, it, expect } from 'vitest';
import { parseParamString, stringifyParams, getParamsFromUrl } from './paramsFromUrl';

describe('parseParamString', () => {
  it('应正确解析参数字符串', () => {
    const result = parseParamString('key1=value1&key2=value2');
    expect(result).toEqual({ key1: 'value1', key2: 'value2' });
  });

  it('应处理空值', () => {
    const result = parseParamString('key=');
    expect(result).toEqual({ key: '' });
  });

  it('应处理空字符串', () => {
    const result = parseParamString('');
    expect(result).toEqual({ '': '' });
  });
});

describe('stringifyParams', () => {
  it('应将对象序列化为查询字符串', () => {
    const result = stringifyParams({ a: '1', b: '2' });
    expect(result).toContain('a=1');
    expect(result).toContain('b=2');
  });
});

describe('getParamsFromUrl', () => {
  it('无参数时应返回空对象', () => {
    const result = getParamsFromUrl();
    expect(result).toEqual({});
  });
});
