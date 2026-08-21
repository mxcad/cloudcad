///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

/**
 * 用户生命周期事件负载
 */
export interface UserLifecycleEventPayload {
  userId: string;
  email?: string | null;
  username?: string;
  timestamp: Date;
}
