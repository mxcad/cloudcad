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

// @deprecated Use @/api-sdk instead.
import {
  fontsControllerGetFonts,
  fontsControllerUploadFont,
  fontsControllerDeleteFont,
  fontsControllerDownloadFont,
} from '@/api-sdk';
import type { UploadFontDto } from '@/api-sdk/types.gen';

type FontTarget = UploadFontDto['target'];
type FontLocation = Exclude<FontTarget, 'both'>;

export const fontsApi = {
  getFonts: (location?: FontLocation) =>
    fontsControllerGetFonts(
      location ? { query: { location } } : undefined
    ),

  uploadFont: (file: File, target: FontTarget = 'both') => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('target', target);
    return fontsControllerUploadFont({
      body: formData as unknown as UploadFontDto,
    });
  },

  deleteFont: (fileName: string, target: FontTarget = 'both') =>
    fontsControllerDeleteFont({
      path: { fileName },
      query: { target },
    }),

  downloadFont: (fileName: string, location: FontLocation) =>
    fontsControllerDownloadFont({
      path: { fileName },
      query: { location },
    }),
};