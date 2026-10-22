import { describe, expect, it } from 'vitest';

import { checkFileName, stripDrawingExtension, stripMxwebContainer } from './name-rules';

describe('@cloudcad/platform · files/name-rules', () => {
  it('空名 / 超长', () => {
    expect(checkFileName('')).toEqual({ valid: false, reason: 'empty' });
    expect(checkFileName('   ')).toEqual({ valid: false, reason: 'empty' });
    expect(checkFileName('a'.repeat(256))).toEqual({
      valid: false,
      reason: 'too_long',
    });
    expect(checkFileName('a'.repeat(255))).toEqual({ valid: true });
  });

  it('非法字符 / 控制字符 / 保留名 / 首尾点', () => {
    expect(checkFileName('a<b')).toEqual({ valid: false, reason: 'illegal_chars' });
    expect(checkFileName('a\\b')).toEqual({ valid: false, reason: 'illegal_chars' });
    expect(checkFileName('a\x01b')).toEqual({
      valid: false,
      reason: 'control_chars',
    });
    expect(checkFileName('CON')).toEqual({ valid: false, reason: 'reserved_name' });
    expect(checkFileName('com3')).toEqual({ valid: false, reason: 'reserved_name' });
    expect(checkFileName('.hidden')).toEqual({ valid: false, reason: 'dot_edges' });
    expect(checkFileName('a.')).toEqual({ valid: false, reason: 'dot_edges' });
  });

  it('合法名通过；maxLength 可覆盖', () => {
    expect(checkFileName('图纸-01.dwg')).toEqual({ valid: true });
    expect(checkFileName('ab', 1)).toEqual({ valid: false, reason: 'too_long' });
  });
});

describe('@cloudcad/platform · files/stripDrawingExtension', () => {
  it('单层源格式扩展名被剥掉（上传原图节点名）', () => {
    expect(stripDrawingExtension('plan.dwg')).toBe('plan');
    expect(stripDrawingExtension('plan.DXF')).toBe('plan');
    expect(stripDrawingExtension('plan.dwt')).toBe('plan');
  });

  it('历史双层扩展名同样归一（回归：另存为滚雪球 plan.dwg.mxweb）', () => {
    expect(stripDrawingExtension('plan.dwg.mxweb')).toBe('plan');
    expect(stripDrawingExtension('plan.dwg.mxweb.mxweb')).toBe('plan');
    expect(stripDrawingExtension('111122 41.dwg.mxweb')).toBe('111122 41');
  });

  it('纯 mxweb 节点名剥到 mxweb 这一层为止', () => {
    expect(stripDrawingExtension('plan.mxweb')).toBe('plan');
  });

  it('没有格式后缀 / 非格式后缀的名字原样返回，不做猜测式截断', () => {
    expect(stripDrawingExtension('v1.2')).toBe('v1.2');
    expect(stripDrawingExtension('plan(final)')).toBe('plan(final)');
    expect(stripDrawingExtension('untitled')).toBe('untitled');
    expect(stripDrawingExtension('  空白  ')).toBe('空白');
  });

  it('名字本身就是扩展名时返回空串，由调用方兜底默认名', () => {
    expect(stripDrawingExtension('.mxweb')).toBe('');
    expect(stripDrawingExtension('.dwg')).toBe('');
  });
});

describe('@cloudcad/platform · files/stripMxwebContainer', () => {
  it('剥掉容器层、保留真实图纸格式后缀', () => {
    expect(stripMxwebContainer('plan.dwg.mxweb')).toBe('plan.dwg');
    expect(stripMxwebContainer('plan.mxweb')).toBe('plan');
    expect(stripMxwebContainer('plan.dxf.MXWEB')).toBe('plan.dxf');
  });

  it('多层叠容器一次剥净（引擎导出会再叠一层，回归 mxweb.mxweb）', () => {
    expect(stripMxwebContainer('plan.dwg.mxweb.mxweb')).toBe('plan.dwg');
  });

  it('没有容器后缀的名字原样返回', () => {
    expect(stripMxwebContainer('plan.dwg')).toBe('plan.dwg');
    expect(stripMxwebContainer('untitled')).toBe('untitled');
  });

  it('契约边界：名字只有容器后缀时返回空串（显示层自行兜底）', () => {
    expect(stripMxwebContainer('.mxweb')).toBe('');
  });
});
