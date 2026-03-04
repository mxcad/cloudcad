import { useState, useEffect, useCallback } from 'react';
import { fontsApi } from '../services';
import { Trash2, Download, Upload } from 'lucide-react';
import { FileNameText } from '../components/ui/TruncateText';
import type { FontInfo } from '../types/filesystem';
import { usePermission } from '../hooks/usePermission';
import { useNotification } from '../contexts/NotificationContext';
import { SystemPermission } from '../constants/permissions';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

interface FontLibraryProps {}

export default function FontLibrary(props: FontLibraryProps) {
  useDocumentTitle('字体库');
  const { hasPermission } = usePermission();
  const { showToast, showConfirm } = useNotification();

  // 所有 Hooks 必须在条件返回之前调用
  const [allFonts, setAllFonts] = useState<FontInfo[]>([]);
  const [fonts, setFonts] = useState<FontInfo[]>([]);
  const [loading, setLoading] = useState(false);

  // 当前标签页：'backend' 或 'frontend'
  const [activeTab, setActiveTab] = useState<'backend' | 'frontend'>('backend');

  // 筛选条件
  const [filters, setFilters] = useState({
    name: '',
    extension: '',
    startTime: '',
    endTime: '',
  });

  // 排序
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  // 上传模态框
  const [showUploadModal, setShowUploadModal] = useState(false);

  // 选中的字体
  const [selectedFonts, setSelectedFonts] = useState<Set<string>>(new Set());

  // 权限检查
  const canReadFonts = hasPermission(SystemPermission.SYSTEM_FONT_READ);
  const canUploadFonts = hasPermission(SystemPermission.SYSTEM_FONT_UPLOAD);
  const canDeleteFonts = hasPermission(SystemPermission.SYSTEM_FONT_DELETE);
  const canDownloadFonts = hasPermission(SystemPermission.SYSTEM_FONT_DOWNLOAD);

  // 获取字体列表
  const fetchFonts = useCallback(async () => {
    if (!canReadFonts) return;
    setLoading(true);
    try {
      const response = await fontsApi.getFonts(activeTab);

      // 获取所有字体数据 - 响应拦截器应该已经解包，但如果没有解包则手动解包
      let fontsData = response.data || [];
      if (fontsData && typeof fontsData === 'object' && 'data' in fontsData) {
        fontsData = fontsData.data || [];
      }

      setAllFonts(Array.isArray(fontsData) ? fontsData : []);
    } catch (error) {
      console.error('获取字体列表失败:', error);
      setAllFonts([]);
    } finally {
      setLoading(false);
    }
  }, [activeTab, canReadFonts]);

  // 处理筛选、排序
  useEffect(() => {
    let filtered = [...allFonts];

    // 筛选
    if (filters.name) {
      filtered = filtered.filter((font) =>
        font.name.toLowerCase().includes(filters.name.toLowerCase())
      );
    }

    if (filters.extension) {
      filtered = filtered.filter(
        (font) => font.extension === filters.extension
      );
    }

    if (filters.startTime) {
      const start = new Date(filters.startTime);
      filtered = filtered.filter((font) => new Date(font.createdAt) >= start);
    }

    if (filters.endTime) {
      const end = new Date(filters.endTime);
      filtered = filtered.filter((font) => new Date(font.createdAt) <= end);
    }

    // 排序
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'size':
          comparison = a.size - b.size;
          break;
        case 'createdAt':
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison =
            new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          comparison = a.name.localeCompare(b.name);
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });

    setFonts(filtered);
  }, [allFonts, filters, sortBy, sortOrder]);

  useEffect(() => {
    fetchFonts();
  }, [fetchFonts]);

  // 如果没有查看权限，返回无权限提示（在所有 Hooks 调用之后）
  if (!canReadFonts) {
    return (
      <div className="p-6 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <p className="text-gray-500">您没有查看字体库的权限</p>
          </div>
        </div>
      </div>
    );
  }

  // 处理筛选条件变化
  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // 重置筛选条件
  const handleReset = () => {
    setFilters({
      name: '',
      extension: '',
      startTime: '',
      endTime: '',
    });
  };

  // 处理排序
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // 处理选中
  const handleSelect = (fontName: string) => {
    setSelectedFonts((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(fontName)) {
        newSet.delete(fontName);
      } else {
        newSet.add(fontName);
      }
      return newSet;
    });
  };

  // 全选/取消全选
  const handleSelectAll = () => {
    if (selectedFonts.size === fonts.length) {
      setSelectedFonts(new Set());
    } else {
      setSelectedFonts(new Set(fonts.map((f) => f.name)));
    }
  };

  // 删除字体
  const handleDelete = async (fontName: string) => {
    const confirmed = await showConfirm({
      title: '确认删除',
      message: `确定要删除字体 "${fontName}" 吗？`,
      type: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      await fontsApi.deleteFont(fontName, activeTab);
      await fetchFonts();
      showToast('删除成功', 'success');
    } catch (error) {
      console.error('删除字体失败:', error);
      showToast('删除字体失败', 'error');
    }
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedFonts.size === 0) {
      showToast('请先选择要删除的字体', 'warning');
      return;
    }

    const confirmed = await showConfirm({
      title: '确认批量删除',
      message: `确定要删除选中的 ${selectedFonts.size} 个字体吗？`,
      type: 'danger',
    });
    if (!confirmed) {
      return;
    }

    try {
      await Promise.all(
        Array.from(selectedFonts).map((fontName) =>
          fontsApi.deleteFont(fontName as string, activeTab)
        )
      );
      setSelectedFonts(new Set());
      await fetchFonts();
      showToast('批量删除成功', 'success');
    } catch (error) {
      console.error('批量删除失败:', error);
      showToast('批量删除失败', 'error');
    }
  };

  // 下载字体
  const handleDownload = async (fontName: string) => {
    try {
      const response = await fontsApi.downloadFont(fontName, activeTab);
      const url = window.URL.createObjectURL(new Blob([response.data as BlobPart]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fontName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载字体失败:', error);
      showToast('下载字体失败', 'error');
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  // 格式化日期
  const formatDate = (date: string | Date): string => {
    const d = new Date(date);
    return d.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <h1 className="text-2xl font-bold text-gray-900 mb-6">字体管理</h1>

        {/* 标签页切换 */}
        <div className="bg-white rounded-lg shadow-sm mb-4">
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => {
                setActiveTab('backend');
                setSelectedFonts(new Set());
              }}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'backend'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              后端字体（转换程序）
            </button>
            <button
              onClick={() => {
                setActiveTab('frontend');
                setSelectedFonts(new Set());
              }}
              className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'frontend'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              前端字体（资源目录）
            </button>
          </div>
        </div>

        {/* 筛选区 */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* 字体名称 */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                字体名称
              </label>
              <input
                type="text"
                placeholder="请输入"
                value={filters.name}
                onChange={(e) => handleFilterChange('name', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* 文件格式 */}
            <div className="w-40">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                文件格式
              </label>
              <select
                value={filters.extension}
                onChange={(e) =>
                  handleFilterChange('extension', e.target.value)
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部</option>
                <option value=".ttf">TTF</option>
                <option value=".otf">OTF</option>
                <option value=".woff">WOFF</option>
                <option value=".woff2">WOFF2</option>
                <option value=".eot">EOT</option>
                <option value=".ttc">TTC</option>
                <option value=".shx">SHX</option>
              </select>
            </div>

            {/* 修改时间 */}
            <div className="flex-1 min-w-[300px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                修改时间
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={filters.startTime}
                  onChange={(e) =>
                    handleFilterChange('startTime', e.target.value)
                  }
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <span className="self-center text-gray-500">-</span>
                <input
                  type="date"
                  value={filters.endTime}
                  onChange={(e) =>
                    handleFilterChange('endTime', e.target.value)
                  }
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* 查询按钮 */}
            <button
              onClick={fetchFonts}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              查询
            </button>

            {/* 重置按钮 */}
            <button
              onClick={handleReset}
              className="px-4 py-2 bg-blue-700 text-white rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700"
            >
              重置
            </button>
          </div>
        </div>

        {/* 操作按钮区 */}
        <div className="flex justify-between items-center mb-4">
          {canUploadFonts && (
            <button
              onClick={() => setShowUploadModal(true)}
              className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2"
            >
              <Upload size={16} />
              上传字体
            </button>
          )}

          {canDeleteFonts && selectedFonts.size > 0 && (
            <button
              onClick={handleBatchDelete}
              className="px-4 py-2 bg-red-500 text-white rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
            >
              批量删除 ({selectedFonts.size})
            </button>
          )}
        </div>

        {/* 表格 */}
        <div className="bg-white rounded-lg shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={
                      selectedFonts.size === fonts.length && fonts.length > 0
                    }
                    onChange={handleSelectAll}
                    className="rounded border-gray-300"
                  />
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  字体文件名
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  操作
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  字体类型
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  创建者
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('size')}
                >
                  文件大小
                  {sortBy === 'size' && (
                    <span className="ml-1">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th
                  className="px-4 py-3 text-left text-sm font-medium text-gray-700 cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('createdAt')}
                >
                  修改时间
                  {sortBy === 'createdAt' && (
                    <span className="ml-1">
                      {sortOrder === 'asc' ? '↑' : '↓'}
                    </span>
                  )}
                </th>
                <th className="px-4 py-3 text-left text-sm font-medium text-gray-700">
                  创建时间
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    加载中...
                  </td>
                </tr>
              ) : fonts.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-8 text-center text-gray-500"
                  >
                    暂无数据
                  </td>
                </tr>
              ) : (
                fonts.map((font) => (
                  <tr key={font.name} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedFonts.has(font.name)}
                        onChange={() => handleSelect(font.name)}
                        className="rounded border-gray-300"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">📝</span>
                        {font.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {canDownloadFonts && (
                          <button
                            onClick={() => handleDownload(font.name)}
                            className="text-gray-500 hover:text-blue-500 focus:outline-none"
                            title="下载"
                          >
                            <Download size={16} />
                          </button>
                        )}
                        {canDeleteFonts && (
                          <button
                            onClick={() => handleDelete(font.name)}
                            className="text-gray-500 hover:text-red-500 focus:outline-none"
                            title="删除"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {font.extension}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {font.creator || '系统管理员'}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatFileSize(font.size)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatDate(font.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {formatDate(font.createdAt)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 字体总数 */}
        <div className="flex justify-between items-center mt-4">
          <div className="text-sm text-gray-600">共 {fonts.length} 条</div>
        </div>

        {/* 上传模态框 */}
        {showUploadModal && (
          <UploadFontModal
            onClose={() => setShowUploadModal(false)}
            onSuccess={() => {
              setShowUploadModal(false);
              fetchFonts();
            }}
            defaultTarget={activeTab}
          />
        )}
      </div>
    </div>
  );
}

// 上传字体模态框组件
interface UploadFontModalProps {
  onClose: () => void;
  onSuccess: () => void;
  defaultTarget?: 'backend' | 'frontend' | 'both';
}

function UploadFontModal({
  onClose,
  onSuccess,
  defaultTarget = 'both',
}: UploadFontModalProps) {
  const { showToast } = useNotification();
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState<'backend' | 'frontend' | 'both'>(
    defaultTarget
  );
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // 验证文件类型
      const validExtensions = [
        '.ttf',
        '.otf',
        '.woff',
        '.woff2',
        '.eot',
        '.ttc',
        '.shx',
      ];
      const ext = '.' + selectedFile.name.split('.').pop()?.toLowerCase();

      if (!validExtensions.includes(ext)) {
        showToast('不支持的文件类型，请上传字体文件', 'warning');
        return;
      }

      // 验证文件大小（10MB）
      if (selectedFile.size > 10 * 1024 * 1024) {
        showToast('文件大小不能超过 10MB', 'warning');
        return;
      }

      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      showToast('请选择文件', 'warning');
      return;
    }

    setUploading(true);
    try {
      await fontsApi.uploadFont(file, target);
      showToast('上传成功', 'success');
      onSuccess();
    } catch (error) {
      console.error('上传失败:', error);
      showToast('上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-4">上传字体</h2>

        {/* 文件选择 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            选择文件
          </label>
          <input
            type="file"
            onChange={handleFileChange}
            accept=".ttf,.otf,.woff,.woff2,.eot,.ttc,.shx"
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          />
          {file && (
            <p className="mt-2 text-sm text-gray-600">
              已选择: <FileNameText>{file.name}</FileNameText> (
              {(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>
          )}
        </div>

        {/* 上传目标 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            上传位置
          </label>
          <select
            value={target}
            onChange={(e) =>
              setTarget(e.target.value as 'backend' | 'frontend' | 'both')
            }
            className="w-full px-3 py-2 border border-gray-300 rounded-md"
          >
            <option value="both">后端和前端（同时上传）</option>
            <option value="backend">仅后端（转换程序使用）</option>
            <option value="frontend">仅前端（Web 显示使用）</option>
          </select>
        </div>

        {/* 按钮 */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
            disabled={uploading}
          >
            取消
          </button>
          <button
            onClick={handleUpload}
            disabled={!file || uploading}
            className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
}
