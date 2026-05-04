///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';

interface WechatVerifyModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: (token: string) => void;
}

/**
 * 微信验证弹窗 - 占位组件
 */
export const WechatVerifyModal: React.FC<WechatVerifyModalProps> = ({
  open,
  onClose,
  onSuccess,
}) => {
  if (!open) return null;

  return null;
};
