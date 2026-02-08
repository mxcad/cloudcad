import { BookOpen, Box, FileText, Loader2, Search, Settings, Trash2, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { galleryApi } from '../services/galleryApi';
import { mxcadManager } from '../services/mxcadManager';
import { MxFun } from 'mxdraw';

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
  nodeId: string;
  type: string;
  lookNum: number;
  likeNum: number;
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

// 侧边栏属性
interface CADEditorSidebarProps {
  onInsertFile?: (file: GalleryFile) => void;
}

// 可调整侧边栏组件
export const CADEditorSidebar: React.FC<CADEditorSidebarProps> = ({
  onInsertFile,
}) => {
  // 侧边栏宽度状态
  const [width, setWidth] = useState(300);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  // 图库数据状态
  const [galleryType, setGalleryType] = useState<GalleryType>('drawings');
  const [types, setTypes] = useState<GalleryTypeData[]>([]);
  const [files, setFiles] = useState<GalleryFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedFirstType, setSelectedFirstType] = useState<number>(-1);
  const [selectedSecondType, setSelectedSecondType] = useState<number>(-1);
  const [selectedThirdType, setSelectedThirdType] = useState<number>(-1);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  // 调整宽度处理
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!sidebarRef.current) return;
    const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left;
    if (newWidth >= 200 && newWidth <= 600) {
      setWidth(newWidth);
    }
  };

  // 当侧边栏宽度变化时，调整CAD编辑器容器位置
  useEffect(() => {
    mxcadManager.adjustContainerPosition(isCollapsed ? 0 : width);
  }, [width, isCollapsed]);

  // 监听侧边栏切换命令
  useEffect(() => {
    const handleToggleSidebar = () => {
      setIsCollapsed((prev) => !prev);
      Logger.info(`侧边栏${isCollapsed ? '展开' : '折叠'}`);
    };

    window.addEventListener('mxcad-toggle-sidebar', handleToggleSidebar);

    return () => {
      window.removeEventListener('mxcad-toggle-sidebar', handleToggleSidebar);
    };
  }, [isCollapsed]);

  const handleMouseUp = () => {
    setIsResizing(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };

  // 获取分类列表
  const fetchTypes = async () => {
    try {
      setLoading(true);
      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsTypes()
          : await galleryApi.getBlocksTypes();
      if (response.data?.code === 'success') {
        const newTypes = response.data.result?.allblocks || [];
        setTypes(newTypes);
        fetchFiles(0);
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
      const queryParams = {
        keywords: searchKeyword || undefined,
        firstType: selectedFirstType === -1 ? undefined : selectedFirstType,
        secondType: selectedSecondType === -1 ? undefined : selectedSecondType,
        thirdType: selectedThirdType === -1 ? undefined : selectedThirdType,
        pageIndex: index,
        pageSize: 20,
      };

      const response =
        galleryType === 'drawings'
          ? await galleryApi.getDrawingsFileList(queryParams)
          : await galleryApi.getBlocksFileList(queryParams);

      if (response.data) {
        setFiles(response.data.sharedwgs || []);
        setPagination(response.data.page);
        setPageIndex(index);
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
    if (!isCollapsed) {
      fetchTypes();
    }
  }, [galleryType, isCollapsed]);

  // 当分类或搜索关键词变化时，重新获取文件列表
  useEffect(() => {
    fetchFiles(0);
  }, [selectedFirstType, selectedSecondType, selectedThirdType, searchKeyword]);

  // 获取一级分类列表
  const firstLevelTypes = types.filter((t) => t.pid === 0);
  const selectedFirstTypeData = firstLevelTypes.find(
    (t) => t.id === selectedFirstType
  );

  // 获取二级分类列表
  const secondLevelTypes = types.filter((t) => t.pid === selectedFirstType);
  const selectedSecondTypeData = secondLevelTypes.find(
    (t) => t.id === selectedSecondType
  );

  // 获取三级分类列表
  const thirdLevelTypes = types.filter((t) => t.pid === selectedSecondType);

  // 获取文件预览图 URL
  const getPreviewImageUrl = (file: GalleryFile): string => {
    return galleryApi.getPreviewImageUrl(
      galleryType,
      file.secondType,
      file.firstType,
      file.nodeId
    );
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

  // 处理从图库中移除文件
  const handleRemoveFromGallery = async (file: GalleryFile) => {
    if (
      !confirm(
        `确定要将 "${file.filename}" 从图库中移除吗？\n\n注意：文件本身不会被删除，只是从图库中移除。`
      )
    ) {
      return;
    }

    try {
      const response = await galleryApi.removeFromGallery(
        galleryType,
        file.uuid
      );

      if (response.status === 200 && response.data?.code === 'success') {
        alert('已从图库中移除');
        fetchFiles(pageIndex);
      } else if (response.status === 400) {
        const errorMessage = response.data?.message || '移除失败';
        alert(errorMessage);
      } else {
        const errorMessage = response.data?.message || '移除失败，请稍后重试';
        alert(errorMessage);
      }
    } catch (error) {
      console.error('移除文件失败:', error);
      if ((error as Error & { response?: { status?: number } }).response) {
        const status = (error as Error & { response?: { status?: number } })
          .response.status;
        const errorMessage =
          (error as Error & { response?: { data?: { message?: string } } })
            .response.data?.message || '移除失败';

        if (status === 400) {
          alert(errorMessage);
        } else if (status === 401) {
          alert('登录已过期，请重新登录');
        } else if (status === 500) {
          alert('服务器内部错误，请稍后重试');
        } else {
          alert(`移除失败: ${errorMessage}`);
        }
      } else if (error instanceof Error && error.message === 'Network Error') {
        alert('网络错误，请检查网络连接');
      } else {
        alert('移除失败，请稍后重试');
      }
    }
  };

  // 处理插入文件到CAD编辑器
  const handleInsertFile = async (file: GalleryFile) => {
    try {
      // 图块库：使用 Mx_Insert 插入图块
      if (galleryType === 'blocks') {
        // 通过 nodeId 获取 mxweb 文件 URL
        const mxwebFileUrl = await galleryApi.getMxwebFileUrlByNodeId(file.nodeId);

        // 使用 MxFun.sendStringToExecute 插入图块
        MxFun.sendStringToExecute('Mx_Insert', {
          filePath: mxwebFileUrl,
          name: file.filename,
          hash: file.nodeId,
          isBlockLibrary: true,
        });

        console.log('插入图块:', file.filename, mxwebFileUrl);
      }
      // 图纸库：调用 onInsertFile 打开图纸
      else if (galleryType === 'drawings') {
        if (onInsertFile) {
          onInsertFile({
            nodeId: file.nodeId,
            filename: file.filename,
          });
        } else {
          console.log('打开图纸:', file);
          alert(`打开图纸: ${file.filename}`);
        }
      }
    } catch (error) {
      console.error('操作失败:', error);
      alert(`${galleryType === 'blocks' ? '插入图块' : '打开图纸'}失败: ${file.filename}`);
    }
  };

  return (
    <>
      {/* 侧边栏 */}
      <div
        ref={sidebarRef}
        className={`bg-[#1E2129] text-white flex flex-col transition-all duration-200 ease-in-out ${
          isCollapsed ? 'w-0 overflow-hidden' : ''
        }`}
        style={{ width: isCollapsed ? 0 : width }}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#4A5568]">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-[#4F46E5]" />
            <span className="font-semibold text-sm text-[#E2E8F0]">
              {galleryType === 'drawings' ? '图纸库' : '图块库'}
            </span>
          </div>
        </div>

        {/* 图库类型切换 */}
        <div className="flex border-b border-[#4A5568]">
          <button
            onClick={() => setGalleryType('drawings')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              galleryType === 'drawings'
                ? 'bg-[#1A202C] text-[#E2E8F0]'
                : 'text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#333A47]'
            }`}
          >
            <FileText className="w-4 h-4 mx-auto mb-1" />
            图纸库
          </button>
          <button
            onClick={() => setGalleryType('blocks')}
            className={`flex-1 py-2 text-sm font-medium transition-colors ${
              galleryType === 'blocks'
                ? 'bg-[#1A202C] text-[#E2E8F0]'
                : 'text-[#94A3B8] hover:text-[#E2E8F0] hover:bg-[#333A47]'
            }`}
          >
            <Box className="w-4 h-4 mx-auto mb-1" />
            图块库
          </button>
        </div>

        {/* 搜索框 */}
        <div className="px-3 py-2 border-b border-[#4A5568]">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-[#94A3B8] w-4 h-4" />
            <input
              type="text"
              placeholder="搜索文件..."
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              className="w-full pl-8 pr-3 py-1.5 bg-[#252B3A] border border-[#4A5568] rounded text-sm text-[#E2E8F0] placeholder-[#94A3B8] focus:outline-none focus:ring-1 focus:ring-[#4F46E5] focus:border-transparent"
            />
          </div>
        </div>

        {/* 分类筛选 */}
        <div className="px-3 py-2 border-b border-[#4A5568]">
          <div className="space-y-2">
            {/* 一级分类 */}
            <select
              value={selectedFirstType}
              onChange={(e) => {
                setSelectedFirstType(Number(e.target.value));
                setSelectedSecondType(-1);
                setSelectedThirdType(-1);
              }}
              className="w-full px-2 py-1.5 bg-[#252B3A] border border-[#4A5568] rounded text-sm text-[#E2E8F0] focus:outline-none focus:ring-1 focus:ring-[#4F46E5]"
            >
              <option value={-1}>全部分类</option>
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
              className={`w-full px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#4F46E5] ${
                !selectedFirstTypeData
                  ? 'bg-[#2D3748] border border-[#4A5568] text-[#718096] cursor-not-allowed'
                  : 'bg-[#252B3A] border border-[#4A5568] text-[#E2E8F0]'
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
              disabled={!selectedSecondTypeData}
              className={`w-full px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-1 focus:ring-[#4F46E5] ${
                !selectedSecondTypeData
                  ? 'bg-[#2D3748] border border-[#4A5568] text-[#718096] cursor-not-allowed'
                  : 'bg-[#252B3A] border border-[#4A5568] text-[#E2E8F0]'
              }`}
            >
              <option value={-1}>
                {selectedSecondTypeData
                  ? `全部${selectedSecondTypeData.name}`
                  : '请先选择二级分类'}
              </option>
              {thirdLevelTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 文件列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading && files.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-[#4F46E5] animate-spin" />
            </div>
          ) : files.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-[#94A3B8]">
              {galleryType === 'drawings' ? (
                <FileText className="w-10 h-10 mb-2 opacity-50" />
              ) : (
                <Box className="w-10 h-10 mb-2 opacity-50" />
              )}
              <p className="text-xs text-center px-4">
                {searchKeyword ? '未找到匹配的文件' : '暂无文件'}
              </p>
            </div>
          ) : (
            <>
              {/* 文件网格 */}
              <div className="grid grid-cols-2 gap-2 p-2">
                {files.map((file) => (
                  <div
                    key={file.uuid}
                    className="group relative bg-[#252B3A] rounded overflow-hidden hover:bg-[#333A47] transition-colors cursor-pointer"
                    onClick={() => handleInsertFile(file)}
                  >
                    {/* 预览图 */}
                    <div className="aspect-[4/3] bg-[#1A202C] relative overflow-hidden">
                      <img
                        src={getPreviewImageUrl(file)}
                        alt={file.filename}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform pointer-events-none"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect width="100" height="100" fill="%23374151"/%3E%3Ctext x="50" y="50" text-anchor="middle" dy=".3em" fill="%236b7280" font-size="12"%3E无预览%3C/text%3E%3C/svg%3E';
                        }}
                      />

                      {/* 悬停操作按钮 */}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1 pointer-events-none">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleInsertFile(file);
                          }}
                          className="p-1.5 bg-[#4F46E5] hover:bg-[#4338CA] rounded transition-colors pointer-events-auto"
                          title={galleryType === 'blocks' ? '插入' : '打开'}
                        >
                          <Box className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRemoveFromGallery(file);
                          }}
                          className="p-1.5 bg-[#EF4444] hover:bg-[#DC2626] rounded transition-colors pointer-events-auto"
                          title="移除"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* 文件信息 */}
                    <div className="p-1.5">
                      <p className="text-xs font-medium text-[#CBD5E0] truncate">
                        {file.filename}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-xs text-[#94A3B8] bg-[#2D3748] px-1 rounded">
                          {file.type}
                        </span>
                        <div className="flex items-center gap-0.5 text-xs text-[#94A3B8]">
                          <BookOpen className="w-3 h-3" />
                          <span>{file.lookNum}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 分页 */}
              {pagination && pagination.count > 0 && (
                <div className="px-2 py-2 border-t border-[#4A5568] flex items-center justify-between">
                  <div className="text-xs text-[#94A3B8]">
                    {pagination.index + 1} / {pagination.max}
                  </div>
                  <div className="flex gap-1">
                    <button
                      size="sm"
                      onClick={handlePreviousPage}
                      disabled={!pagination.up}
                      className={`px-2 py-1 text-xs rounded ${
                        !pagination.up
                          ? 'text-[#718096] cursor-not-allowed'
                          : 'text-[#CBD5E0] hover:bg-[#333A47]'
                      }`}
                    >
                      上一页
                    </button>
                    <button
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!pagination.down}
                      className={`px-2 py-1 text-xs rounded ${
                        !pagination.down
                          ? 'text-[#718096] cursor-not-allowed'
                          : 'text-[#CBD5E0] hover:bg-[#333A47]'
                      }`}
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 调整宽度手柄 */}
      {!isCollapsed && (
        <div
          ref={resizerRef}
          onMouseDown={handleMouseDown}
          className={`absolute top-0 w-1 h-full bg-transparent hover:bg-[#4F46E5] cursor-col-resize z-50 transition-colors ${
            isResizing ? 'bg-[#4F46E5]' : ''
          }`}
          style={{ left: width }}
        />
      )}
    </>
  );
};

export default CADEditorSidebar;