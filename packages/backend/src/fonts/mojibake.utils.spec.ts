///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import {
  decodeMojibakeFileName,
  encodeMojibakeFileName,
} from './mojibake.utils';

/**
 * 模拟 busboy 的 latin1 解码：UTF-8 字节逐字节映射为 latin1 字符。
 * 注意真实乱码中包含 U+0085/U+0091/U+009B 等控制字符，
 * 不要用手写「›…‘」等视觉近似字符替代（它们超出 latin1 范围，会导致误判）。
 */
const mojibakeOf = (name: string): string =>
  Buffer.from(name, 'utf8').toString('latin1');

describe('mojibake.utils', () => {
  describe('decodeMojibakeFileName', () => {
    it('纯 ASCII 文件名保持原样', () => {
      expect(decodeMojibakeFileName('Arial.ttf')).toBe('Arial.ttf');
    });

    it('正常中文文件名（CJK 字符）不误转换', () => {
      expect(decodeMojibakeFileName('微软雅黑.ttf')).toBe('微软雅黑.ttf');
      expect(decodeMojibakeFileName('思源宋体 Regular.otf')).toBe(
        '思源宋体 Regular.otf'
      );
    });

    it('UTF-8 中文被 latin1 误解码的乱码名被修复', () => {
      // 真实乱码含控制字符：\u00E5\u00BE\u00AE...\u0091（不是可打印的 ›…‘）
      expect(decodeMojibakeFileName(mojibakeOf('微软雅黑.ttf'))).toBe(
        '微软雅黑.ttf'
      );
    });

    it('乱码名中混有 ASCII 片段同样可修复', () => {
      expect(
        decodeMojibakeFileName(mojibakeOf('微软雅黑 Regular.ttf'))
      ).toBe('微软雅黑 Regular.ttf');
    });

    it('合法的 latin-1 文本（如法语名）不误转换', () => {
      // é (U+00E9) 单字节 latin1→utf8 会产生替换字符，判定为非乱码
      expect(decodeMojibakeFileName('café.ttf')).toBe('café.ttf');
    });

    it('俄文等非 latin-1 区字符不误转换', () => {
      expect(decodeMojibakeFileName('Шрифт.ttf')).toBe('Шрифт.ttf');
    });
  });

  describe('encodeMojibakeFileName', () => {
    it('UTF-8 中文名编码回 latin1 乱码形式（与解码互逆）', () => {
      const mojibake = encodeMojibakeFileName('微软雅黑.ttf');
      expect(mojibake).toBe(mojibakeOf('微软雅黑.ttf'));
      expect(decodeMojibakeFileName(mojibake)).toBe('微软雅黑.ttf');
    });

    it('纯 ASCII 名保持原样', () => {
      expect(encodeMojibakeFileName('Arial.ttf')).toBe('Arial.ttf');
    });
  });
});
