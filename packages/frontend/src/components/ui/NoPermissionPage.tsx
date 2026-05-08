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

import React from 'react';
import { ShieldAlert } from 'lucide-react';

const NoPermissionPage: React.FC = () => {
  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <div
        className="flex items-center justify-center w-20 h-20 rounded-full"
        style={{ background: 'var(--bg-tertiary)' }}
      >
        <ShieldAlert size={40} style={{ color: 'var(--text-tertiary)' }} />
      </div>

      <div className="flex flex-col items-center gap-2 text-center">
        <h2 style={{ color: 'var(--text-primary)' }} className="text-xl font-semibold">
          访问受限
        </h2>
        <p style={{ color: 'var(--text-secondary)' }} className="text-sm max-w-md">
          您没有权限访问此页面，请联系管理员获取相应权限。
        </p>
      </div>
    </div>
  );
};

export default NoPermissionPage;
