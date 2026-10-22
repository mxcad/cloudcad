///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright statement.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { describe, it, expect } from 'vitest';
import { resolvePopupPlacement } from './Autocomplete';

describe('resolvePopupPlacement', () => {
  it('下方空间足够时向下展开，高度取上限', () => {
    expect(resolvePopupPlacement({ top: 100, bottom: 132 }, 800)).toEqual({
      side: 'bottom',
      maxHeight: 280,
    });
  });

  it('下方放不下但上方放得下时改向上展开，不再撑高页面', () => {
    expect(resolvePopupPlacement({ top: 300, bottom: 332 }, 340)).toEqual({
      side: 'top',
      maxHeight: 280,
    });
  });

  it('上方空间也不足时高度收窄到可用空间，不溢出容器', () => {
    expect(resolvePopupPlacement({ top: 40, bottom: 72 }, 100)).toEqual({
      side: 'top',
      maxHeight: 32,
    });
  });

  it('两侧都不够时取空间更大的一侧并收窄', () => {
    expect(resolvePopupPlacement({ top: 12, bottom: 72 }, 100)).toEqual({
      side: 'bottom',
      maxHeight: 20,
    });
  });
});
