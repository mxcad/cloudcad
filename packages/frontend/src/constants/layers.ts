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
 * CSS z-index layer constants.
 *
 * All z-index values in the app MUST reference these constants.
 * Gaps between layers leave room for future intermediate layers.
 *
 * Usage:
 *   import { Z_LAYERS } from '@/constants/layers';
 *   style={{ zIndex: Z_LAYERS.MODAL }}
 */
export const Z_LAYERS = {
  /** Dynamic background (ParticleBackground, etc.) */
  BACKGROUND: 0,
  /** Normal page content */
  CONTENT: 10,
  /** Sidebar panels */
  SIDEBAR: 100,
  /** CAD editor canvas */
  CAD_EDITOR: 1000,
  /** Semi-transparent overlays / backdrops */
  OVERLAY: 5000,
  /** Modal dialogs (via <Modal> component or direct createPortal) */
  MODAL: 10000,
  /** Tooltips */
  TOOLTIP: 50000,
  /** Toast notifications — highest priority, always on top */
  TOAST: 100000,
} as const;

export type ZLayer = (typeof Z_LAYERS)[keyof typeof Z_LAYERS];
