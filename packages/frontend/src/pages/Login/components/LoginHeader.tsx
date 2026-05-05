///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import React from 'react';

interface LoginHeaderProps {
  appLogo: string;
  appName: string;
}

export const LoginHeader: React.FC<LoginHeaderProps> = ({ appLogo, appName }) => {
  return (
    <>
      {/* Logo 区域 */}
      <div className="logo-section">
        <div className="logo-wrapper">
          <div className="logo-glow" />
          <img src={appLogo} alt={appName} className="logo-image" />
        </div>
        <h1 className="app-title">{appName}</h1>
        <p className="app-tagline">专业云端 CAD 图纸管理平台</p>
      </div>

      {/* 表单头部 */}
      <div className="form-header">
        <h2 className="form-title">欢迎回来</h2>
        <p className="form-subtitle">登录您的账户以继续</p>
      </div>
    </>
  );
};
