///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** 合并 className（clsx + tailwind-merge，shadcn/ui 组件约定） */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
