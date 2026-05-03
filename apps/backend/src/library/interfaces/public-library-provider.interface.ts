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

import { LibraryType } from '../../library/library.service';
import { CreateFolderDto } from '../../file-system/dto/create-folder.dto';

export interface IPublicLibraryProvider {
  getLibraryId(): Promise<string>;

  getRootNode(): Promise<any>;

  createFolder(dto: CreateFolderDto): Promise<any>;

  deleteNode(nodeId: string): Promise<any>;
}

export const PUBLIC_LIBRARY_PROVIDER_DRAWING = 'PUBLIC_LIBRARY_PROVIDER_DRAWING';
export const PUBLIC_LIBRARY_PROVIDER_BLOCK = 'PUBLIC_LIBRARY_PROVIDER_BLOCK';
