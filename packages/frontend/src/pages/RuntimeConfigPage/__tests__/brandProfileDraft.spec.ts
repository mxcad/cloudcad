import { describe, it, expect } from 'vitest';
import {
  commit,
  isJsonObject,
  parseDraft,
  pruneEmpty,
  setByPath,
} from '../brandProfileDraft';
import type { JsonObject } from '../brandProfileDraft';

describe('parseDraft', () => {
  it('合法对象原样返回', () => {
    expect(parseDraft('{"title":"A"}')).toEqual({ title: 'A' });
  });

  it('空字符串与非法 JSON 回落空对象', () => {
    expect(parseDraft('')).toEqual({});
    expect(parseDraft('{oops')).toEqual({});
  });

  it('数组与布尔不是对象，回落空对象', () => {
    expect(parseDraft('[]')).toEqual({});
    expect(parseDraft('true')).toEqual({});
    expect(parseDraft(null)).toEqual({});
  });
});

describe('setByPath', () => {
  it('写入顶层字段，空串即删除', () => {
    const obj: JsonObject = { title: '旧值' };
    setByPath(obj, ['title'], '新值');
    expect(obj.title).toBe('新值');
    setByPath(obj, ['title'], '');
    expect(obj).toEqual({});
  });

  it('嵌套路径自动建层', () => {
    const obj: JsonObject = {};
    setByPath(obj, ['legal', 'identities', 'zh-CN', 'entityName'], '主体');
    expect(obj).toEqual({
      legal: { identities: { 'zh-CN': { entityName: '主体' } } },
    });
  });

  it('路径中间是字符串时重建为对象', () => {
    const obj: JsonObject = { legal: '脏值' };
    setByPath(obj, ['legal', 'productName'], '产品');
    expect(obj).toEqual({ legal: { productName: '产品' } });
  });
});

describe('pruneEmpty', () => {
  it('清空字段后变空的嵌套对象被删除（support 与空的 identities 一起消失）', () => {
    const obj: JsonObject = {
      title: '标题',
      support: { hours: '服务时间' },
      legal: { identities: {} },
    };
    setByPath(obj, ['support', 'hours'], '');
    pruneEmpty(obj);
    expect(obj).toEqual({ title: '标题' });
  });

  it('不删空串叶子：tagline 等字段用空串表达「显式清空」', () => {
    const obj: JsonObject = { title: '标题', tagline: '' };
    pruneEmpty(obj);
    expect(obj).toEqual({ title: '标题', tagline: '' });
  });

  it('apps 下的空条目保留（由「移除应用」按钮管理）', () => {
    const obj: JsonObject = { apps: { mxcadweb: {} } };
    pruneEmpty(obj);
    expect(obj).toEqual({ apps: { mxcadweb: {} } });
  });

  it('未知字段原样保留，只读不改写', () => {
    const obj: JsonObject = { apps: { a: { logo: '/x.png' } } };
    pruneEmpty(obj);
    expect(obj).toEqual({ apps: { a: { logo: '/x.png' } } });
  });
});

describe('commit', () => {
  it('改动后回写两空格缩进的 JSON，并保留未渲染的未知键', () => {
    const draft = '{"title":"旧标题","unknown":"保留我"}';
    const out = commit(draft, (obj) => setByPath(obj, ['title'], '新标题'));
    expect(JSON.parse(String(out))).toEqual({
      title: '新标题',
      unknown: '保留我',
    });
    expect(String(out)).toContain('\n  "title"');
  });

  it('清空字段即删除该键，空嵌套对象随之清理', () => {
    const draft = '{"support":{"hours":"周一至周五"},"title":"标题"}';
    const out = commit(draft, (obj) => setByPath(obj, ['support', 'hours'], ''));
    expect(JSON.parse(String(out))).toEqual({ title: '标题' });
  });

  it('草稿是非法 JSON 时从零对象开始，不把脏值带回去', () => {
    const out = commit('{脏', (obj) => setByPath(obj, ['title'], '标题'));
    expect(JSON.parse(String(out))).toEqual({ title: '标题' });
  });

  it('入参不被就地修改', () => {
    const draft = '{"title":"旧值"}';
    const copy = draft;
    commit(draft, (obj) => setByPath(obj, ['title'], '新值'));
    expect(draft).toBe(copy);
    expect(parseDraft(draft)).toEqual({ title: '旧值' });
  });
});

describe('isJsonObject', () => {
  it('只认纯对象', () => {
    expect(isJsonObject({})).toBe(true);
    expect(isJsonObject([])).toBe(false);
    expect(isJsonObject(null)).toBe(false);
    expect(isJsonObject('x')).toBe(false);
    expect(isJsonObject(undefined)).toBe(false);
  });
});
