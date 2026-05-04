///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
// The code, documentation, and related materials of this software belong to
// Chengdu Dream Kaide Technology Co., Ltd. Applications that include this
// software must include the following copyright notice.
// This application should reach an agreement with Chengdu Dream Kaide
// Technology Co., Ltd. to use this software, its documentation, or related
// materials.
// https://www.mxdraw.com/
///////////////////////////////////////////////////////////////////////////////
import { SetMetadata } from '@nestjs/common';
export const IS_CSRF_PROTECTED_KEY = 'isCsrfProtected';
export const CsrfProtected = () => SetMetadata(IS_CSRF_PROTECTED_KEY, true);
//# sourceMappingURL=csrf-protected.decorator.js.map