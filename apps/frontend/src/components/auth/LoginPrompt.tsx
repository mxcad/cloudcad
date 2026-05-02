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
 * LoginPrompt - 登录提示弹窗
 *
 * 当用户执行需要登录的操作时（如保存、另存为、打开我的图纸等），
 * 显示此弹窗提示用户登录。
 */
import React from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { LogIn } from 'lucide-react';

interface LoginPromptProps {
  isOpen: boolean;
  action: string;
  onLogin: () => void;
  onClose: () => void;
}

export const LoginPrompt: React.FC<LoginPromptProps> = ({
  isOpen,
  action,
  onLogin,
  onClose,
}) => {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="需要登录"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            稍后再说
          </Button>
          <Button variant="primary" onClick={onLogin}>
            <LogIn size={16} className="mr-2" />
            立即登录
          </Button>
        </>
      }
    >
      <div className="text-center py-6">
        <div
          className="mx-auto flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
          style={{ background: 'var(--primary-dim)' }}
        >
          <LogIn size={28} style={{ color: 'var(--primary-500)' }} />
        </div>
        <h3
          className="text-xl font-bold mb-2"
          style={{ color: 'var(--text-primary)' }}
        >
          登录以继续操作
        </h3>
        <p className="text-sm mb-2" style={{ color: 'var(--text-tertiary)' }}>
          「{action}」功能需要登录后才能使用
        </p>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          登录后可使用完整功能，包括保存文件、管理项目等
        </p>
      </div>
    </Modal>
  );
};

export default LoginPrompt;
