import { describe, expect, it } from 'vitest';

import {
  INITIAL_VERSION_REVISION,
  extractUserNote,
  toVersionDisplayList,
} from './history';

describe('@cloudcad/platform · version/history', () => {
  it('倒序 + 编号基于 totalCount（limit 截断时不漂移）', () => {
    const entries = [
      { revision: INITIAL_VERSION_REVISION },
      { revision: 0 },
      { revision: 1 },
      { revision: 2 },
    ];
    // 总修改次数 50，limit 只取最后 4 条 → 顶部应为 r50
    const display = toVersionDisplayList(entries, 50);
    expect(display.map((d) => d.versionIndex)).toEqual([50, 49, 48, 0]);
    expect(display[0]?.entry.revision).toBe(2);
  });

  it('不改动入参数组', () => {
    const entries = [{ revision: 1 }, { revision: 2 }];
    toVersionDisplayList(entries, 2);
    expect(entries.map((e) => e.revision)).toEqual([1, 2]);
  });

  describe('extractUserNote', () => {
    it('剥离 Save: <文件名> - 前缀，只留用户说明', () => {
      expect(extractUserNote('Save: plan.dwg - 修改了标注层')).toBe(
        '修改了标注层'
      );
    });

    it('多行说明完整保留（换行不能被 . 截断）', () => {
      expect(extractUserNote('Save: a.dwg - 第一行\n\n第三行')).toBe(
        '第一行\n\n第三行'
      );
    });

    it('无说明 / 纯空白说明 → null', () => {
      expect(extractUserNote('Save: plan.dwg')).toBe(null);
      expect(extractUserNote('Save: plan.dwg -    ')).toBe(null);
    });

    it('空串与非 Save 前缀 → null', () => {
      expect(extractUserNote('')).toBe(null);
      expect(extractUserNote('手工记录的一行')).toBe(null);
    });
  });
});
