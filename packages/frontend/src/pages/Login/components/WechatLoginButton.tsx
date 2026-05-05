///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';
import { MessageCircle } from 'lucide-react';

interface WechatLoginButtonProps {
  onWechatLogin: () => void;
}

export const WechatLoginButton: React.FC<WechatLoginButtonProps> = ({ onWechatLogin }) => {
  return (
    <>
      <div className="divider">
        <span>其他登录方式</span>
      </div>
      <button type="button" onClick={onWechatLogin} className="wechat-login-button">
        <MessageCircle size={20} />
        <span>微信登录</span>
      </button>
    </>
  );
};
