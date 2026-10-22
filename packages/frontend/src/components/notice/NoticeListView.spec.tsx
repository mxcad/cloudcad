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

/**
 * 通知列表视图的渲染回归：两种视图的切换、卡片的详情进出、头部开关与空态。
 *
 * 断言只依赖用户可见文本，不 mock 本组件的任何依赖（i18n、日期工具都走真实
 * 实现）——否则视图切换的断言只会验到 mock 的形状。视图间用「正文摘要是否
 * 出现」区分：时间线是紧凑事件流，不带摘要。
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

import { t } from '@/languages';

import { NoticeListView } from './NoticeListView';
import type { Notice } from './noticeTypes';

const BODY = '本月配额已用 80%，超出后转换会排队';

function notice(overrides: Partial<Notice> = {}): Notice {
  return {
    id: 'n_1',
    kind: 'system',
    level: 'warning',
    title: '转换配额即将用尽',
    body: BODY,
    autoExpire: false,
    publishedAt: '2026-09-17T00:00:00.000Z',
    createdAt: '2026-09-17T00:00:00.000Z',
    updatedAt: '2026-09-17T00:00:00.000Z',
    ...overrides,
  };
}

function renderView(
  props: Partial<Parameters<typeof NoticeListView>[0]> = {}
) {
  const onView = vi.fn();
  render(
    <NoticeListView
      notices={[notice()]}
      isViewed={() => false}
      onView={onView}
      {...props}
    />
  );
  return onView;
}

describe('NoticeListView', () => {
  it('默认通知视图：卡片带标题与正文摘要', () => {
    renderView();
    expect(screen.getByText(t('通知中心'))).toBeInTheDocument();
    expect(screen.getByText(t('公告与系统消息'))).toBeInTheDocument();
    expect(screen.getByText('转换配额即将用尽')).toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it('切到时间线视图：紧凑事件流不带正文摘要', () => {
    renderView();
    fireEvent.click(screen.getByText(t('时间线')));
    expect(screen.queryByText(BODY)).not.toBeInTheDocument();
    expect(screen.getByText('转换配额即将用尽')).toBeInTheDocument();
    // 时间线一行同时给相对时间与完整时间戳，用分隔符区分两种视图
    expect(screen.getByText(/·/)).toBeInTheDocument();
  });

  it('切回通知视图：摘要恢复', () => {
    renderView();
    fireEvent.click(screen.getByText(t('时间线')));
    fireEvent.click(screen.getByText(t('通知')));
    expect(screen.getByText(BODY)).toBeInTheDocument();
  });

  it('点卡片进详情：显示返回按钮，返回后回列表', () => {
    const onView = renderView();
    fireEvent.click(screen.getByText('转换配额即将用尽'));
    expect(screen.getByText(t('返回'))).toBeInTheDocument();
    expect(onView).toHaveBeenCalledWith('n_1');
    fireEvent.click(screen.getByText(t('返回')));
    expect(screen.queryByText(t('返回'))).not.toBeInTheDocument();
    expect(screen.getByText(t('通知中心'))).toBeInTheDocument();
  });

  it('详情态下视图切换按钮不再出现', () => {
    renderView();
    fireEvent.click(screen.getByText('转换配额即将用尽'));
    expect(screen.queryByText(t('时间线'))).not.toBeInTheDocument();
  });

  it('showHeader=false 不渲染内置头部，视图切换仍可用', () => {
    renderView({ showHeader: false });
    expect(screen.queryByText(t('通知中心'))).not.toBeInTheDocument();
    expect(screen.getByText(BODY)).toBeInTheDocument();
    fireEvent.click(screen.getByText(t('时间线')));
    expect(screen.queryByText(BODY)).not.toBeInTheDocument();
  });

  it('空列表显示空态', () => {
    renderView({ notices: [] });
    expect(screen.getByText(t('暂无通知'))).toBeInTheDocument();
  });
});
