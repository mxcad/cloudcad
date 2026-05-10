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

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useExternalReferenceUpload } from './useExternalReferenceUpload';

// Mock authCheck to return true
vi.mock('../utils/authCheck', () => ({
  isAuthenticated: () => true,
}));

// Mock uploadBlobWithTus
vi.mock('../utils/uppyUploadUtils', () => ({
  uploadBlobWithTus: vi.fn(),
}));

// Mock SDK (still needed for preloading data + existence checks)
vi.mock('@/api-sdk', () => ({
  mxCadControllerGetPreloadingData: vi.fn(),
  mxCadControllerCheckExternalReference: vi.fn(),
  mxCadControllerUploadExtReferenceDwg: vi.fn(),
  mxCadControllerUploadExtReferenceImage: vi.fn(),
  publicFileControllerGetPreloadingData: vi.fn(),
  publicFileControllerCheckExtReference: vi.fn(),
}));

import {
  mxCadControllerGetPreloadingData,
  mxCadControllerCheckExternalReference,
} from '@/api-sdk';

describe('useExternalReferenceUpload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should initialize with correct state', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('should detect missing external references', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };

    vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(mxCadControllerCheckExternalReference).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.isOpen).toBe(true);
    expect(result.current.files.length).toBe(2);
  });

  it('should not open modal when no missing references', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: [],
      externalReference: [],
    };

    vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('should return false on preloading data failure', async () => {
    vi.mocked(mxCadControllerGetPreloadingData).mockRejectedValue(
      new Error('Network error')
    );

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(false);
    expect(result.current.isOpen).toBe(false);
  });

  it('should skip upload correctly', () => {
    const onSkip = vi.fn();

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSkip,
      })
    );

    act(() => {
      result.current.skip();
    });

    expect(onSkip).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
  });

  it('should close modal correctly', () => {
    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    act(() => {
      result.current.close();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.files).toEqual([]);
  });

  it('should call onSuccess when all files uploaded successfully', async () => {
    const onSuccess = vi.fn();
    const { uploadBlobWithTus } = await import('../utils/uppyUploadUtils');

    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png'],
      externalReference: ['ref1.dwg'],
    };

    vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(mxCadControllerCheckExternalReference).mockResolvedValue({
      data: { exists: false },
    } as any);

    vi.mocked(uploadBlobWithTus).mockResolvedValue({});

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
        onSuccess,
      })
    );

    await act(async () => {
      await result.current.checkMissingReferences();
    });

    // Set file sources
    const mockFile = new File(['content'], 'ref1.dwg', { type: 'application/octet-stream' });
    const mockImageFile = new File(['image'], 'image1.png', { type: 'image/png' });

    result.current.files.forEach((file) => {
      if (file.name === 'ref1.dwg') (file as any).source = mockFile;
      if (file.name === 'image1.png') (file as any).source = mockImageFile;
    });

    await act(async () => {
      await result.current.uploadFiles();
    });

    act(() => {
      result.current.complete();
    });

    expect(onSuccess).toHaveBeenCalled();
  });

  it('should filter out already-existing external references', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['image1.png', 'image2.png'],
      externalReference: ['ref1.dwg', 'ref2.dwg'],
    };

    vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(mxCadControllerCheckExternalReference)
      .mockResolvedValueOnce({ data: { exists: true } } as any)
      .mockResolvedValueOnce({ data: { exists: false } } as any)
      .mockResolvedValueOnce({ data: { exists: true } } as any)
      .mockResolvedValueOnce({ data: { exists: false } } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.files.length).toBe(2);
    expect(result.current.files.map((f) => f.name)).toEqual([
      'ref2.dwg',
      'image2.png',
    ]);
  });

  it('should filter out HTTP/HTTPS prefixed URLs', async () => {
    const mockPreloadingData = {
      tz: false,
      src_file_md5: 'testhash123',
      images: ['http://example.com/image1.png', 'local_image.png'],
      externalReference: ['local_ref.dwg'],
    };

    vi.mocked(mxCadControllerGetPreloadingData).mockResolvedValue({
      data: mockPreloadingData,
    } as any);

    vi.mocked(mxCadControllerCheckExternalReference).mockResolvedValue({
      data: { exists: false },
    } as any);

    const { result } = renderHook(() =>
      useExternalReferenceUpload({
        nodeId: 'testnode123',
      })
    );

    let hasMissing = false;
    await act(async () => {
      hasMissing = await result.current.checkMissingReferences();
    });

    expect(hasMissing).toBe(true);
    expect(result.current.files.length).toBe(2);
    expect(result.current.files.map((f) => f.name)).toContain('local_image.png');
    expect(result.current.files.map((f) => f.name)).not.toContain('http://example.com/image1.png');
  });
});