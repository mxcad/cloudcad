import {
  BookOpen,
  Box,
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Grid3X3,
  Heart,
  Loader2,
  Search,
  Settings,
  SortAsc,
  Tag as TagIcon,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { galleryApi } from '../services/api';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import GalleryTypeManagement from '../components/admin/GalleryTypeManagement';

// 图库类型
type GalleryType = 'drawings' | 'blocks';

// 分类数据接口
interface GalleryTypeData {
  id: number;
  pid: number;
  name: string;
  pname: string;
  status: number;
}

// 图库文件接口
interface GalleryFile {
  uuid: string;
  filename: string;
  firstType: number;
  secondType: number;
  filehash: string;
  type: string;
  lookNum: number;
  likeNum: number;
  collect: boolean;
}

// 分页信息接口
interface PaginationInfo {
  index: number;
  size: number;
  count: number;
  max: number;
  up: boolean;
  down: boolean;
}

// 图库主页面组件
export default function Gallery() {
  // 根据路由确定默认图库类型
  const location = useLocation();
  const isBlocksRoute = location.pathname === '/blocks';

  // 状态管理
  const [galleryType, setGalleryType] = useState<GalleryType>(isBlocksRoute ? 'blocks' : 'drawings');
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [isTypeManagementOpen, setIsTypeManagementOpen] = useState(false);
  const [showCollectOnly, setShowCollectOnly] = useState(false);

  // 获取分类列表
  const fetchTypes = async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      if (response.data?.code === 'success') {
        setTypes(response.data.result?.allblocks || []);
      }
    } catch (error) {
      console.error('获取分类列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 获取文件列表
  const fetchFiles = async (index: number = pageIndex) => {
    try {
      setLoading(true);

      // 如果是"我的收藏"模式，获取收藏列表
      if (showCollectOnly) {
        const response = await galleryApi.getCollectList(
          galleryType,
          index,
          20
        );

        if (response.data) {
          setFiles(response.data.sharedwgs || []);
          setPagination(response.data.page);
          setPageIndex(index);
        }
      } else {
        // 普通模式，获取文件列表
        const response =
          galleryType === 'drawings'
            ? await galleryApi.getDrawingsFileList({
                keywords: searchKeyword,
                firstType: selectedFirstType === -1 ? undefined : selectedFirstType,
                secondType: selectedSecondType === -1 ? undefined : selectedSecondType,
                thirdType: selectedThirdType === -1 ? undefined : selectedThirdType,
                pageIndex: index,
                pageSize: 20,
              })
            : await galleryApi.getBlocksFileList({
                keywords: searchKeyword,
                firstType: selectedFirstType === -1 ? undefined : selectedFirstType,
                secondType: selectedSecondType === -1 ? undefined : selectedSecondType,
                thirdType: selectedThirdType === -1 ? undefined : selectedThirdType,
                pageIndex: index,
                pageSize: 20,
              });

        if (response.data) {
          setFiles(response.data.sharedwgs || []);
          setPagination(response.data.page);
          setPageIndex(index);
        }
      }
    } catch (error) {
      console.error('获取文件列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 处理搜索
  const handleSearch = () => {
    setPageIndex(0);
    fetchFiles(0);
  };

  // 处理分类切换
  useEffect(() => {
    setTypes([]);
    setFiles([]);
    setSelectedFirstType(-1);
    setSelectedSecondType(-1);
    setPageIndex(0);
    fetchTypes();
  }, [galleryType]);

  // 当分类或搜索关键词变化时，重新获取文件列表
  useEffect(() => {
    if (types.length > 0) {
      fetchFiles(0);
    }
  }, [selectedFirstType, selectedSecondType, selectedThirdType]);

  // 当切换"我的收藏"模式时，重置分类筛选
  useEffect(() => {
    setPageIndex(0);
    if (showCollectOnly) {
      // 收藏模式下，重置分类筛选
      setSelectedFirstType(-1);
      setSelectedSecondType(-1);
      setSelectedThirdType(-1);
    }
    fetchFiles(0);
  }, [showCollectOnly]);

  // 获取一级分类列表
  const firstLevelTypes = types.filter((t) => t.pid === 0);
  const selectedFirstTypeData = firstLevelTypes.find((t) => t.id === selectedFirstType);

  // 获取二级分类列表
  const secondLevelTypes = types.filter((t) => t.pid === selectedFirstType);

  // 获取文件预览图 URL
  const getPreviewImageUrl = (file: GalleryFile): string => {
    return galleryApi.getPreviewImageUrl(
      galleryType,
      file.secondType,
      file.firstType,
      file.filehash
    );
  };

  // 获取文件访问 URL
  const getFileUrl = (file: GalleryFile): string => {
    return galleryApi.getFileUrl(
      galleryType,
      file.secondType,
      file.firstType,
      file.filehash
    );
  };

  // 下载文件
  const handleDownload = (file: GalleryFile) => {
    const url = getFileUrl(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 处理上一页
  const handlePreviousPage = () => {
    if (pagination?.up && pageIndex > 0) {
      fetchFiles(pageIndex - 1);
    }
  };

  // 处理下一页
  const handleNextPage = () => {
    if (pagination?.down && pagination.max && pageIndex < pagination.max - 1) {
      fetchFiles(pageIndex + 1);
    }
  };

  // 处理收藏/取消收藏
  const handleToggleCollect = async (file: GalleryFile) => {
    try {
      const response = await galleryApi.toggleCollect(galleryType, file.uuid);

      // 检查响应状态码和响应体
      if (response.status === 200 && response.data?.code === 'success') {
        // 更新文件列表中的收藏状态
        setFiles((prevFiles) =>
          prevFiles.map((f) =>
            f.uuid === file.uuid
              ? { ...f, collect: response.data.data.collect }
              : f
          )
        );
      } else if (response.status === 400) {
        // 处理业务错误（400状态码）
        const errorMessage = response.data?.message || '收藏操作失败';
        console.error('收藏操作失败:', errorMessage);
        alert(errorMessage);
      } else {
        // 其他错误
        const errorMessage = response.data?.message || '收藏操作失败，请稍后重试';
        console.error('收藏操作失败:', errorMessage);
        alert(errorMessage);
      }
    } catch (error: any) {
      console.error('收藏操作失败:', error);

      // 处理网络错误或服务器错误
      if (error.response) {
        // 服务器返回了错误响应
        const status = error.response.status;
        const errorMessage = error.response.data?.message || '收藏操作失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`收藏操作失败: ${errorMessage}`);
        }
      } else if (error.request) {
        // 请求已发送但没有收到响应
        alert('网络错误，请检查网络连接');
      } else {
        // 其他错误
        alert('收藏操作失败，请稍后重试');
      }
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* 页面标题 */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2 flex items-center gap-3">
              {galleryType === 'drawings' ? (
                <FileText className="w-8 h-8 text-indigo-600" />
              ) : (
                <Box className="w-8 h-8 text-indigo-600" />
              )}
              {galleryType === 'drawings' ? '图纸库' : '图块库'}
            </h1>
            <p className="text-gray-600">
              {galleryType === 'drawings'
                ? '管理和浏览项目中的图纸资源'
                : '管理和浏览项目中的图块资源'}
            </p>
          </div>

          {/* 图库类型切换 */}
          <div className="flex gap-2">
            <Button
              variant={galleryType === 'drawings' ? 'default' : 'ghost'}
              onClick={() => setGalleryType('drawings')}
              className="flex items-center gap-2"
            >
              <FileText size={16} />
              图纸库
            </Button>
            <Button
              variant={galleryType === 'blocks' ? 'default' : 'ghost'}
              onClick={() => setGalleryType('blocks')}
              className="flex items-center gap-2"
            >
              <Box size={16} />
              图块库
            </Button>
          </div>
        </div>

        {/* 操作栏 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            {/* 搜索框 */}
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="搜索文件..."
                value={searchKeyword}
                onChange={(e) => setSearchKeyword(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
              />
            </div>

            {/* 分类筛选 */}
            {!showCollectOnly && (
              <div className="flex flex-col lg:flex-row gap-2 w-full lg:w-auto">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500 whitespace-nowrap">分类:</span>
                  {/* 一级分类 */}
                  <select
                    value={selectedFirstType}
                    onChange={(e) => {
                      setSelectedFirstType(Number(e.target.value));
                      setSelectedSecondType(-1);
                      setSelectedThirdType(-1);
                    }}
                    className="flex-1 lg:flex-none px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  >
                    <option value={-1}>全部</option>
                    {firstLevelTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>

                  {/* 二级分类 */}
                  <select
                    value={selectedSecondType}
                    onChange={(e) => {
                      setSelectedSecondType(Number(e.target.value));
                      setSelectedThirdType(-1);
                    }}
                    disabled={!selectedFirstTypeData}
                    className={`flex-1 lg:flex-none px-3 py-2 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                      !selectedFirstTypeData
                        ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <option value={-1}>
                      {selectedFirstTypeData
                        ? `全部${selectedFirstTypeData.name}`
                        : '请先选择'}
                    </option>
                    {secondLevelTypes.map((type) => (
                      <option key={type.id} value={type.id}>
                        {type.name}
                      </option>
                    ))}
                  </select>

                  {/* 三级分类 */}
                  <select
                    value={selectedThirdType}
                    onChange={(e) => setSelectedThirdType(Number(e.target.value))}
                    disabled={!selectedSecondType}
                    className={`flex-1 lg:flex-none px-3 py-2 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                      !selectedSecondType
                        ? 'bg-gray-100 border border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-gray-50 border border-gray-200'
                    }`}
                  >
                    <option value={-1}>全部子分类</option>
                    {types
                      .filter((t) => t.pid === selectedSecondType)
                      .map((type) => (
                        <option key={type.id} value={type.id}>
                          {type.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
            )}

            {/* 操作按钮 */}
            <div className="flex gap-2 w-full lg:w-auto">
              <Button
                onClick={handleSearch}
                className="flex items-center gap-2"
              >
                <Search size={16} />
                搜索
              </Button>
              <Button
                variant={showCollectOnly ? 'default' : 'outline'}
                onClick={() => setShowCollectOnly(!showCollectOnly)}
                className="flex items-center gap-2"
              >
                <Heart size={16} fill={showCollectOnly ? 'currentColor' : 'none'} />
                {showCollectOnly ? '我的收藏' : '全部文件'}
              </Button>
              <Button
                variant="outline"
                onClick={() => setIsTypeManagementOpen(true)}
                className="flex items-center gap-2"
              >
                <Settings size={16} />
                分类管理
              </Button>
            </div>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {/* 文件计数 */}
          {!loading && files.length > 0 && (
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <span className="text-sm text-gray-600">
                {showCollectOnly ? '我的收藏' : '全部文件'} · 共 {files.length} 个文件
                {pagination && ` (总计 ${pagination.count} 个)`}
              </span>
            </div>
          )}

          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              {galleryType === 'drawings' ? (
                <FileText className="w-12 h-12 mb-4 opacity-50" />
              ) : (
                <Box className="w-12 h-12 mb-4 opacity-50" />
              )}
              <p className="text-lg mb-2">
                {showCollectOnly
                  ? '暂无收藏的文件'
                  : searchKeyword
                  ? '未找到匹配的文件'
                  : '暂无文件'}
              </p>
              {!showCollectOnly && !searchKeyword && (
                <p className="text-sm text-gray-400">
                  在文件管理页面右键点击文件，选择"添加到图库"
                </p>
              )}
            </div>
          ) : (
            <>
              {/* 文件网格 */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 p-4">
                {files.map((file) => (
                  <div
                    key={file.uuid}
                    className="group relative bg-gray-50 rounded-lg overflow-hidden hover:shadow-md transition-all cursor-pointer"
                  >
                    {/* 预览图 */}
                    <div className="aspect-[4/3] bg-gray-200 relative overflow-hidden">
                      <img
                        src={getPreviewImageUrl(file)}
                        alt={file.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23e5e7eb"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%239ca3af" font-size="12"%3E无预览%3C/text%3E%3C/svg%3E';
                        }}
                      />

                      {/* 悬停操作按钮 */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file);
                          }}
                          className="bg-white/90 hover:bg-white"
                        >
                          <Download size={16} />
                        </Button>
                      </div>
                    </div>

                    {/* 文件信息 */}
                    <div className="p-3">
                      <h3 className="text-sm font-medium text-gray-900 truncate mb-2" title={file.filename}>
                        {file.filename}
                      </h3>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                          {file.type}
                        </span>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1 text-xs text-gray-500">
                            <BookOpen size={12} />
                            <span>{file.lookNum}</span>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleCollect(file);
                            }}
                            className={`p-1 rounded-full transition-all hover:scale-110 ${
                              file.collect
                                ? 'text-red-500 bg-red-50'
                                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
                            }`}
                            title={file.collect ? '取消收藏' : '收藏'}
                          >
                            <Heart
                              size={16}
                              fill={file.collect ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 分页 */}
              {pagination && pagination.count > 0 && (
                <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div className="text-sm text-gray-600">
                    共 {pagination.count} 个文件，第 {pagination.index + 1} / {pagination.max} 页
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handlePreviousPage}
                      disabled={!pagination.up}
                    >
                      上一页
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleNextPage}
                      disabled={!pagination.down}
                    >
                      下一页
                    </Button>
                  </div>
                </div>
              )}

              {/* 操作提示 */}
              {!showCollectOnly && files.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <p className="text-xs text-gray-500">
                    💡 提示：点击心形图标收藏文件，点击"我的收藏"按钮查看收藏列表
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 分类管理模态框 */}
      <Modal
        isOpen={isTypeManagementOpen}
        onClose={() => setIsTypeManagementOpen(false)}
      >
        <GalleryTypeManagement
          galleryType={galleryType}
          onClose={() => {
            setIsTypeManagementOpen(false);
            fetchTypes();
          }}
        />
      </Modal>
    </div>
  );
}