///////////////////////////////////////////////////////////////////////////////
// FormatPolicy（格式决策单一出口）单元测试
// 覆盖：路由（needsConversion）/ format→targetExt / pdfParams 默认值（'2000'/'2000'/'mono'）
// / dwgVersion 透传 / 未知格式与直取格式进转换层的显式报错
// 缓存键一致性：pdf 默认值派生的 paramKey 与既有 buildParamKey 输出逐字节一致
///////////////////////////////////////////////////////////////////////////////

import { BadRequestException } from '@nestjs/common';
import { CadDownloadFormat } from '../dto/download-node.dto';
import {
  OUTPUT_FORMATS,
  PDF_DEFAULT_COLOR_POLICY,
  PDF_DEFAULT_HEIGHT,
  PDF_DEFAULT_WIDTH,
  conversionTargetExt,
  formatUnsupportedMessage,
  isConvertibleSourceExt,
  isDirectFormat,
  resolveOutputFormat,
} from './format-policy';

describe('OUTPUT_FORMATS（格式白名单单一事实源）', () => {
  it('包含 mxweb/dwg/dxf/pdf/original 五种格式', () => {
    expect(OUTPUT_FORMATS).toEqual(['mxweb', 'dwg', 'dxf', 'pdf', 'original']);
  });
});

describe('isDirectFormat（直取格式路由）', () => {
  it('mxweb/original 为直取，dwg/dxf/pdf 不是', () => {
    expect(isDirectFormat('mxweb')).toBe(true);
    expect(isDirectFormat('original')).toBe(true);
    expect(isDirectFormat('dwg')).toBe(false);
    expect(isDirectFormat('dxf')).toBe(false);
    expect(isDirectFormat('pdf')).toBe(false);
  });
});

describe('isConvertibleSourceExt（可转换源扩展名）', () => {
  it('.dwg/.dxf/.mxweb 可转换，其余不可', () => {
    expect(isConvertibleSourceExt('.dwg')).toBe(true);
    expect(isConvertibleSourceExt('.dxf')).toBe(true);
    expect(isConvertibleSourceExt('.mxweb')).toBe(true);
    expect(isConvertibleSourceExt('.pdf')).toBe(false);
    expect(isConvertibleSourceExt('.zip')).toBe(false);
  });
});

describe('resolveOutputFormat（pdf：默认值与透传）', () => {
  it('无参数时应用默认值 2000/2000/mono', () => {
    const resolved = resolveOutputFormat('pdf');
    expect(resolved.needsConversion).toBe(true);
    expect(resolved.cadFormat).toBe(CadDownloadFormat.PDF);
    expect(resolved.targetExt).toBe('.pdf');
    expect(resolved.engineParams).toEqual({
      width: '2000',
      height: '2000',
      colorPolicy: 'mono',
    });
  });

  it('默认值常量与既有缓存 paramKey 形状一致（2000x2000-mono）', () => {
    expect(PDF_DEFAULT_WIDTH).toBe('2000');
    expect(PDF_DEFAULT_HEIGHT).toBe('2000');
    expect(PDF_DEFAULT_COLOR_POLICY).toBe('mono');
  });

  it('完整参数透传不覆盖', () => {
    const resolved = resolveOutputFormat('pdf', {
      width: '3000',
      height: '2100',
      colorPolicy: 'color',
    });
    expect(resolved.engineParams).toEqual({
      width: '3000',
      height: '2100',
      colorPolicy: 'color',
    });
  });

  it('部分参数缺失时逐项补默认值', () => {
    const resolved = resolveOutputFormat('pdf', { width: '3000' });
    expect(resolved.engineParams).toEqual({
      width: '3000',
      height: '2000',
      colorPolicy: 'mono',
    });
  });

  it('pdf 不携带 dwgVersion', () => {
    const resolved = resolveOutputFormat('pdf', { dwgVersion: 29 });
    expect(resolved.engineParams).not.toHaveProperty('dwgVersion');
  });
});

describe('resolveOutputFormat（dwg/dxf：版本透传）', () => {
  it('dwg：无版本时 engineParams 为 undefined（不下发空参数对象）', () => {
    const resolved = resolveOutputFormat('dwg');
    expect(resolved.needsConversion).toBe(true);
    expect(resolved.cadFormat).toBe(CadDownloadFormat.DWG);
    expect(resolved.targetExt).toBe('.dwg');
    expect(resolved.engineParams).toBeUndefined();
  });

  it('dwg：dwgVersion 透传', () => {
    const resolved = resolveOutputFormat('dwg', { dwgVersion: 29 });
    expect(resolved.engineParams).toEqual({ dwgVersion: 29 });
  });

  it('dxf：无版本时不携带宽高颜色，dwgVersion 透传', () => {
    const withoutVersion = resolveOutputFormat('dxf');
    expect(withoutVersion.cadFormat).toBe(CadDownloadFormat.DXF);
    expect(withoutVersion.targetExt).toBe('.dxf');
    expect(withoutVersion.engineParams).toBeUndefined();

    const withVersion = resolveOutputFormat('dxf', { dwgVersion: 24 });
    expect(withVersion.engineParams).toEqual({ dwgVersion: 24 });
  });
});

describe('resolveOutputFormat（直取格式与未知格式）', () => {
  it('mxweb/original 直取：不转换、无枚举、无扩展名', () => {
    for (const format of ['mxweb', 'original']) {
      const resolved = resolveOutputFormat(format);
      expect(resolved.needsConversion).toBe(false);
      expect(resolved.cadFormat).toBeUndefined();
      expect(resolved.targetExt).toBe('');
    }
  });

  it('未知格式显式抛 BadRequestException（不再静默当 PDF 产出错误内容）', () => {
    expect(() => resolveOutputFormat('step')).toThrow(BadRequestException);
    expect(() => resolveOutputFormat('step')).toThrow(
      '不支持的下载格式: step'
    );
  });
});

describe('conversionTargetExt（转换格式 → 产物扩展名）', () => {
  it('dwg/dxf/pdf 映射正确', () => {
    expect(conversionTargetExt(CadDownloadFormat.DWG)).toBe('.dwg');
    expect(conversionTargetExt(CadDownloadFormat.DXF)).toBe('.dxf');
    expect(conversionTargetExt(CadDownloadFormat.PDF)).toBe('.pdf');
  });

  it('直取格式（MXWEB）没有转换产物，传入即抛错', () => {
    expect(() => conversionTargetExt(CadDownloadFormat.MXWEB)).toThrow(
      BadRequestException
    );
  });
});

describe('formatUnsupportedMessage（统一报错文案）', () => {
  it('无 i18n 上下文时回退中文文案', () => {
    expect(formatUnsupportedMessage('abc')).toBe('不支持的下载格式: abc');
  });
});
