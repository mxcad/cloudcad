import { describe, it, expect } from 'vitest';
import mxUIConfig from '../../../../public/mxUIConfig.json';
import idMap from '@/languages/messages/idMap.json';
import zhCN from '@/languages/messages/zh-CN';
import enUS from '@/languages/messages/en-US';
import koKR from '@/languages/messages/ko-KR';
import zhTW from '@/languages/messages/zh-TW';
import { filterHiddenToolbar } from '@/config/uiConfig';

type ToolbarItem = {
  name?: string;
  text?: string;
  cmd?: string;
  hidden?: boolean;
  list?: ToolbarItem[];
};

const toolbar = (mxUIConfig as { toolbarData?: ToolbarItem[] }).toolbarData || [];
const findGroup = (name: string) => toolbar.find((g) => g.name === name);
/** 运行时可见工具栏（剔除 hidden「注释掉」项），与 fetchUiConfig 同口径 */
const visibleToolbar = filterHiddenToolbar(toolbar);
const findVisibleGroup = (name: string) => visibleToolbar.find((g) => g.name === name);

const LANGS: Record<string, Record<string, string>> = {
  'zh-CN': zhCN as Record<string, string>,
  'en-US': enUS as Record<string, string>,
  'ko-KR': koKR as Record<string, string>,
  'zh-TW': zhTW as Record<string, string>,
};

/** 校验一组标签在 idMap 登记、且对应 id 在 4 个语言文件中都存在 */
const assertLabelsHaveI18n = (labels: string[]) => {
  const problems: string[] = [];
  for (const label of labels) {
    if (!(label in idMap)) {
      problems.push(`idMap 缺少「${label}」`);
      continue;
    }
    const id = String((idMap as Record<string, number>)[label]);
    for (const [lang, msgs] of Object.entries(LANGS)) {
      if (!(id in msgs)) problems.push(`${lang} 缺少 id=${id}（${label}）`);
    }
  }
  return problems;
};

describe('E-31 剪贴板/选择菜单项（已删除）', () => {
  it('剪贴板组不再出现在配置与可见工具栏', () => {
    expect(findGroup('剪贴板')).toBeUndefined();
    expect(findVisibleGroup('剪贴板')).toBeUndefined();
  });
});

describe('E-32 图纸比对菜单项（已删除）', () => {
  it('工具组不再含图纸比对', () => {
    const group = findGroup('工具');
    expect(group).toBeTruthy();
    expect((group!.list || []).find((i) => i.cmd === 'Mx_CompareDWG')).toBeUndefined();
    const visibleGroup = findVisibleGroup('工具');
    expect((visibleGroup?.list || []).find((i) => i.cmd === 'Mx_CompareDWG')).toBeUndefined();
  });
});

describe('E-33 样式菜单项（已注释掉）', () => {
  it('样式组保留在配置但不出现在可见工具栏', () => {
    expect(findGroup('样式')).toBeTruthy();
    expect(findVisibleGroup('样式')).toBeUndefined();
  });
  it('样式组标签全部有 i18n（重新启用安全）', () => {
    const labels = ['样式', ...(findGroup('样式')!.list || []).map((i) => i.name || '')];
    expect(assertLabelsHaveI18n(labels)).toEqual([]);
  });
});

describe('E-05 插入表格菜单项（已注释掉）', () => {
  it('插入表格保留在配置但不出现在可见工具栏', () => {
    const group = findGroup('绘制');
    expect(group).toBeTruthy();
    expect((group!.list || []).find((i) => i.cmd === 'Mx_InsertTable')).toBeTruthy();
    const visibleGroup = findVisibleGroup('绘制');
    expect((visibleGroup?.list || []).find((i) => i.cmd === 'Mx_InsertTable')).toBeUndefined();
  });
  it('插入表格标签有 i18n（重新启用安全）', () => {
    expect(assertLabelsHaveI18n(['插入表格'])).toEqual([]);
  });
});

describe('E-15 库列表视图切换 i18n', () => {
  it('网格视图/列表视图标签有 i18n', () => {
    expect(assertLabelsHaveI18n(['网格视图', '列表视图'])).toEqual([]);
  });
});

describe('E-25 版本历史相对时间 i18n', () => {
  it('相对时间单位 + 预热消息有 i18n', () => {
    expect(
      assertLabelsHaveI18n([
        '刚刚',
        '{n} 分钟前',
        '{n} 小时前',
        '{n} 天前',
        '{n} 周前',
        '{n} 个月前',
        '{n} 年前',
        '正在准备历史版本文件，请稍候...',
      ])
    ).toEqual([]);
  });
});

describe('E-06 视图子菜单', () => {
  const group = findGroup('视图');
  it('视图组存在且命令顺序正确', () => {
    expect(group).toBeTruthy();
    expect((group!.list || []).map((i) => i.cmd)).toEqual([
      'Mx_WindowZoom',
      'Mx_Pan',
      'Mx_Plan90CW',
      'Mx_Plan90CCW',
      'Mx_Plan',
    ]);
  });
  it('视图组标签全部有 i18n', () => {
    const labels = ['视图', ...(group!.list || []).map((i) => i.name || '')];
    expect(assertLabelsHaveI18n(labels)).toEqual([]);
  });
});
