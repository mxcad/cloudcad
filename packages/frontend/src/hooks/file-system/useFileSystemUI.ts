///////////////////////////////////////////////////////////////////////////////
// 版权所有（C）2002-2022，成都梦想凯德科技有限公司。
// Copyright (C) 2002-2022, Chengdu Dream Kaide Technology Co., Ltd.
// 本软件代码及其文档和相关资料归成都梦想凯德科技有限公司,应用包含本软件的程序必须包括以下版权声明
// The code, documentation, and related materials of this software belong to Chengdu Dream Kaide Technology Co., Ltd. Applications that include this software must include the following copyright statement
// 此应用程序应与成都梦想凯德科技有限公司达成协议，使用本软件、其文档或相关材料
// This application should reach an agreement with Chengdu Dream Kaide Technology Co., Ltd. to use this software, its documentation, or related materials
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { useState, useCallback, useRef, useEffect } from 'react';
import { Toast } from '../../components/ui/Toast';

export const useFileSystemUI = () => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => void;
    type?: 'danger' | 'warning' | 'info';
  }>({
    isOpen: false,
    title: '',
    message: '',
    confirmText: undefined,
    onConfirm: () => {},
    type: 'warning',
  });

  const timerRefs = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    return () => {
      timerRefs.current.forEach((timerId) => clearTimeout(timerId));
      timerRefs.current.clear();
    };
  }, []);

  const showToast = useCallback(
    (message: string, type: Toast['type'] = 'info') => {
      const id = Date.now().toString();
      setToasts((prev) => [...prev, { id, type, message }]);

      const timerId = setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
        timerRefs.current.delete(timerId);
      }, 5000);
      timerRefs.current.add(timerId);
    },
    []
  );

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showConfirm = useCallback(
    (
      title: string,
      message: string,
      onConfirm: () => void,
      type: 'danger' | 'warning' | 'info' = 'warning',
      confirmText: string = '确定'
    ) => {
      setConfirmDialog({
        isOpen: true,
        title,
        message,
        confirmText,
        onConfirm: () => {
          onConfirm();
          closeConfirm();
        },
        type,
      });
    },
    []
  );

  const closeConfirm = useCallback(() => {
    setConfirmDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    toasts,
    confirmDialog,
    showToast,
    removeToast,
    showConfirm,
    closeConfirm,
  };
};
