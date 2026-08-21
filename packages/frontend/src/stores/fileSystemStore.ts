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

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface FileSystemState {
  // Personal space cache (避免每次进入私人空间页面都重新获取)
  personalSpaceId: string | null;
  personalSpaceIdLoading: boolean;
  setPersonalSpaceId: (id: string | null) => void;
  setPersonalSpaceIdLoading: (loading: boolean) => void;

  // View settings
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;

  // Search
  searchTerm: string;
  setSearchTerm: (term: string) => void;

  // Pagination
  pageSize: number;
  setPageSize: (size: number) => void;
}

export const useFileSystemStore = create<FileSystemState>()(
  persist(
    (set) => ({
      viewMode: 'grid',
      searchTerm: '',
      personalSpaceId: null,
      personalSpaceIdLoading: false,
      pageSize: 30, // 默认 30 项每页

      setPersonalSpaceId: (id) => set({ personalSpaceId: id }),
      setPersonalSpaceIdLoading: (loading) =>
        set({ personalSpaceIdLoading: loading }),
      setPageSize: (size) => set({ pageSize: size }),

      setViewMode: (mode) => {
        set({ viewMode: mode });
      },
      setSearchTerm: (term) => set({ searchTerm: term }),
    }),
    {
      name: 'fileSystemStore',
      partialize: (state) => ({
        pageSize: state.pageSize,
        viewMode: state.viewMode,
      }),
    }
  )
);
