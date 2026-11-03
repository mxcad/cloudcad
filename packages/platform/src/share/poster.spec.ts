import { describe, expect, it } from 'vitest';

import {
  SHARE_POSTER_DEFAULT_LAYOUT,
  SHARE_POSTER_SIZES,
  computeSharePosterLayout,
} from './poster';

describe('@cloudcad/platform · share/poster', () => {
  describe('尺寸预设', () => {
    it('默认布局 = phone（9:16，1080×1920）', () => {
      expect(SHARE_POSTER_DEFAULT_LAYOUT).toBe('phone');
      expect(computeSharePosterLayout().width).toBe(1080);
      expect(computeSharePosterLayout().height).toBe(1920);
    });

    it('三种布局尺寸正确', () => {
      expect(SHARE_POSTER_SIZES.phone).toEqual({ width: 1080, height: 1920 });
      expect(SHARE_POSTER_SIZES.square).toEqual({ width: 1080, height: 1080 });
      expect(SHARE_POSTER_SIZES.landscape).toEqual({
        width: 1920,
        height: 1080,
      });
      expect(computeSharePosterLayout({ layout: 'square' })).toMatchObject({
        width: 1080,
        height: 1080,
      });
      expect(computeSharePosterLayout({ layout: 'landscape' })).toMatchObject({
        width: 1920,
        height: 1080,
      });
    });
  });

  describe('二维码右上角 + 文字正下方（phone 默认）', () => {
    const spec = computeSharePosterLayout();

    it('二维码在右上角（x 近右缘、y 近上缘），不超出海报', () => {
      const { qrRect, width, height } = spec;
      expect(qrRect.x).toBeGreaterThan(width * 0.5);
      expect(qrRect.y).toBeLessThan(height * 0.2);
      expect(qrRect.x + qrRect.width).toBeLessThanOrEqual(width);
      expect(qrRect.y + qrRect.height).toBeLessThanOrEqual(height);
      // 二维码是正方形
      expect(qrRect.width).toBe(qrRect.height);
    });

    it('文字在二维码正下方且与二维码等宽（水平对齐）', () => {
      const { qrRect, textRect } = spec;
      expect(textRect.x).toBe(qrRect.x);
      expect(textRect.width).toBe(qrRect.width);
      expect(textRect.y).toBeGreaterThan(qrRect.y + qrRect.height);
    });

    it('缩略图不超出海报且等比 contain（方形缩略图在竖版内不裁切）', () => {
      const { thumbnailRect, width, height } = spec;
      expect(thumbnailRect.x).toBeGreaterThanOrEqual(0);
      expect(thumbnailRect.y).toBeGreaterThanOrEqual(0);
      expect(thumbnailRect.x + thumbnailRect.width).toBeLessThanOrEqual(width);
      expect(thumbnailRect.y + thumbnailRect.height).toBeLessThanOrEqual(
        height
      );
      // 方形缩略图按宽度 contain → 宽=高
      expect(thumbnailRect.width).toBe(thumbnailRect.height);
    });

    it('底部文件名默认显示（footerRect 非零）', () => {
      const { footerFontSize, footerRect, height } = spec;
      expect(footerFontSize).toBeGreaterThan(0);
      expect(footerRect.width).toBeGreaterThan(0);
      expect(footerRect.y).toBeGreaterThan(height * 0.5);
    });

    it('showFooter=false 时 footer 尺寸为 0', () => {
      const specNoFooter = computeSharePosterLayout({ showFooter: false });
      expect(specNoFooter.footerFontSize).toBe(0);
      expect(specNoFooter.footerRect.width).toBe(0);
    });
  });

  describe('非方形缩略图（contain 不裁切）', () => {
    it('横向缩略图（16:9）在方形海报内以宽为限', () => {
      const spec = computeSharePosterLayout({
        layout: 'square',
        thumbnailAspectRatio: 16 / 9,
      });
      const { thumbnailRect } = spec;
      // 宽=容器宽（横向图以宽为限），高=宽/比例
      expect(thumbnailRect.width).toBeGreaterThan(thumbnailRect.height);
      expect(Math.abs(thumbnailRect.width / thumbnailRect.height - 16 / 9)).toBeLessThan(
        0.02
      );
    });

    it('纵向缩略图（9:16）在竖版海报内以高为限', () => {
      const spec = computeSharePosterLayout({
        layout: 'phone',
        thumbnailAspectRatio: 9 / 16,
      });
      const { thumbnailRect } = spec;
      expect(thumbnailRect.height).toBeGreaterThan(thumbnailRect.width);
      expect(
        Math.abs(thumbnailRect.width / thumbnailRect.height - 9 / 16)
      ).toBeLessThan(0.02);
    });

    it('非法宽高比回落到 1（不除零、不 NaN）', () => {
      for (const bad of [0, -1, NaN, Infinity]) {
        const spec = computeSharePosterLayout({
          thumbnailAspectRatio: bad,
        });
        expect(Number.isFinite(spec.thumbnailRect.width)).toBe(true);
        expect(Number.isFinite(spec.thumbnailRect.height)).toBe(true);
        expect(spec.thumbnailRect.width).toBe(spec.thumbnailRect.height);
      }
    });
  });

  describe('qrScale 动态调整（二维码与文字一体缩放）', () => {
    const base = computeSharePosterLayout();

    it('默认 qrScale=1 时二维码 = 宽 15%', () => {
      expect(base.qrRect.width).toBe(Math.round(1080 * 0.15));
      expect(base.textFontSize).toBe(Math.round(1080 * 0.024));
    });

    it('qrScale 放大：二维码变大，文字随之一体缩放并在二维码下方（y 增大）', () => {
      const scaled = computeSharePosterLayout({ qrScale: 2 });
      expect(scaled.qrRect.width).toBe(base.qrRect.width * 2);
      expect(scaled.qrRect.height).toBe(base.qrRect.height * 2);
      // 「扫一扫看图纸」文字与二维码一体：字号同步放大
      expect(scaled.textFontSize).toBe(base.textFontSize * 2);
      // 文字仍与二维码等宽、在二维码正下方（QR 变大 → 文字下移）
      expect(scaled.textRect.x).toBe(scaled.qrRect.x);
      expect(scaled.textRect.width).toBe(scaled.qrRect.width);
      expect(scaled.textRect.y).toBeGreaterThan(base.textRect.y);
      expect(scaled.textRect.y).toBe(
        scaled.qrRect.y + scaled.qrRect.height + Math.round(scaled.textFontSize * 0.9)
      );
    });

    it('非法缩放（0/负/NaN/Infinity）回落到 1', () => {
      for (const bad of [0, -1, NaN, Infinity]) {
        const spec = computeSharePosterLayout({ qrScale: bad });
        expect(spec.qrRect.width).toBe(base.qrRect.width);
        expect(spec.textFontSize).toBe(base.textFontSize);
      }
    });

    it('二维码放大后不超出海报右缘/上缘', () => {
      const spec = computeSharePosterLayout({ qrScale: 2, layout: 'square' });
      expect(spec.qrRect.x + spec.qrRect.width).toBeLessThanOrEqual(spec.width);
      expect(spec.qrRect.y + spec.qrRect.height).toBeLessThanOrEqual(spec.height);
    });
  });
});
