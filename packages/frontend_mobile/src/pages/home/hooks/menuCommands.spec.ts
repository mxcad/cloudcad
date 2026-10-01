import { describe, it, expect } from 'vitest';
import mxUIConfig from '../../../../public/mxUIConfig.json';
import idMap from '@/languages/messages/idMap.json';
import zhCN from '@/languages/messages/zh-CN';
import enUS from '@/languages/messages/en-US';
import koKR from '@/languages/messages/ko-KR';
import zhTW from '@/languages/messages/zh-TW';

type ToolbarItem = {
  name?: string;
  text?: string;
  cmd?: string;
  list?: ToolbarItem[];
};

const toolbar = (mxUIConfig as { toolbarData?: ToolbarItem[] }).toolbarData || [];
const findGroup = (name: string) => toolbar.find((g) => g.name === name);

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

describe('E-31 剪贴板/选择菜单项', () => {
  const group = findGroup('剪贴板');
  it('剪贴板组存在且命令顺序正确', () => {
    expect(group).toBeTruthy();
    expect((group!.list || []).map((i) => i.cmd)).toEqual([
      'Mx_Copy',
      'Mx_PasteClip',
      'Mx_CutClip',
      'Mx_Erase',
      'Mx_select_all',
    ]);
  });
  it('剪贴板组标签全部有 i18n', () => {
    const labels = ['剪贴板', ...(group!.list || []).map((i) => i.name || '')];
    expect(assertLabelsHaveI18n(labels)).toEqual([]);
  });
});

describe('E-32 图纸比对菜单项', () => {
  it('工具组含图纸比对 → Mx_CompareDWG', () => {
    const group = findGroup('工具');
    expect(group).toBeTruthy();
    const item = (group!.list || []).find((i) => i.cmd === 'Mx_CompareDWG');
    expect(item).toBeTruthy();
    expect(item!.name).toBe('图纸比对');
  });
  it('图纸比对标签有 i18n', () => {
    expect(assertLabelsHaveI18n(['图纸比对'])).toEqual([]);
  });
});

describe('E-33 样式菜单项', () => {
  const group = findGroup('样式');
  it('样式组存在且命令顺序正确', () => {
    expect(group).toBeTruthy();
    expect((group!.list || []).map((i) => i.cmd)).toEqual([
      'Mx_Color',
      'Mx_Linetype',
      'Mx_Style',
      'Mx_Dimstyle',
      'Mx_Properties',
    ]);
  });
  it('样式组标签全部有 i18n', () => {
    const labels = ['样式', ...(group!.list || []).map((i) => i.name || '')];
    expect(assertLabelsHaveI18n(labels)).toEqual([]);
  });
});

describe('E-05 插入表格菜单项', () => {
  it('绘制组含插入表格 → Mx_InsertTable', () => {
    const group = findGroup('绘制');
    expect(group).toBeTruthy();
    const item = (group!.list || []).find((i) => i.cmd === 'Mx_InsertTable');
    expect(item).toBeTruthy();
    expect(item!.name).toBe('插入表格');
  });
  it('插入表格标签有 i18n', () => {
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

describe('E-27 另存为后打开新图纸 i18n', () => {
  it('打开新图纸/确认消息标签有 i18n', () => {
    expect(
      assertLabelsHaveI18n(['打开新图纸', '{fileName} 已保存成功，是否打开？'])
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
