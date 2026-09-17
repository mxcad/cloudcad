import { describe, it, expect } from 'vitest';
import {
  toVersionDisplayList,
  extractUserNote,
  INITIAL_VERSION_REVISION,
} from './versionHistory';

describe('extractUserNote', () => {
  it('单行说明正常提取', () => {
    expect(extractUserNote('Save: 图纸1 - 修改了标题')).toBe('修改了标题');
  });

  it('多行说明完整提取（回归：旧正则 . 不匹配换行导致整条丢失）', () => {
    expect(extractUserNote('Save: 图纸1 - 第一行\n第二行')).toBe(
      '第一行\n第二行'
    );
  });

  it('说明含空行（隔行）完整提取', () => {
    expect(extractUserNote('Save: 图纸1 - 第一行\n\n第三行')).toBe(
      '第一行\n\n第三行'
    );
  });

  it('说明前后空白/换行被 trim', () => {
    expect(extractUserNote('Save: 图纸1 -  说明内容  \n')).toBe('说明内容');
  });

  it('说明以换行开头也能提取', () => {
    expect(extractUserNote('Save: 图纸1 - \n第二行')).toBe('第二行');
  });

  it('说明为纯空白（只打了空格/换行）返回 null', () => {
    expect(extractUserNote('Save: 图纸1 -    \n  ')).toBeNull();
  });

  it('无说明（Save: 文件名）返回 null', () => {
    expect(extractUserNote('Save: 图纸1')).toBeNull();
  });

  it('非 Save 格式消息返回 null', () => {
    expect(extractUserNote('Initial import')).toBeNull();
    expect(
      extractUserNote('{"type":"update_ignores","message":"x"}')
    ).toBeNull();
  });

  it('空消息返回 null', () => {
    expect(extractUserNote('')).toBeNull();
  });

  it('save 前缀大小写不敏感', () => {
    expect(extractUserNote('save: 图纸1 - 说明')).toBe('说明');
  });

  it('文件名含空格时按首个 " - " 分割', () => {
    expect(extractUserNote('Save: my file.dwg - 说明')).toBe('说明');
  });
});

describe('toVersionDisplayList', () => {
  it('反转为最新在前，版本号基于 totalCount 编号', () => {
    const entries = [
      { revision: INITIAL_VERSION_REVISION },
      { revision: 1 },
      { revision: 2 },
      { revision: 3 },
    ];
    const list = toVersionDisplayList(entries, 3);
    expect(list.map((e) => e.versionIndex)).toEqual([3, 2, 1, 0]);
  });

  it('limit 截断时版本号不漂移', () => {
    const entries = [{ revision: 99 }, { revision: 100 }];
    const list = toVersionDisplayList(entries, 100);
    expect(list.map((e) => e.versionIndex)).toEqual([100, 99]);
  });
});
