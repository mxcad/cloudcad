import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fontsControllerGetFonts,
  fontsControllerUploadFont,
  fontsControllerDeleteFont,
  fontsControllerDownloadFont,
} from '@/api-sdk';
import type { FontInfo } from '../types/filesystem';

const FONTS_KEY = ['fonts'] as const;

export interface UseFontCRUDOptions {
  location?: 'backend' | 'frontend';
}

export function useFontCRUD(options: UseFontCRUDOptions = {}) {
  const queryClient = useQueryClient();
  const location = options.location || 'backend';

  const {
    data: fonts = [],
    isLoading,
    error: queryError,
  } = useQuery({
    queryKey: [...FONTS_KEY, location],
    queryFn: async () => {
      const result = await fontsControllerGetFonts({ query: { location } });
      if (result.error) throw result.error;
      let fontsData: any = result.data;
      if (fontsData && typeof fontsData === 'object' && !Array.isArray(fontsData) && 'data' in fontsData) {
        fontsData = fontsData.data || [];
      }
      return Array.isArray(fontsData) ? fontsData : [];
    },
  });

  const uploadMutation = useMutation({
    mutationFn: (data: { file: File; target: 'backend' | 'frontend' | 'both' }) => {
      const formData = new FormData();
      formData.append('file', data.file);
      formData.append('target', data.target);
      return fontsControllerUploadFont({ body: formData as any });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FONTS_KEY }),
  });

  const deleteMutation = useMutation({
    mutationFn: ({ fileName, target }: { fileName: string; target: 'backend' | 'frontend' }) =>
      fontsControllerDeleteFont({ path: { fileName }, query: { target } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FONTS_KEY }),
  });

  const downloadMutation = useMutation({
    mutationFn: ({ fileName, location }: { fileName: string; location: 'backend' | 'frontend' }) =>
      fontsControllerDownloadFont({
        path: { fileName },
        query: { location },
        responseStyle: 'blob' as any,
      }),
  });

  const error =
    queryError
      ? '获取字体列表失败'
      : uploadMutation.isError
        ? '上传字体失败'
        : deleteMutation.isError
          ? '删除字体失败'
          : downloadMutation.isError
            ? '下载字体失败'
            : null;

  return {
    fonts: fonts as FontInfo[],
    loading: isLoading,
    isLoading,
    error,
    uploadFont: async (file: File, target: 'backend' | 'frontend' | 'both') => {
      await uploadMutation.mutateAsync({ file, target });
    },
    deleteFont: async (fileName: string, target: 'backend' | 'frontend') => {
      await deleteMutation.mutateAsync({ fileName, target });
    },
    downloadFont: async (fileName: string, location: 'backend' | 'frontend') => {
      const result = await downloadMutation.mutateAsync({ fileName, location });
      return result.data;
    },
    reloadFonts: () => queryClient.invalidateQueries({ queryKey: [...FONTS_KEY, location] }),
  };
}