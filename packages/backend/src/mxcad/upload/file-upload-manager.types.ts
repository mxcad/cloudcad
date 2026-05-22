///////////////////////////////////////////////////////////////////////////////
// Copyright (C) 2002-2026, Chengdu Dream Kaide Technology Co., Ltd.
// All rights reserved.
///////////////////////////////////////////////////////////////////////////////

import { MxUploadReturn } from '../enums/mxcad-return.enum';

export interface UploadChunkOptions {
  hash: string;
  name: string;
  size: number;
  chunk: number;
  chunks: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
  skipDb?: boolean;
}

export interface MergeOptions {
  hash: string;
  name: string;
  size: number;
  chunks: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
  srcDwgNodeId?: string;
  skipDb?: boolean;
}

export interface MergeResult {
  ret: MxUploadReturn;
  tz?: boolean;
  nodeId?: string;
}

export interface UploadFileOptions {
  filePath: string;
  hash: string;
  name: string;
  size: number;
  context: import('../node/filesystem-node.service').FileSystemNodeContext;
}
